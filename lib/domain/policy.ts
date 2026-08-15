import { invariant } from "./errors";
import {
  computePatchSpecSha256,
  normalizeRepositoryFilePath,
} from "./patch-spec";
import type {
  PatchSpec,
  PatchSpecEvidence,
  RepairTrigger,
  TalosOrder,
  HumanStudyResult,
  PaymentEvidence,
  ReplaySnapshot,
} from "./types";
import { SUPPORTED_PATCH_BUG_CLASSES } from "./types";

export const MINIMUM_PATCH_SPEC_CONFIDENCE = 0.8;

const PROTECTED_PATCH_PATHS = [
  ".env",
  ".git/",
  ".github/",
  "migrations/",
  "infra/",
  "terraform/",
  "app/api/auth/",
  "pages/api/auth/",
  "lib/auth/",
  "app/api/webhooks/stripe",
  "lib/server/payments/",
] as const;

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function normalizedSafePatchPath(filePath: string): string | undefined {
  let canonical: string;
  try {
    canonical = normalizeRepositoryFilePath(filePath);
  } catch {
    return undefined;
  }
  const normalized = canonical.toLowerCase();
  return PROTECTED_PATCH_PATHS.some(
    (protectedPath) =>
      normalized === protectedPath || normalized.startsWith(protectedPath),
  )
    ? undefined
    : canonical;
}

export function assertValidPatchSpec(
  spec: PatchSpec,
  expected: {
    attempt: 1 | 2;
    trigger: RepairTrigger;
    evidence: PatchSpecEvidence;
    repositoryUrl: string;
  },
): void {
  invariant(
    spec.compilerProvider === "PIONEER" && spec.modelKind === "OPEN_WEIGHT",
    "PATCH_SPEC_AUTHORITY_INVALID",
    "Patch specifications must come from Pioneer's open-weight model boundary",
  );
  invariant(
    spec.specId.trim().length > 0 && spec.specId.length <= 256,
    "PATCH_SPEC_ID_INVALID",
    "Patch specification ID is invalid",
  );
  invariant(
    /^fastino\/gliner2-(?:base|large|multi|multi-large)-v1$/.test(
      spec.modelId,
    ),
    "PATCH_SPEC_MODEL_INVALID",
    "Patch specification must identify the approved open-weight model",
  );
  invariant(
    /^[a-f0-9]{64}$/.test(spec.specSha256),
    "PATCH_SPEC_HASH_INVALID",
    "Patch specification requires a lowercase SHA-256 digest",
  );
  invariant(
    spec.specSha256 === computePatchSpecSha256(spec),
    "PATCH_SPEC_HASH_MISMATCH",
    "Patch specification digest does not match its canonical content",
  );
  invariant(
    spec.attempt === expected.attempt && spec.trigger === expected.trigger,
    "PATCH_SPEC_ATTEMPT_MISMATCH",
    "Patch specification is not for the active repair attempt",
  );
  invariant(
    SUPPORTED_PATCH_BUG_CLASSES.includes(spec.bugClass),
    "PATCH_SPEC_BUG_CLASS_UNSUPPORTED",
    "Patch specification bug class is outside the bounded repair policy",
  );
  invariant(
    Number.isFinite(spec.confidence) &&
      spec.confidence >= MINIMUM_PATCH_SPEC_CONFIDENCE &&
      spec.confidence <= 1,
    "PATCH_SPEC_CONFIDENCE_TOO_LOW",
    "Patch specification does not meet the confidence gate",
  );
  invariant(
    spec.evidence.replayProjectId === expected.evidence.replayProjectId &&
      spec.evidence.replaySnapshotObservedAt ===
        expected.evidence.replaySnapshotObservedAt &&
      spec.evidence.replayObservedBuildSha ===
        expected.evidence.replayObservedBuildSha &&
      spec.evidence.humanStudyId === expected.evidence.humanStudyId &&
      sameStringSet(
        spec.evidence.replayBugIds,
        expected.evidence.replayBugIds,
      ) &&
      new Set(spec.evidence.replayBugIds).size ===
        spec.evidence.replayBugIds.length,
    "PATCH_SPEC_EVIDENCE_MISMATCH",
    "Patch specification is not bound to the current Replay and Terac evidence",
  );
  invariant(
    spec.scope.resolverId.trim().length > 0 &&
      spec.scope.resolverId.length <= 160 &&
      spec.scope.repositoryUrl === expected.repositoryUrl &&
      spec.scope.resolvedAtSha === expected.evidence.replayObservedBuildSha,
    "PATCH_SPEC_SCOPE_MISMATCH",
    "Patch file scope is not bound to the active repository evidence",
  );
  invariant(
    spec.changes.length > 0 && spec.changes.length <= 12,
    "PATCH_SPEC_CHANGESET_INVALID",
    "Patch specification must contain a bounded non-empty changeset",
  );
  invariant(
    (() => {
      const canonicalPaths = spec.changes.map((change) =>
        normalizedSafePatchPath(change.filePath),
      );
      return (
        canonicalPaths.every(
          (path, index): path is string =>
            path !== undefined && path === spec.changes[index]?.filePath,
        ) &&
        new Set(canonicalPaths).size === spec.changes.length &&
        spec.changes.every(
          (change) =>
            change.intent.trim().length > 0 &&
            change.intent.length <= 2_000,
        )
      );
    })(),
    "PATCH_SPEC_UNSAFE_CHANGE",
    "Patch specification requests a duplicate, protected, or unsafe change",
  );
  invariant(
    Number.isFinite(Date.parse(spec.compiledAt)),
    "PATCH_SPEC_TIME_INVALID",
    "Patch specification compilation time is invalid",
  );
}

