import { describe, expect, it, vi } from "vitest";

import {
  PioneerHttpError,
  PioneerPatchSpecClient,
  type CompilePatchSpecInput,
} from "../../lib/providers/pioneer";

const secret = "pioneer-secret-must-never-leak";
const modelId = "fastino/gliner2-large-v1";
const expectedBehavior =
  "Submitting checkout creates exactly one payment intent.";
const actualBehavior =
  "Clicking #checkout does not create a network request.";

const request: CompilePatchSpecInput = {
  orderId: "TAL-D04",
  criticalJourney: {
    name: "Complete checkout",
    route: "/checkout",
    selector: "#checkout",
    expectedBehavior,
  },
  evidence: [
    {
      evidenceId: "rpl-bug-17",
      title: "Checkout button produces no request",
      route: "/checkout",
      selector: "#checkout",
      expectedBehavior,
      actualBehavior,
      reproductionSteps: ["Open checkout", "Click the checkout button"],
    },
  ],
  minimumConfidence: 0.9,
};

type FetchBody = {
  model_id: string;
  text: string;
  schema: {
    classifications: Array<{ task: string; labels: string[] }>;
    structures: Record<string, unknown>;
  };
  threshold: number;
  include_confidence: boolean;
  include_spans: boolean;
  store: boolean;
};

function scoredSpan(source: string, text: string, confidence = 0.97) {
  const start = source.indexOf(text);
  if (start < 0) throw new Error("Test span was not present in compiler text");
  return { text, confidence, start, end: start + text.length };
}

function inferenceResponse(
  source: string,
  overrides: {
    bugClass?: string;
    bugConfidence?: number;
    autofixability?: string;
    autofixConfidence?: number;
    route?: ReturnType<typeof scoredSpan>;
    selector?: ReturnType<typeof scoredSpan> | null;
    expected?: ReturnType<typeof scoredSpan>;
    actual?: ReturnType<typeof scoredSpan>;
    evidenceIds?: Array<ReturnType<typeof scoredSpan>>;
    responseModelId?: string;
    modelUsed?: string;
  } = {},
) {
  const selector =
    overrides.selector === undefined
      ? scoredSpan(source, "#checkout")
      : overrides.selector;
  return {
    type: "encoder",
    inference_id: "inf_17",
    result: {
      bug_class: {
        label: overrides.bugClass ?? "checkout_button_no_action",
        confidence: overrides.bugConfidence ?? 0.98,
      },
      autofixability: {
        label: overrides.autofixability ?? "safe_to_autofix",
        confidence: overrides.autofixConfidence ?? 0.96,
      },
      patch_spec: [
        {
          route: overrides.route ?? scoredSpan(source, "/checkout"),
          ...(selector ? { selector } : {}),
          expected_behavior:
            overrides.expected ?? scoredSpan(source, expectedBehavior),
          actual_behavior:
            overrides.actual ?? scoredSpan(source, actualBehavior),
          evidence_ids:
            overrides.evidenceIds ?? [scoredSpan(source, "rpl-bug-17")],
        },
      ],
    },
    model_id: overrides.responseModelId ?? modelId,
    latency_ms: 42,
    token_usage: 311,
    model_used: overrides.modelUsed ?? modelId,
  };
}

function clientWithResponse(
  makeResponse: (
    body: FetchBody,
    input: string | URL | Request,
    init?: RequestInit,
  ) => unknown,
) {
  const fetchImpl = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as FetchBody;
      return Response.json(makeResponse(body, input, init), {
        headers: { "x-request-id": "req-pioneer-17" },
      });
    },
  );
  return {
    fetchImpl,
    client: new PioneerPatchSpecClient({
      apiKey: secret,
      modelId,
      projectId: "project-talos",
      fetchImpl,
    }),
  };
}

