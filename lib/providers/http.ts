import { createHash } from "node:crypto";

import type { z } from "zod";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

export type ProviderHttpErrorCode =
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE";

export interface SanitizedHttpReceipt {
  readonly method: "GET" | "POST" | "PATCH";
  readonly endpoint: string;
  readonly status: number;
  readonly observedAt: string;
  readonly responseSha256: string;
  readonly requestId?: string;
}

export class ProviderHttpError extends Error {
  readonly code: ProviderHttpErrorCode;
  readonly operation: string;
  readonly status?: number;
  readonly receipt?: SanitizedHttpReceipt;

  constructor(input: {
    code: ProviderHttpErrorCode;
    operation: string;
    status?: number;
    receipt?: SanitizedHttpReceipt;
  }) {
    super(
      input.status === undefined
        ? `${input.operation} failed (${input.code})`
        : `${input.operation} failed (${input.code}, HTTP ${input.status})`,
    );
    this.name = "ProviderHttpError";
    this.code = input.code;
    this.operation = input.operation;
    this.status = input.status;
    this.receipt = input.receipt;
  }
}

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface RequestJsonInput<TSchema extends z.ZodType> {
  readonly operation: string;
  readonly url: URL;
  readonly method: SanitizedHttpReceipt["method"];
  readonly bearerToken?: string;
  readonly schema: TSchema;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: ProviderFetch;
}

export interface ValidatedJsonResponse<T> {
  readonly data: T;
  readonly receipt: SanitizedHttpReceipt;
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

function receiptFor(
  method: SanitizedHttpReceipt["method"],
  url: URL,
  response: Response,
  bytes: Uint8Array,
): SanitizedHttpReceipt {
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    undefined;

  return Object.freeze({
    method,
    endpoint: url.pathname,
    status: response.status,
    observedAt: new Date().toISOString(),
    responseSha256: createHash("sha256").update(bytes).digest("hex"),
    ...(requestId ? { requestId } : {}),
  });
}

async function readBoundedBody(
  response: Response,
  maxResponseBytes: number,
  operation: string,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxResponseBytes
  ) {
    await response.body?.cancel();
    throw new ProviderHttpError({
      code: "RESPONSE_TOO_LARGE",
      operation,
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
    if (length > maxResponseBytes) {
      await reader.cancel();
      throw new ProviderHttpError({
        code: "RESPONSE_TOO_LARGE",
        operation,
        status: response.status,
      });
    }
    chunks.push(value);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function requestValidatedJson<TSchema extends z.ZodType>(
  input: RequestJsonInput<TSchema>,
): Promise<ValidatedJsonResponse<z.output<TSchema>>> {
  const timeoutMs = positiveBoundedInteger(
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "timeoutMs",
  );
  const maxResponseBytes = positiveBoundedInteger(
    input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    "maxResponseBytes",
  );
  const bearerToken = input.bearerToken?.trim();
  if (input.bearerToken !== undefined && !bearerToken) {
    throw new TypeError("bearerToken cannot be empty");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await (input.fetchImpl ?? fetch)(input.url, {
      method: input.method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        ...(input.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(input.body === undefined
        ? {}
        : { body: JSON.stringify(input.body) }),
    });
  } catch {
    clearTimeout(timeout);
    throw new ProviderHttpError({
      code: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
      operation: input.operation,
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBody(
      response,
      maxResponseBytes,
      input.operation,
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderHttpError({
        code: "TIMEOUT",
        operation: input.operation,
        status: response.status,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const receipt = receiptFor(input.method, input.url, response, bytes);

  if (!response.ok) {
    throw new ProviderHttpError({
      code: "HTTP_ERROR",
      operation: input.operation,
      status: response.status,
      receipt,
    });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ProviderHttpError({
      code: "INVALID_JSON",
      operation: input.operation,
      status: response.status,
      receipt,
    });
  }

  const parsed = input.schema.safeParse(decoded);
  if (!parsed.success) {
    throw new ProviderHttpError({
      code: "INVALID_RESPONSE",
      operation: input.operation,
      status: response.status,
      receipt,
    });
  }

  return { data: parsed.data, receipt };
}