export function hasDismissedReplayFindings(snapshot: ReplaySnapshot): boolean {
  return snapshot.invalid.length > 0 || snapshot.wontfix.length > 0;
}

export function isReplayStrictlyClean(snapshot: ReplaySnapshot): boolean {
  return (
    snapshot.idle &&
    Boolean(snapshot.finishedAt) &&
    snapshot.open.length === 0 &&
    snapshot.invalid.length === 0 &&
    snapshot.wontfix.length === 0
  );
}

export function assertStudyShape(result: HumanStudyResult): void {
  invariant(
    result.participantCount > 0,
    "EMPTY_STUDY",
    "A human study must contain participants",
  );
  invariant(
    result.successfulParticipants >= 0 &&
      result.successfulParticipants <= result.participantCount,
    "INVALID_STUDY_COUNTS",
    "Successful participants must be within the cohort size",
  );
  invariant(
    result.completionRate >= 0 && result.completionRate <= 1,
    "INVALID_STUDY_RATE",
    "Completion rate must be between zero and one",
  );
  invariant(
    Math.abs(
      result.completionRate -
        result.successfulParticipants / result.participantCount,
    ) < 1e-9,
    "INCONSISTENT_STUDY_RATE",
    "Completion rate must agree with participant counts",
  );
}

export function assertValidBaseline(
  order: TalosOrder,
  baseline: HumanStudyResult,
): void {
  assertStudyShape(baseline);
  invariant(
    baseline.phase === "BASELINE",
    "NOT_A_BASELINE",
    "Diagnosis requires a baseline study",
  );
  invariant(
    baseline.targetUrl === order.contract.originalUrl,
    "BASELINE_TARGET_MISMATCH",
    "Baseline must test the original target",
  );
  invariant(
    baseline.participantCount >= order.contract.minimumParticipants,
    "BASELINE_TOO_SMALL",
    "Baseline does not meet the declared participant minimum",
  );
}

export function assertValidHoldout(
  order: TalosOrder,
  holdout: HumanStudyResult,
): void {
  const baseline = order.human.baseline;
  const candidate = order.repair.candidate;

  assertStudyShape(holdout);
  invariant(baseline, "BASELINE_MISSING", "Holdout requires a baseline");
  invariant(candidate, "CANDIDATE_MISSING", "Holdout requires a candidate");
  invariant(
    holdout.phase === "HOLDOUT",
    "NOT_A_HOLDOUT",
    "Human verification requires a holdout study",
  );
  invariant(
    holdout.studyId !== baseline.studyId,
    "STUDY_REUSED",
    "Baseline and holdout must be different studies",
  );
  invariant(
    holdout.isFreshCohort,
    "COHORT_NOT_FRESH",
    "Holdout must use a fresh cohort",
  );
  invariant(
    holdout.cohortFingerprint !== baseline.cohortFingerprint,
    "COHORT_REUSED",
    "Baseline and holdout cohort fingerprints must differ",
  );
  invariant(
    holdout.excludedCohortFingerprint === baseline.cohortFingerprint,
    "BASELINE_NOT_EXCLUDED",
    "Holdout must record exclusion of the baseline cohort",
  );
  invariant(
    holdout.targetUrl === candidate.previewUrl,
    "HOLDOUT_TARGET_MISMATCH",
    "Holdout must test the candidate Replay verified",
  );
  invariant(
    holdout.participantCount >= order.contract.minimumParticipants,
    "HOLDOUT_TOO_SMALL",
    "Holdout does not meet the declared participant minimum",
  );
}