describe("Pioneer GLiNER2 patch spec compiler", () => {
  it("compiles a strict spec through the official native inference API", async () => {
    const { client, fetchImpl } = clientWithResponse((body, input, init) => {
      expect(String(input)).toBe("https://api.pioneer.ai/inference");
      const headers = new Headers(init?.headers);
      expect(headers.get("X-API-Key")).toBe(secret);
      expect(headers.get("Authorization")).toBeNull();
      expect(body).toMatchObject({
        model_id: modelId,
        threshold: 0.9,
        include_confidence: true,
        include_spans: true,
        store: true,
      });
      expect(body.schema.classifications.map((head) => head.task)).toEqual([
        "bug_class",
        "autofixability",
      ]);
      expect(body.schema.structures).toHaveProperty("patch_spec");
      return inferenceResponse(body.text);
    });

    const result = await client.compilePatchSpec(request);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.classification).toEqual({
      schemaVersion: 1,
      bugClass: "checkout_button_no_action",
      route: "/checkout",
      selector: "#checkout",
      expectedBehavior,
      actualBehavior,
      evidenceIds: ["rpl-bug-17"],
      confidence: 0.96,
      safeToAutofix: true,
      inferenceId: "inf_17",
      modelId,
    });
    expect(result.receipt).toMatchObject({
      provider: "pioneer",
      operation: "compile_patch_spec",
      endpoint: "/inference",
      status: 200,
      requestId: "req-pioneer-17",
      inferenceId: "inf_17",
      modelId,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("fails closed when any field confidence is below the policy floor", async () => {
    const { client } = clientWithResponse((body) =>
      inferenceResponse(body.text, {
        actual: scoredSpan(body.text, actualBehavior, 0.89),
      }),
    );

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      name: "PioneerPatchSpecError",
      code: "LOW_CONFIDENCE",
    });
  });

  it("fails closed when GLiNER2 classifies the patch as unsafe", async () => {
    const { client } = clientWithResponse((body) =>
      inferenceResponse(body.text, { autofixability: "block_autofix" }),
    );

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      code: "UNSAFE_TO_AUTOFIX",
    });
  });

  it("rejects a selector-less UI repair even when the model says safe", async () => {
    const { client } = clientWithResponse((body) =>
      inferenceResponse(body.text, { selector: null }),
    );

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      code: "EVIDENCE_MISMATCH",
    });
  });

  it("rejects evidence IDs that were not supplied by Replay", async () => {
    const { client } = clientWithResponse((body) =>
      inferenceResponse(body.text, {
        evidenceIds: [scoredSpan(body.text, "/checkout")],
      }),
    );

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      code: "EVIDENCE_MISMATCH",
    });
  });

  it("rejects spans that do not point back into the submitted evidence", async () => {
    const { client } = clientWithResponse((body) => {
      const response = inferenceResponse(body.text);
      response.result.patch_spec[0].route = {
        text: "/checkout",
        confidence: 0.98,
        start: 0,
        end: 9,
      };
      return response;
    });

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      code: "INVALID_SPAN",
    });
  });

  it("rejects a response served by a different model", async () => {
    const { client } = clientWithResponse((body) =>
      inferenceResponse(body.text, {
        modelUsed: "fastino/gliner2-base-v1",
      }),
    );

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      code: "INVALID_MODEL",
    });
  });

  it("Zod-rejects malformed or partial inference envelopes", async () => {
    const { client } = clientWithResponse(() => ({
      type: "encoder",
      result: {},
    }));

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      name: "PioneerHttpError",
      code: "INVALID_RESPONSE",
    });
  });

  it("times out bounded inference without exposing the API key", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const client = new PioneerPatchSpecClient({
      apiKey: secret,
      timeoutMs: 5,
      fetchImpl,
    });

    let error: unknown;
    try {
      await client.compilePatchSpec(request);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PioneerHttpError);
    expect(error).toMatchObject({ code: "TIMEOUT" });
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(String(error)).not.toContain(secret);
  });

  it("rejects oversized responses before parsing them", async () => {
    const client = new PioneerPatchSpecClient({
      apiKey: secret,
      maxResponseBytes: 64,
      fetchImpl: async () =>
        new Response("x".repeat(65), {
          status: 200,
          headers: { "content-length": "65" },
        }),
    });

    await expect(client.compilePatchSpec(request)).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
  });

  it("refuses unofficial origins and non-GLiNER models", () => {
    expect(
      () =>
        new PioneerPatchSpecClient({
          apiKey: secret,
          baseUrl: "https://pioneer.example.test",
        }),
    ).toThrow("official HTTPS API origin");
    expect(
      () =>
        new PioneerPatchSpecClient({
          apiKey: secret,
          modelId: "Qwen/Qwen3-8B",
        }),
    ).toThrow();
  });

  it("does not echo provider error bodies or credentials", async () => {
    const client = new PioneerPatchSpecClient({
      apiKey: secret,
      fetchImpl: async () =>
        Response.json(
          { detail: `${secret}: provider-side detail` },
          { status: 422 },
        ),
    });

    let error: unknown;
    try {
      await client.compilePatchSpec(request);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "HTTP_ERROR", status: 422 });
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain("provider-side detail");
  });
});
