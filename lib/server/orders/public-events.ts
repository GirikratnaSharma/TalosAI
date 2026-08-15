import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const identifierSchema = z.string().min(1).max(255);
const shortTextSchema = z.string().min(1).max(500);
const longTextSchema = z.string().min(1).max(2_000);
const rateSchema = z.number().min(0).max(1);
const attemptSchema = z.union([z.literal(1), z.literal(2)]);

const intakeEvidenceSchema = z
  .object({ authorizationConfirmed: z.boolean().optional() })
  .strip();

const diagnosisEvidenceSchema = z
  .object({ repairRequired: z.boolean() })
  .strip();

const baselineEvidenceSchema = z
  .object({
    successfulParticipants: z.number().int().nonnegative(),
    participantCount: z.number().int().positive(),
    completionRate: rateSchema,
  })
  .strip();

const replayFindingEvidenceSchema = z
  .object({ finding: longTextSchema, severity: shortTextSchema })
  .strip();

const pioneerEvidenceSchema = z
  .object({
    attempt: attemptSchema,
    specId: identifierSchema,
    specSha256: sha256Schema,
    modelId: identifierSchema,
    compiler: z.literal("OPEN_WEIGHT"),
    bugClass: shortTextSchema,
    schemaValid: z.boolean(),
    charged: z.boolean(),
  })
  .strip();

const canonicalPatchSpecEvidenceSchema = z
  .object({
    spec: z
      .object({
        specId: identifierSchema,
        specSha256: sha256Schema,
        compilerProvider: z.literal("PIONEER"),
        modelKind: z.literal("OPEN_WEIGHT"),
        attempt: attemptSchema,
        bugClass: shortTextSchema,
        confidence: rateSchema,
      })
      .strip(),
  })
  .strip()
  .transform(({ spec }) => ({
    specId: spec.specId,
    specSha256: spec.specSha256,
    compilerProvider: spec.compilerProvider,
    modelKind: spec.modelKind,
    attempt: spec.attempt,
    bugClass: spec.bugClass,
    confidence: spec.confidence,
  }));

const candidateEvidenceSchema = z
  .object({
    attempt: attemptSchema,
    candidateSha: identifierSchema,
    sandboxed: z.boolean(),
  })
  .strip();

const canonicalCandidateEvidenceSchema = z
  .object({
    candidate: z
      .object({
        attempt: attemptSchema,
        sha: identifierSchema,
        previewUrl: z.string().url(),
        buildIdentityUrl: z.string().url(),
        deployedAt: z.string().datetime({ offset: true }),
        buildPassed: z.literal(true),
        changedFiles: z.array(z.string().min(1).max(500)).max(100),
      })
      .strip(),
  })
  .strip()
  .transform(({ candidate }) => ({
    attempt: candidate.attempt,
    candidateSha: candidate.sha,
    previewUrl: candidate.previewUrl,
    buildIdentityUrl: candidate.buildIdentityUrl,
    deployedAt: candidate.deployedAt,
    buildPassed: candidate.buildPassed,
    changedFiles: candidate.changedFiles,
  }));

const releaseBlockedEvidenceSchema = z
  .object({
    attempt: attemptSchema,
    verdict: z.literal("DIRTY"),
    reason: longTextSchema,
  })
  .strip();

const replayCleanEvidenceSchema = z
  .object({
    verdict: z.literal("CLEAN"),
    candidateSha: identifierSchema,
    openFindings: z.literal(0),
  })
  .strip();

