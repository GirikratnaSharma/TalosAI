import { z } from "zod";

import { FIXTURE_WARNING, PROVIDER_NAMES } from "./core";

export const receiptIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const receiptTimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Expected an ISO-compatible timestamp.",
);

export const receiptArtifactSchema = z
  .object({
    kind: z.enum([
      "project",
      "snapshot",
      "bug",
      "patch",
      "patch_spec",
      "cohort",
      "certification",
      "payment",
      "workflow",
      "release",
    ]),
    id: receiptIdentifierSchema,
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strip();

const commonReceiptShape = {
  schemaVersion: z.literal(1),
  receiptId: receiptIdentifierSchema,
  requestId: receiptIdentifierSchema,
  recordedAt: receiptTimestampSchema,
  idempotencyKey: receiptIdentifierSchema.optional(),
  artifacts: z.array(receiptArtifactSchema).max(20).default([]),
};

function makeReceiptSchema<
  TProvider extends (typeof PROVIDER_NAMES)[number],
  TOperations extends readonly [string, ...string[]],
>(provider: TProvider, operations: TOperations) {
  const operationSchema = z.enum(operations);

  return z.discriminatedUnion("mode", [
    z
      .object({
        ...commonReceiptShape,
        provider: z.literal(provider),
        operation: operationSchema,
        mode: z.literal("live"),
        evidenceSource: z.literal("provider"),
      })
      .strip(),
    z
      .object({
        ...commonReceiptShape,
        provider: z.literal(provider),
        operation: operationSchema,
        mode: z.literal("fixture"),
        evidenceSource: z.literal("fixture"),
        fixtureId: receiptIdentifierSchema,
        warning: z.literal(FIXTURE_WARNING),
      })
      .strip(),
  ]);
}

export const REPLAY_OPERATIONS = [
  "create_project",
  "capture_authoritative_snapshot",
  "get_bug",
  "mark_fixed",
] as const;

export const SUPERSERVE_OPERATIONS = [
  "run_repair",
  "destroy_sandbox",
] as const;

export const PIONEER_OPERATIONS = ["compile_patch_spec"] as const;

export const TERAC_OPERATIONS = [
  "run_baseline",
  "run_holdout",
  "get_cohort_result",
] as const;

export const STRIPE_OPERATIONS = [
  "create_post_certification_payment_link",
  "verify_signed_webhook",
  "retrieve_payment",
] as const;

export const RENDER_OPERATIONS = [
  "start_workflow",
  "get_workflow_run",
] as const;

export const BAND_OPERATIONS = [
  "request_release_decision",
  "get_release_decision",
] as const;

export const replayReceiptSchema = makeReceiptSchema(
  "replay",
  REPLAY_OPERATIONS,
);
export const superserveReceiptSchema = makeReceiptSchema(
  "superserve",
  SUPERSERVE_OPERATIONS,
);
export const pioneerReceiptSchema = makeReceiptSchema(
  "pioneer",
  PIONEER_OPERATIONS,
);
export const teracReceiptSchema = makeReceiptSchema("terac", TERAC_OPERATIONS);
export const stripeReceiptSchema = makeReceiptSchema(
  "stripe",
  STRIPE_OPERATIONS,
);
export const renderReceiptSchema = makeReceiptSchema(
  "render",
  RENDER_OPERATIONS,
);
export const bandReceiptSchema = makeReceiptSchema("band", BAND_OPERATIONS);

export const providerReceiptSchema = z.union([
  replayReceiptSchema,
  superserveReceiptSchema,
  pioneerReceiptSchema,
  teracReceiptSchema,
  stripeReceiptSchema,
  renderReceiptSchema,
  bandReceiptSchema,
]);

export type ReplayReceipt = z.infer<typeof replayReceiptSchema>;
export type SuperserveReceipt = z.infer<typeof superserveReceiptSchema>;
export type PioneerReceipt = z.infer<typeof pioneerReceiptSchema>;
export type TeracReceipt = z.infer<typeof teracReceiptSchema>;
export type StripeReceipt = z.infer<typeof stripeReceiptSchema>;
export type RenderReceipt = z.infer<typeof renderReceiptSchema>;
export type BandReceipt = z.infer<typeof bandReceiptSchema>;
export type ProviderReceipt = z.infer<typeof providerReceiptSchema>;

export interface ProviderOperationMap {
  replay: (typeof REPLAY_OPERATIONS)[number];
  superserve: (typeof SUPERSERVE_OPERATIONS)[number];
  pioneer: (typeof PIONEER_OPERATIONS)[number];
  terac: (typeof TERAC_OPERATIONS)[number];
  stripe: (typeof STRIPE_OPERATIONS)[number];
  render: (typeof RENDER_OPERATIONS)[number];
  band: (typeof BAND_OPERATIONS)[number];
}

export type ReceiptFor<
  TProvider extends keyof ProviderOperationMap,
  TMode extends ProviderReceipt["mode"],
  TOperation extends ProviderOperationMap[TProvider],
> = Extract<
  ProviderReceipt,
  { provider: TProvider; mode: TMode }
> & { operation: TOperation };

export type ReceiptArtifact = z.infer<typeof receiptArtifactSchema>;

interface FixtureReceiptInput<
  TProvider extends keyof ProviderOperationMap,
  TOperation extends ProviderOperationMap[TProvider],
> {
  readonly provider: TProvider;
  readonly operation: TOperation;
  readonly requestId: string;
  readonly fixtureId: string;
  readonly recordedAt: string;
  readonly receiptId?: string;
  readonly idempotencyKey?: string;
  readonly artifacts?: readonly ReceiptArtifact[];
}

/**
 * Converts an untrusted provider payload into the public receipt allowlist.
 * Unknown fields are stripped at every object boundary, so raw payloads,
 * authorization headers, signatures, logs, and customer data cannot leak into
 * the proof ledger by accident.
 */
export function sanitizeProviderReceipt(input: unknown): ProviderReceipt {
  return providerReceiptSchema.parse(input);
}

export function createFixtureReceipt<
  TProvider extends keyof ProviderOperationMap,
  TOperation extends ProviderOperationMap[TProvider],
>(
  input: FixtureReceiptInput<TProvider, TOperation>,
): ReceiptFor<TProvider, "fixture", TOperation> {
  const receipt = sanitizeProviderReceipt({
    schemaVersion: 1,
    provider: input.provider,
    operation: input.operation,
    mode: "fixture",
    evidenceSource: "fixture",
    receiptId:
      input.receiptId ??
      input.provider + ":" + input.operation + ":" + input.requestId,
    requestId: input.requestId,
    recordedAt: input.recordedAt,
    idempotencyKey: input.idempotencyKey,
    artifacts: input.artifacts ?? [],
    fixtureId: input.fixtureId,
    warning: FIXTURE_WARNING,
  });

  return receipt as ReceiptFor<TProvider, "fixture", TOperation>;
}
