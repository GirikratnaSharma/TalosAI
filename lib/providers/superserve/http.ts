import { z } from "zod";

import { providerErrorSchema } from "./schemas";
import {
  SuperserveProviderError,
  type SuperserveFetch,
  type SuperserveReceiptOperation,
} from "./types";

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

interface SuperserveRequestInput {
  readonly operation: SuperserveReceiptOperation;
  readonly url: URL;
  readonly method: "GET" | "POST" | "DELETE";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly expectedStatuses: readonly number[];
  readonly retryable: boolean;
  readonly fetchImpl: SuperserveFetch;
  readonly signal?: AbortSignal;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}

export interface SuperserveHttpResponse {
  readonly status: number;
  readonly bytes: Uint8Array;
}

function makeRequestSignal(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  operation: SuperserveReceiptOperation,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    await response.body?.cancel();
    throw new SuperserveProviderError({
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
    if (length > maxBytes) {
      await reader.cancel();
      throw new SuperserveProviderError({
        code: "RESPONSE_TOO_LARGE",
        operation,
        status: response.status,
      });
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function providerCodeFrom(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength === 0) return undefined;
  try {
    const parsed = providerErrorSchema.safeParse(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    return parsed.success ? parsed.data.error?.code : undefined;
  } catch {
    return undefined;
  }
}

function backoffMs(attempt: number, random: () => number): number {
  return Math.min(2_000, 100 * 2 ** (attempt - 1) + Math.floor(random() * 75));
}

export async function requestSuperserve(
  input: SuperserveRequestInput,
): Promise<SuperserveHttpResponse> {
  const maxAttempts = input.retryable ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const requestSignal = makeRequestSignal(input.timeoutMs, input.signal);
    let response: Response;

    try {
      response = await input.fetchImpl(input.url, {
        method: input.method,
        signal: requestSignal.signal,
        headers: {
          Accept: "application/json",
          ...input.headers,
          ...(input.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
      });
    } catch {
      requestSignal.cleanup();
      if (input.signal?.aborted) {
        throw new SuperserveProviderError({
          code: "REQUEST_ABORTED",
          operation: input.operation,
        });
      }
      if (attempt < maxAttempts) {
        await input.sleep(backoffMs(attempt, input.random));
        continue;
      }
      throw new SuperserveProviderError({
        code: requestSignal.signal.aborted ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
        operation: input.operation,
      });
    }

    if (
      input.retryable &&
      TRANSIENT_STATUSES.has(response.status) &&
      attempt < maxAttempts
    ) {
      requestSignal.cleanup();
      await response.body?.cancel();
      await input.sleep(backoffMs(attempt, input.random));
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBody(
        response,
        input.maxResponseBytes,
        input.operation,
      );
    } catch (error) {
      if (input.signal?.aborted) {
        throw new SuperserveProviderError({
          code: "REQUEST_ABORTED",
          operation: input.operation,
          status: response.status,
        });
      }
      if (requestSignal.signal.aborted) {
        throw new SuperserveProviderError({
          code: "REQUEST_TIMEOUT",
          operation: input.operation,
          status: response.status,
        });
      }
      throw error;
    } finally {
      requestSignal.cleanup();
    }

    if (!input.expectedStatuses.includes(response.status)) {
      throw new SuperserveProviderError({
        code: "PROVIDER_REJECTED",
        operation: input.operation,
        status: response.status,
        providerCode: providerCodeFrom(bytes),
      });
    }

    return { status: response.status, bytes };
  }

  throw new SuperserveProviderError({
    code: "NETWORK_ERROR",
    operation: input.operation,
  });
}

export function parseSuperserveJson<TSchema extends z.ZodType>(
  response: SuperserveHttpResponse,
  operation: SuperserveReceiptOperation,
  schema: TSchema,
): z.output<TSchema> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(response.bytes));
  } catch {
    throw new SuperserveProviderError({
      code: "INVALID_JSON",
      operation,
      status: response.status,
    });
  }

  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new SuperserveProviderError({
      code: "INVALID_RESPONSE",
      operation,
      status: response.status,
    });
  }
  return parsed.data;
}