const replaySyncEvidenceSchema = z
  .object({
    snapshot: z
      .object({
        projectId: identifierSchema,
        observedBuildSha: identifierSchema,
        idle: z.boolean(),
        observedAt: z.string().datetime({ offset: true }),
        finishedAt: z.string().datetime({ offset: true }).optional(),
        open: z.array(z.object({ bugId: identifierSchema }).strip()).max(1_000),
        fixed: z.array(z.object({ bugId: identifierSchema }).strip()).max(1_000),
        invalid: z.array(z.object({ bugId: identifierSchema }).strip()).max(1_000),
        wontfix: z.array(z.object({ bugId: identifierSchema }).strip()).max(1_000),
      })
      .strip(),
  })
  .strip()
  .transform(({ snapshot }) => ({
    projectId: snapshot.projectId,
    observedBuildSha: snapshot.observedBuildSha,
    idle: snapshot.idle,
    observedAt: snapshot.observedAt,
    ...(snapshot.finishedAt ? { finishedAt: snapshot.finishedAt } : {}),
    openBugIds: snapshot.open.map(({ bugId }) => bugId),
    fixedBugIds: snapshot.fixed.map(({ bugId }) => bugId),
    invalidBugIds: snapshot.invalid.map(({ bugId }) => bugId),
    wontfixBugIds: snapshot.wontfix.map(({ bugId }) => bugId),
  }));

const holdoutEvidenceSchema = z
  .object({
    successfulParticipants: z.number().int().nonnegative(),
    participantCount: z.number().int().positive(),
    completionRate: rateSchema,
    absoluteLift: z.number().min(-1).max(1),
    freshCohort: z.boolean(),
  })
  .strip();

const canonicalHoldoutEvidenceSchema = z
  .object({
    result: z
      .object({
        studyId: identifierSchema,
        participantCount: z.number().int().positive(),
        successfulParticipants: z.number().int().nonnegative(),
        completionRate: rateSchema,
        isFreshCohort: z.boolean(),
        collectedAt: z.string().datetime({ offset: true }),
      })
      .strip(),
  })
  .strip()
  .transform(({ result }) => result);

const releaseCertificateEvidenceSchema = z
  .object({
    replayGate: z.literal("CLEAN"),
    humanGate: z.literal("PASSED"),
    candidateSha: identifierSchema,
  })
  .strip();

const canonicalCertificateEvidenceSchema = z
  .object({
    certificate: z
      .object({
        certificateId: identifierSchema,
        artifactUrl: z.string().url(),
        candidateSha: identifierSchema,
        replayProjectId: identifierSchema,
        baselineStudyId: identifierSchema,
        holdoutStudyId: identifierSchema,
        issuedAt: z.string().datetime({ offset: true }),
      })
      .strip(),
  })
  .strip()
  .transform(({ certificate }) => certificate);

const paymentLinkEvidenceSchema = z
  .object({
    amountCents: z.number().int().positive(),
    currency: z.literal("usd"),
    charged: z.boolean(),
  })
  .strip();

const paymentEvidenceSchema = z
  .object({
    payment: z
      .object({
        provider: z.enum(["STRIPE", "DEMO"]),
        providerPaymentId: identifierSchema,
        providerEventId: identifierSchema,
        amountCents: z.number().int().positive(),
        currency: z.literal("usd"),
        livemode: z.boolean(),
        confirmedAt: z.string().datetime({ offset: true }),
      })
      .strip(),
  })
  .strip()
  .transform(({ payment }) => payment);

