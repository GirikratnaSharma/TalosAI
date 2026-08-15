import { createHash } from "node:crypto";

import type { z } from "zod";

import type {
  ProviderFetch,
  SanitizedHttpReceipt,
} from "../http";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

export type PioneerHttpErrorCode =
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE";

export class PioneerHttpError extends Error {
  readonly code: PioneerHttpErrorCode;
  readonly status?: number;
  readonly receipt?: SanitizedHttpReceipt;

  constructor(input: {
    code: PioneerHttpErrorCode;
    status?: number;
    receipt?: SanitizedHttpReceipt;
  }) {
    super(
      input.status === undefined
        ? `pioneer.compile_patch_spec failed (${input.code})`
        : `pioneer.compile_patch_spec failed (${input.code}, HTTP ${input.status})`,
    );
    this.name = "PioneerHttpError";
    this.code = input.code;
    this.status = input.status;
    this.receipt = input.receipt;
  }
}

interface PioneerRequestInput<TSchema extends z.ZodType> {
  readonly url: URL;
  readonly apiKey: string;
  readonly body: unknown;
  readonly schema: TSchema;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: ProviderFetch;
}

function positiveBoundedInteger(
  value: number,
  field: "timeoutMs" | "maxResponseBytes",
): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    await response.body?.cancel();
    throw new PioneerHttpError({
      code: "RESPONSE_TOO_LARGE",
      status: response.status,
    });
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new PioneerHttpError({
        code: "RESPONSE_TOO_LARGE",
        status: response.status,
      });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function makeReceipt(
  url: URL,
  response: Response,
  bytes: Uint8Array,
): SanitizedHttpReceipt {
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    undefined;

  return Object.freeze({
    method: "POST",
    endpoint: url.pathname,
    status: response.status,
    observedAt: new Date().toISOString(),
    responseSha256: createHash("sha256").update(bytes).digest("hex"),
    ...(requestId ? { requestId } : {}),
  });
}

export async function requestPioneerInference<
  TSchema extends z.ZodType,
>(input: PioneerRequestInput<TSchema>): Promise<{
  readonly data: z.output<TSchema>;
  readonly receipt: SanitizedHttpReceipt;
}> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new TypeError("Pioneer apiKey cannot be empty");

  const timeoutMs = positiveBoundedInteger(
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "timeoutMs",
  );
  const maximumBytes = positiveBoundedInteger(
    input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    "maxResponseBytes",
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await (input.fetchImpl ?? fetch)(input.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(input.body),
    });
  } catch {
    clearTimeout(timeout);
    throw new PioneerHttpError({
      code: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBody(response, maximumBytes);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PioneerHttpError({
        code: "TIMEOUT",
        status: response.status,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const receipt = makeReceipt(input.url, response, bytes);
  if (!response.ok) {
    throw new PioneerHttpError({
      code: "HTTP_ERROR",
      status: response.status,
      receipt,
    });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PioneerHttpError({
      code: "INVALID_JSON",
      status: response.status,
      receipt,
    });
  }

  const parsed = input.schema.safeParse(decoded);
  if (!parsed.success) {
    throw new PioneerHttpError({
      code: "INVALID_RESPONSE",
      status: response.status,
      receipt,
    });
  }
  return { data: parsed.data, receipt };
}