export function holdoutPasses(
  order: TalosOrder,
  holdout: HumanStudyResult,
): boolean {
  assertValidHoldout(order, holdout);
  const baseline = order.human.baseline;
  invariant(baseline, "BASELINE_MISSING", "Holdout requires a baseline");

  return (
    holdout.completionRate >= order.contract.minimumCompletionRate &&
    holdout.completionRate - baseline.completionRate >=
      order.contract.minimumAbsoluteLift
  );
}

export function hasCertifiableEvidence(order: TalosOrder): boolean {
  const candidate = order.repair.candidate;
  const replay = order.replay.verificationSnapshot;
  const holdout = order.human.holdout;

  if (!candidate || !replay || !holdout || !order.human.baseline) {
    return false;
  }

  if (
    !isReplayStrictlyClean(replay) ||
    replay.projectId !== order.replay.projectId ||
    replay.targetUrl !== candidate.previewUrl ||
    replay.observedBuildSha !== candidate.sha
  ) {
    return false;
  }

  try {
    return holdoutPasses(order, holdout);
  } catch {
    return false;
  }
}

export function paymentMatchesMode(
  mode: TalosOrder["mode"],
  payment: PaymentEvidence,
): boolean {
  if (mode === "LIVE") {
    return payment.provider === "STRIPE" && payment.livemode;
  }
  if (mode === "TEST") {
    return payment.provider === "STRIPE" && !payment.livemode;
  }
  return payment.provider === "DEMO" && !payment.livemode;
}

export function isCountableLiveRevenue(order: TalosOrder): boolean {
  return Boolean(
    (order.state === "DELIVERING" || order.state === "DELIVERED") &&
      order.mode === "LIVE" &&
      order.payment &&
      order.payment.provider === "STRIPE" &&
      order.payment.livemode &&
      order.payment.amountCents === order.contract.amountCents &&
      order.payment.currency === order.contract.currency,
  );
}