const evidenceSchemas = {
  INTAKE_ACCEPTED: intakeEvidenceSchema,
  DIAGNOSIS_COMPLETED: diagnosisEvidenceSchema,
  TERAC_BASELINE_COMPLETED: baselineEvidenceSchema,
  REPLAY_FINDING_RECORDED: replayFindingEvidenceSchema,
  PIONEER_PATCH_SPEC_COMPILED: pioneerEvidenceSchema,
  PATCH_SPEC_COMPILED: canonicalPatchSpecEvidenceSchema,
  REPAIR_FAILED: z.object({ reason: longTextSchema }).strip(),
  CANDIDATE_DEPLOYED: z.union([
    candidateEvidenceSchema,
    canonicalCandidateEvidenceSchema,
  ]),
  RELEASE_BLOCKED: releaseBlockedEvidenceSchema,
  REPLAY_VERIFIED_CLEAN: replayCleanEvidenceSchema,
  REPLAY_SYNCED: replaySyncEvidenceSchema,
  TERAC_HOLDOUT_COMPLETED: holdoutEvidenceSchema,
  HOLDOUT_COMPLETED: canonicalHoldoutEvidenceSchema,
  RELEASE_CERTIFICATE_ISSUED: releaseCertificateEvidenceSchema,
  CERTIFICATE_ISSUED: canonicalCertificateEvidenceSchema,
  PAYMENT_LINK_RELEASED: paymentLinkEvidenceSchema,
  PAYMENT_CONFIRMED: paymentEvidenceSchema,
  DELIVERY_CONFIRMED: z
    .object({ certificateId: identifierSchema, receiptId: identifierSchema })
    .strip(),
  CLOSE_NO_CHARGE: z.object({ reason: shortTextSchema }).strip(),
  PROVIDER_ERROR_RECORDED: z
    .object({
      provider: shortTextSchema,
      code: shortTextSchema,
      retryable: z.boolean(),
    })
    .strip(),
} satisfies Record<string, z.ZodType>;

export const talosPublicEventTypeSchema = z.enum(
  Object.keys(evidenceSchemas) as [
    keyof typeof evidenceSchemas,
    ...(keyof typeof evidenceSchemas)[],
  ],
);

export const talosPublicEventProviderSchema = z.enum([
  "talos",
  "replay",
  "pioneer",
  "terac",
  "superserve",
  "stripe",
  "linq",
]);

const providersByEvent: Record<
  z.infer<typeof talosPublicEventTypeSchema>,
  readonly (z.infer<typeof talosPublicEventProviderSchema> | null)[]
> = {
  INTAKE_ACCEPTED: ["talos", null],
  DIAGNOSIS_COMPLETED: ["talos"],
  TERAC_BASELINE_COMPLETED: ["terac"],
  REPLAY_FINDING_RECORDED: ["replay"],
  PIONEER_PATCH_SPEC_COMPILED: ["pioneer"],
  PATCH_SPEC_COMPILED: ["pioneer"],
  REPAIR_FAILED: ["superserve", "talos"],
  CANDIDATE_DEPLOYED: ["superserve"],
  RELEASE_BLOCKED: ["replay"],
  REPLAY_VERIFIED_CLEAN: ["replay"],
  REPLAY_SYNCED: ["replay"],
  TERAC_HOLDOUT_COMPLETED: ["terac"],
  HOLDOUT_COMPLETED: ["terac"],
  RELEASE_CERTIFICATE_ISSUED: ["talos"],
  CERTIFICATE_ISSUED: ["talos"],
  PAYMENT_LINK_RELEASED: ["stripe"],
  PAYMENT_CONFIRMED: ["stripe"],
  DELIVERY_CONFIRMED: ["linq", "talos"],
  CLOSE_NO_CHARGE: ["talos"],
  PROVIDER_ERROR_RECORDED: ["talos"],
};

export function serializePublicEventEvidence(
  rawType: unknown,
  rawProvider: unknown,
  rawEvidence: unknown,
): {
  type: z.infer<typeof talosPublicEventTypeSchema>;
  provider: z.infer<typeof talosPublicEventProviderSchema> | null;
  evidence: Record<string, unknown>;
} {
  const type = talosPublicEventTypeSchema.parse(rawType);
  const provider = z
    .union([talosPublicEventProviderSchema, z.null()])
    .parse(rawProvider);

  if (!providersByEvent[type].includes(provider)) {
    throw new OrderLedgerDataCorruptionError();
  }

  const evidence = evidenceSchemas[type].parse(rawEvidence);
  return { type, provider, evidence: evidence as Record<string, unknown> };
}

export class OrderLedgerDataCorruptionError extends Error {
  constructor(message = "Talos order ledger data failed validation") {
    super(message);
    this.name = "OrderLedgerDataCorruptionError";
  }
}
