import { z } from "zod";

const runModeSchema = z.enum(["LIVE", "TEST", "DEMO"]);
const orderStateSchema = z.enum([
  "DRAFT",
  "DIAGNOSING",
  "SPECIFYING",
  "PATCHING",
  "REPLAY_VERIFYING",
  "HUMAN_VERIFYING",
  "AWAITING_PAYMENT",
  "DELIVERING",
  "DELIVERED",
  "CLOSED_NO_CHARGE",
]);

const nullableString = z.string().min(1).nullable();
const numericRate = z
  .union([z.number(), z.string().min(1)])
  .transform((value, context) => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      context.addIssue({
        code: "custom",
        message: "Expected a finite numeric rate",
      });
      return z.NEVER;
    }
    return parsed;
  });

export const talosOrderRowSchema = z.object({
  id: z.string().uuid(),
  public_reference: z.string().min(1).max(64),
  version: z.number().int().nonnegative(),
  mode: runModeSchema,
  state: orderStateSchema,
  deadline_at: z.string().datetime({ offset: true }),
  critical_journey: z.string().min(1),
  original_url: z.string().url(),
  repository_url: z.string().url(),
  base_sha: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: z.literal("usd"),
  max_repair_attempts: z.literal(2),
  repair_attempt: z.number().int().min(0).max(2),
  minimum_participants: z.number().int().positive(),
  minimum_completion_rate: numericRate.pipe(z.number().min(0).max(1)),
  minimum_absolute_lift: numericRate.pipe(z.number().gt(0).max(1)),
  patch_spec_id: nullableString,
  patch_spec_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  patch_spec_model_id: nullableString,
  candidate_sha: nullableString,
  candidate_preview_url: z.string().url().nullable(),
  replay_project_id: nullableString,
  baseline_study_id: nullableString,
  holdout_study_id: nullableString,
  certificate_id: nullableString,
  payment_intent_id: nullableString,
  payment_livemode: z.boolean().nullable(),
  delivery_receipt_id: nullableString,
  close_reason: nullableString,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const talosOrderEventRowSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  sequence: z.number().int().positive(),
  event_type: z.string().min(1),
  provider: nullableString,
  provider_event_id: nullableString,
  mode: runModeSchema,
  occurred_at: z.string().datetime({ offset: true }),
  recorded_at: z.string().datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown()),
});

export type TalosOrderRow = z.infer<typeof talosOrderRowSchema>;
export type TalosOrderEventRow = z.infer<typeof talosOrderEventRowSchema>;
export type TalosRunMode = z.infer<typeof runModeSchema>;
export type TalosOrderState = z.infer<typeof orderStateSchema>;

export interface TalosLedgerEvent {
  id: string;
  sequence: number;
  type: string;
  provider: string | null;
  providerEventId: string | null;
  mode: TalosRunMode;
  occurredAt: string;
  recordedAt: string;
  evidence: Record<string, unknown>;
}

export interface TalosOrderReadModel {
  schemaVersion: "2026-08-15";
  provenance: {
    source: "INSFORGE_DATABASE" | "DEMO_FIXTURE";
    mode: TalosRunMode;
    isLive: boolean;
    disclosure: string;
    fallbackReason?: "DATABASE_UNCONFIGURED" | "DATABASE_UNAVAILABLE";
  };
  order: {
    id: string;
    version: number;
    mode: TalosRunMode;
    state: TalosOrderState;
    createdAt: string;
    updatedAt: string;
    deadlineAt: string;
    contract: {
      criticalJourney: string;
      originalUrl: string;
      repositoryUrl: string;
      baseSha: string;
      amountCents: number;
      currency: "usd";
      maxRepairAttempts: 2;
      minimumParticipants: number;
      minimumCompletionRate: number;
      minimumAbsoluteLift: number;
    };
    repair: {
      attempt: number;
      patchSpecId: string | null;
      patchSpecSha256: string | null;
      patchSpecModelId: string | null;
      candidateSha: string | null;
      candidatePreviewUrl: string | null;
    };
    evidence: {
      replayProjectId: string | null;
      baselineStudyId: string | null;
      holdoutStudyId: string | null;
      certificateId: string | null;
    };
    payment: {
      status: "LOCKED" | "LINK_RELEASED" | "CONFIRMED" | "NOT_CHARGED";
      livemode: boolean | null;
    };
    delivery: {
      receiptId: string | null;
    };
    closeReason: string | null;
  };
  events: TalosLedgerEvent[];
}