export function assertOrderInvariants(order: TalosOrder): void {
  invariant(
    order.repair.attempt >= 0 &&
      order.repair.attempt <= order.contract.maxRepairAttempts,
    "ATTEMPT_LIMIT_EXCEEDED",
    "Repair attempts exceed Talos v0's limit",
  );
  invariant(
    new Set(order.processedEventIds).size === order.processedEventIds.length,
    "DUPLICATE_PROCESSED_EVENT",
    "Processed event IDs must be unique",
  );

  if (
    order.state === "SPECIFYING" ||
    order.state === "PATCHING" ||
    order.state === "REPLAY_VERIFYING" ||
    order.state === "HUMAN_VERIFYING" ||
    order.state === "AWAITING_PAYMENT" ||
    order.state === "DELIVERING" ||
    order.state === "DELIVERED"
  ) {
    invariant(
      order.repair.attempt >= 1,
      "REPAIR_NOT_STARTED",
      "This state requires at least one repair attempt",
    );
  }

  if (order.state === "SPECIFYING") {
    invariant(
      order.repair.trigger && !order.repair.patchSpec,
      "SPECIFICATION_PHASE_INVALID",
      "Specification phase requires a trigger and cannot retain an old patch specification",
    );
  }

  if (
    order.state === "PATCHING" ||
    order.state === "REPLAY_VERIFYING" ||
    order.state === "HUMAN_VERIFYING" ||
    order.state === "AWAITING_PAYMENT" ||
    order.state === "DELIVERING" ||
    order.state === "DELIVERED"
  ) {
    invariant(
      order.repair.patchSpec,
      "PATCH_SPEC_REQUIRED",
      "Repair and release states require a Pioneer patch specification",
    );
  }

  if (
    order.state === "REPLAY_VERIFYING" ||
    order.state === "HUMAN_VERIFYING" ||
    order.state === "AWAITING_PAYMENT" ||
    order.state === "DELIVERING" ||
    order.state === "DELIVERED"
  ) {
    invariant(
      order.repair.candidate,
      "CANDIDATE_MISSING",
      "This state requires a deployed candidate",
    );
  }


  if (order.repair.candidate && order.repair.patchSpec) {
    const authorizedFiles = new Set(
      order.repair.patchSpec.changes.map((change) => change.filePath),
    );
    const candidateFiles = order.repair.candidate.changedFiles.map((file) =>
      normalizedSafePatchPath(file),
    );
    invariant(
      candidateFiles.length > 0 &&
        candidateFiles.every(
          (file): file is string =>
            file !== undefined && authorizedFiles.has(file),
        ) &&
        new Set(candidateFiles).size === candidateFiles.length,
      "CANDIDATE_OUTSIDE_PATCH_SPEC",
      "Candidate files must remain within the immutable patch specification",
    );
  }

  if (
    order.state === "HUMAN_VERIFYING" ||
    order.state === "AWAITING_PAYMENT" ||
    order.state === "DELIVERING" ||
    order.state === "DELIVERED"
  ) {
    const candidate = order.repair.candidate;
    const replay = order.replay.verificationSnapshot;
    invariant(candidate && replay, "REPLAY_EVIDENCE_MISSING", "Replay evidence is required");
    invariant(
      isReplayStrictlyClean(replay),
      "REPLAY_NOT_CLEAN",
      "Human verification and later states require strict Replay cleanliness",
    );
    invariant(
      replay.targetUrl === candidate.previewUrl &&
        replay.observedBuildSha === candidate.sha,
      "REPLAY_BUILD_MISMATCH",
      "Replay evidence must match the exact candidate build",
    );
  }

  if (
    order.state === "AWAITING_PAYMENT" ||
    order.state === "DELIVERING" ||
    order.state === "DELIVERED"
  ) {
    invariant(
      order.certificate,
      "CERTIFICATE_MISSING",
      "Payment may only be requested after certification",
    );
    invariant(
      hasCertifiableEvidence(order),
      "CERTIFICATE_EVIDENCE_INVALID",
      "Certificate states require strict Replay and fresh human evidence",
    );
  }

  if (order.certificate) {
    const candidate = order.repair.candidate;
    const replay = order.replay.verificationSnapshot;
    const baseline = order.human.baseline;
    const holdout = order.human.holdout;
    invariant(
      candidate && replay && baseline && holdout,
      "CERTIFICATE_REFERENCES_MISSING",
      "A certificate requires all underlying evidence",
    );
    invariant(
      order.certificate.candidateSha === candidate.sha &&
        order.certificate.replayProjectId === replay.projectId &&
        order.certificate.replayFinishedAt === replay.finishedAt &&
        order.certificate.baselineStudyId === baseline.studyId &&
        order.certificate.holdoutStudyId === holdout.studyId &&
        order.certificate.mode === order.mode,
      "CERTIFICATE_REFERENCE_MISMATCH",
      "Certificate references must match the certified evidence",
    );
  }

  if (order.state === "AWAITING_PAYMENT") {
    invariant(
      !order.payment,
      "PAYMENT_ALREADY_PRESENT",
      "Awaiting payment cannot already contain payment evidence",
    );
  }

  if (order.state === "DELIVERING" || order.state === "DELIVERED") {
    invariant(order.payment, "PAYMENT_MISSING", "Delivery requires confirmed payment");
    invariant(
      paymentMatchesMode(order.mode, order.payment),
      "PAYMENT_MODE_MISMATCH",
      "Payment evidence must honestly match the order mode",
    );
    invariant(
      order.payment.amountCents === order.contract.amountCents &&
        order.payment.currency === order.contract.currency,
      "PAYMENT_TERMS_MISMATCH",
      "Payment must match the certified quote",
    );
  }

  if (order.state === "DELIVERED") {
    invariant(order.delivery, "DELIVERY_MISSING", "Delivered state requires a receipt");
  }

  if (order.state === "CLOSED_NO_CHARGE") {
    invariant(order.closure, "CLOSURE_MISSING", "Closed jobs require a reason");
    invariant(
      !order.payment,
      "CHARGED_CLOSED_JOB",
      "A closed-no-charge job cannot contain payment evidence",
    );
    invariant(
      !order.delivery,
      "DELIVERED_CLOSED_JOB",
      "A closed-no-charge job cannot be delivered",
    );
  }
}
