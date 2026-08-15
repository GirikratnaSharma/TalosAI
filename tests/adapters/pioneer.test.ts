import { describe, expect, it } from "vitest";

import {
  createLivePioneerAdapter,
  createManifestAllowedFileResolver,
} from "../../lib/adapters/pioneer";
import {
  computePatchSpecSha256,
  reduce,
  type Command,
} from "../../lib/domain";
import {
  PioneerPatchSpecClient,
  type CompilePatchSpecInput,
} from "../../lib/providers/pioneer";
import {
  event,
  makeBaseline,
  makeDiagnosingOrder,
  makeReplaySnapshot,
} from "../domain/fixtures";

const expectedBehavior = "The request is submitted";
const actualBehavior = "The button remains disabled";

function scoredSpan(source: string, text: string) {
  const start = source.indexOf(text);
  if (start < 0) throw new Error("Expected fixture text in Pioneer input");
  return { text, confidence: 0.96, start, end: start + text.length };
}

function compileCommand(): {
  order: ReturnType<typeof makeDiagnosingOrder>;
  command: Extract<Command, { type: "COMPILE_PATCH_SPEC" }>;
} {
  const reduction = reduce(
    makeDiagnosingOrder(),
    event({
      type: "DIAGNOSIS_COMPLETED",
      replay: makeReplaySnapshot(),
      baseline: makeBaseline(),
      repairRequired: true,
    }),
  );
  const command = reduction.commands[0];
  if (!command || command.type !== "COMPILE_PATCH_SPEC") {
    throw new Error("Expected a compile command");
  }
  return { order: reduction.order, command };
}

function providerInput(orderId: string): CompilePatchSpecInput {
  return {
    orderId,
    criticalJourney: {
      name: "Submit request",
      route: "/request",
      selector: "#submit",
      expectedBehavior,
    },
    evidence: [
      {
        evidenceId: "bug_001",
        title: "Submission button remains disabled",
        route: "/request",
        selector: "#submit",
        expectedBehavior,
        actualBehavior,
        reproductionSteps: ["Open form", "Submit"],
      },
    ],
  };
}

function liveClientWithMaliciousFileSuggestion() {
  return new PioneerPatchSpecClient({
    apiKey: "pioneer-test-key",
    fetchImpl: async (_request, init) => {
      const body = JSON.parse(String(init?.body)) as {
        model_id: string;
        text: string;
      };
      return Response.json({
        type: "encoder",
        inference_id: "inf_bridge_1",
        result: {
          bug_class: {
            label: "form_submission_blocked",
            confidence: 0.97,
          },
          autofixability: {
            label: "safe_to_autofix",
            confidence: 0.98,
          },
          // This untrusted suggestion is deliberately outside Pioneer's
          // response allowlist and must never reach the domain specification.
          requested_files: ["lib/server/payments/stripe-webhook.ts"],
          patch_spec: [
            {
              route: scoredSpan(body.text, "/request"),
              selector: scoredSpan(body.text, "#submit"),
              expected_behavior: scoredSpan(body.text, expectedBehavior),
              actual_behavior: scoredSpan(body.text, actualBehavior),
              evidence_ids: [scoredSpan(body.text, "bug_001")],
              changes: [
                {
                  file_path: "lib/server/payments/stripe-webhook.ts",
                },
              ],
            },
          ],
        },
        model_id: body.model_id,
        latency_ms: 14,
        token_usage: 220,
        model_used: body.model_id,
      });
    },
  });
}

describe("live Pioneer domain bridge", () => {
  it("flows one live result into PATCH_SPEC_COMPILED using only Talos file scope", async () => {
    const { order, command } = compileCommand();
    const resolver = createManifestAllowedFileResolver({
      resolverId: "route-index-v1",
      repositoryUrl: order.contract.repositoryUrl,
      resolvedAtSha: command.evidence.replayObservedBuildSha,
      targets: [
        {
          route: "/request",
          selector: "#submit",
          bugClasses: ["FORM_SUBMISSION"],
          changes: [
            {
              filePath: "app/request-form.tsx",
              intent: "Repair the repository-indexed submit handler",
            },
          ],
        },
      ],
    });
    const adapter = createLivePioneerAdapter({
      client: liveClientWithMaliciousFileSuggestion(),
    });

    const execution = await adapter.compilePatchSpec({
      providerInput: providerInput(command.orderId),
      command,
      repositoryUrl: order.contract.repositoryUrl,
      resolver,
      eventId: "event_pioneer_bridge_1",
      compiledAt: "2026-08-15T11:10:00.000Z",
    });

    expect(execution.mode).toBe("live");
    expect(execution.data.type).toBe("PATCH_SPEC_COMPILED");
    expect(execution.data.spec.bugClass).toBe("FORM_SUBMISSION");
    expect(execution.data.spec.changes).toEqual([
      {
        filePath: "app/request-form.tsx",
        intent: "Repair the repository-indexed submit handler",
      },
    ]);
    expect(JSON.stringify(execution.data)).not.toContain(
      "lib/server/payments",
    );
    expect(execution.data.spec.specSha256).toBe(
      computePatchSpecSha256(execution.data.spec),
    );
    expect(execution.receipt.artifacts).toEqual([
      {
        kind: "patch_spec",
        id: "pioneer:inf_bridge_1",
        sha256: execution.data.spec.specSha256,
      },
    ]);

    const reduced = reduce(order, execution.data);
    expect(reduced.order.state).toBe("PATCHING");
    expect(reduced.order.repair.patchSpec?.specId).toBe(
      "pioneer:inf_bridge_1",
    );
  });

  it("cannot use a safe-to-autofix label to select an undeclared target", async () => {
    const { order, command } = compileCommand();
    const resolver = createManifestAllowedFileResolver({
      resolverId: "route-index-v1",
      repositoryUrl: order.contract.repositoryUrl,
      resolvedAtSha: command.evidence.replayObservedBuildSha,
      targets: [
        {
          route: "/another-route",
          selector: "#submit",
          bugClasses: ["FORM_SUBMISSION"],
          changes: [
            {
              filePath: "app/another.tsx",
              intent: "Unrelated predeclared target",
            },
          ],
        },
      ],
    });
    const adapter = createLivePioneerAdapter({
      client: liveClientWithMaliciousFileSuggestion(),
    });

    await expect(
      adapter.compilePatchSpec({
        providerInput: providerInput(command.orderId),
        command,
        repositoryUrl: order.contract.repositoryUrl,
        resolver,
        eventId: "event_pioneer_bridge_2",
        compiledAt: "2026-08-15T11:10:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "REPOSITORY_TARGET_NOT_FOUND" });
  });
});
