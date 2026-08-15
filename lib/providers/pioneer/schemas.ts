import { z } from "zod";

export const SUPPORTED_PATCH_BUG_CLASSES = [
  "checkout_button_no_action",
  "form_submission_blocked",
  "checkout_request_not_created",
  "payment_webhook_broken",
  "route_transition_broken",
] as const;

export const supportedPatchBugClassSchema = z.enum(
  SUPPORTED_PATCH_BUG_CLASSES,
);

export const pioneerModelIdSchema = z
  .string()
  .regex(
    /^fastino\/gliner2-(?:base|large|multi|multi-large)-v1$/,
    "Pioneer model must be an official GLiNER2 v1 encoder model",
  );

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const routeSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine(
    (value) =>
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("..") &&
      !/\s/.test(value),
    "route must be a relative application route",
  );

const selectorSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\r\n]/.test(value), "selector must be one line");

const behaviorSchema = z.string().trim().min(1).max(5_000);

export const replayPatchEvidenceSchema = z
  .object({
    evidenceId: identifierSchema,
    title: z.string().trim().min(1).max(1_000),
    route: routeSchema.optional(),
    selector: selectorSchema.optional(),
    expectedBehavior: behaviorSchema,
    actualBehavior: behaviorSchema,
    reproductionSteps: z
      .array(z.string().trim().min(1).max(2_000))
      .min(1)
      .max(20),
  })
  .strict();

export const criticalJourneySchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    route: routeSchema,
    selector: selectorSchema.optional(),
    expectedBehavior: behaviorSchema,
  })
  .strict();

export const compilePatchSpecInputSchema = z
  .object({
    orderId: identifierSchema,
    criticalJourney: criticalJourneySchema,
    evidence: z.array(replayPatchEvidenceSchema).min(1).max(12),
    minimumConfidence: z.number().min(0.5).max(0.99).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.evidence.map((item) => item.evidenceId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Replay evidence IDs must be unique",
      });
    }
  });

export const pioneerPatchClassificationSchema = z
  .object({
    schemaVersion: z.literal(1),
    bugClass: supportedPatchBugClassSchema,
    route: routeSchema,
    selector: selectorSchema.nullable(),
    expectedBehavior: behaviorSchema,
    actualBehavior: behaviorSchema,
    evidenceIds: z.array(identifierSchema).min(1).max(12),
    confidence: z.number().min(0).max(1),
    safeToAutofix: z.literal(true),
    inferenceId: identifierSchema,
    modelId: pioneerModelIdSchema,
  })
  .strict();

const scoredSpanSchema = z
  .object({
    text: z.string().min(1).max(5_000),
    confidence: z.number().min(0).max(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strip()
  .refine((value) => value.end > value.start, {
    message: "span end must be after start",
  });

const singleScoredSpanSchema = z.union([
  scoredSpanSchema,
  z.array(scoredSpanSchema).length(1).transform(([span]) => span),
]);

const classificationPredictionSchema = z
  .object({
    label: z.string().min(1).max(160),
    confidence: z.number().min(0).max(1),
  })
  .strip();

const patchRecordSchema = z
  .object({
    route: singleScoredSpanSchema,
    selector: singleScoredSpanSchema.optional(),
    expected_behavior: singleScoredSpanSchema,
    actual_behavior: singleScoredSpanSchema,
    evidence_ids: z.array(scoredSpanSchema).min(1).max(12),
  })
  .strip();

export const pioneerInferenceResponseSchema = z
  .object({
    type: z.literal("encoder"),
    inference_id: identifierSchema,
    result: z
      .object({
        bug_class: classificationPredictionSchema,
        autofixability: classificationPredictionSchema,
        patch_spec: z.array(patchRecordSchema).length(1),
      })
      .strip(),
    model_id: z.string().min(1).max(300),
    latency_ms: z.number().nonnegative(),
    token_usage: z.number().int().nonnegative(),
    model_used: pioneerModelIdSchema,
  })
  .strip();

export type SupportedPatchBugClass = z.infer<
  typeof supportedPatchBugClassSchema
>;
export type ReplayPatchEvidence = z.infer<typeof replayPatchEvidenceSchema>;
export type CriticalJourney = z.infer<typeof criticalJourneySchema>;
export type CompilePatchSpecInput = z.infer<
  typeof compilePatchSpecInputSchema
>;
export type PioneerPatchClassification = z.infer<
  typeof pioneerPatchClassificationSchema
>;
export type PioneerInferenceResponse = z.infer<
  typeof pioneerInferenceResponseSchema
>;
