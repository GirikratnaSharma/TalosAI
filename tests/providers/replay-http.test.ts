import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ProviderHttpError,
  requestValidatedJson,
  type ProviderFetch,
} from "../../lib/providers/http";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("provider HTTP boundary", () => {
  it("returns only a body hash and allowlisted metadata in receipts", async () => {
    const token = "lqa_never-serialize-this";
    const rawSecret = "provider-body-secret";
    const result = await requestValidatedJson({
      operation: "replay.test",
      url: new URL("https://qa.replay.io/api/v1/projects?secret=query"),
      method: "GET",
      bearerToken: token,
      schema: z.object({ ok: z.literal(true) }).passthrough(),
      fetchImpl: async () =>
        jsonResponse(
          { ok: true, rawSecret },
          { headers: { "x-request-id": "request_123" } },
        ),
    });

    expect(result.receipt).toMatchObject({
      method: "GET",
      endpoint: "/api/v1/projects",
      status: 200,
      requestId: "request_123",
    });
    expect(result.receipt.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    const serializedReceipt = JSON.stringify(result.receipt);
    expect(serializedReceipt).not.toContain(token);
    expect(serializedReceipt).not.toContain(rawSecret);
    expect(serializedReceipt).not.toContain("query");
  });

  it("fails closed on HTTP errors without echoing the response or token", async () => {
    const token = "lqa_sensitive-token";
    const responseSecret = "sensitive-upstream-body";

    await expect(
      requestValidatedJson({
        operation: "replay.create_project",
        url: new URL("https://qa.replay.io/api/v1/projects"),
        method: "POST",
        bearerToken: token,
        body: { name: "test" },
        schema: z.object({ ok: z.literal(true) }),
        fetchImpl: async () =>
          jsonResponse(
            { error: responseSecret },
            { status: 401, statusText: "Unauthorized" },
          ),
      }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", status: 401 });

    try {
      await requestValidatedJson({
        operation: "replay.create_project",
        url: new URL("https://qa.replay.io/api/v1/projects"),
        method: "POST",
        bearerToken: token,
        schema: z.object({ ok: z.literal(true) }),
        fetchImpl: async () =>
          jsonResponse({ error: responseSecret }, { status: 500 }),
      });
    } catch (error) {
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain(responseSecret);
      expect(JSON.stringify(error)).not.toContain(token);
      expect(JSON.stringify(error)).not.toContain(responseSecret);
    }
  });

  it("times out stalled requests", async () => {
    const stalledFetch: ProviderFetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });

    await expect(
      requestValidatedJson({
        operation: "replay.get_status",
        url: new URL("https://qa.replay.io/api/v1/projects/p/status"),
        method: "GET",
        bearerToken: "lqa_test",
        schema: z.object({}),
        timeoutMs: 5,
        fetchImpl: stalledFetch,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects oversized and schema-invalid responses", async () => {
    await expect(
      requestValidatedJson({
        operation: "replay.get_bug",
        url: new URL("https://qa.replay.io/api/v1/bugs/bug_1"),
        method: "GET",
        bearerToken: "lqa_test",
        schema: z.object({ bug_id: z.string() }),
        maxResponseBytes: 8,
        fetchImpl: async () => jsonResponse({ bug_id: "bug_1" }),
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });

    await expect(
      requestValidatedJson({
        operation: "replay.get_bug",
        url: new URL("https://qa.replay.io/api/v1/bugs/bug_1"),
        method: "GET",
        bearerToken: "lqa_test",
        schema: z.object({ bug_id: z.string() }),
        fetchImpl: async () => jsonResponse({ id: "unexpected" }),
      }),
    ).rejects.toBeInstanceOf(ProviderHttpError);
  });
});
