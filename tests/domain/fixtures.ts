import {
  computePatchSpecSha256,
  createDraftOrder,
  reduce,
  type CandidateBuild,
  type DomainEvent,
  type TalosOrder,
  type HumanStudyResult,
  type PaymentEvidence,
  type PatchSpec,
  type ReleaseCertificateRef,
  type ReplayBugEvidence,
  type ReplaySnapshot,
  type RunMode,
} from "../../lib/domain";

export const ORIGINAL_URL = "https://before.talos.test";
export const PREVIEW_URL = "https://candidate.talos.test";
export const BASE_SHA = "base000000000000000000000000000000000001";
export const CANDIDATE_SHA_1 = "fix1000000000000000000000000000000000001";
export const CANDIDATE_SHA_2 = "fix2000000000000000000000000000000000002";
export const T0 = "2026-08-15T10:45:00.000Z";

export function makeDraftOrder(mode: RunMode = "LIVE"): TalosOrder {
  return createDraftOrder({
    id: "order_001",
    mode,
    createdAt: T0,
    deadlineAt: "2026-08-15T17:30:00.000Z",
    customer: {
      externalId: "customer_001",
      deliveryAddress: "+14155550123",
    },
    contract: {
      criticalJourney: "Submit the launch-readiness request",
      originalUrl: ORIGINAL_URL,
      repositoryUrl: "https://github.com/example/controlled-react-app",
      baseSha: BASE_SHA,
      amountCents: 1_000,
      currency: "usd",
      maxRepairAttempts: 2,
      minimumParticipants: 3,
      minimumCompletionRate: 0.8,
      minimumAbsoluteLift: 0.2,
    },
  });
}

export function makeBug(
  status: ReplayBugEvidence["status"] = "open",
  bugId = "bug_001",
): ReplayBugEvidence {
  return {
    bugId,
    title: "Submission button remains disabled",
    severity: "high",
    status,
    recordingId: `recording_${bugId}`,
    recordingUrl: `https://app.replay.io/recording/${bugId}`,
    reproductionSteps: ["Open form", "Enter valid values", "Submit"],
    expectedBehavior: "The request is submitted",
    actualBehavior: "The button remains disabled",
    rootCause: "A stale derived validity flag is read by the click handler",
  };
}

export function makeReplaySnapshot(
  overrides: Partial<ReplaySnapshot> = {},
): ReplaySnapshot {
  return {
    projectId: "replay_project_001",
    projectUrl: "https://qa.replay.io/projects/replay_project_001",
    targetUrl: ORIGINAL_URL,
    observedBuildSha: BASE_SHA,
    idle: true,
    observedAt: "2026-08-15T11:00:00.000Z",
    finishedAt: "2026-08-15T11:01:00.000Z",
    open: [makeBug()],
    fixed: [],
    invalid: [],
    wontfix: [],
    ...overrides,
  };
}

export function makeBaseline(
  overrides: Partial<HumanStudyResult> = {},
): HumanStudyResult {
  return {
    studyId: "terac_baseline_001",
    phase: "BASELINE",
    targetUrl: ORIGINAL_URL,
    collectedAt: "2026-08-15T11:02:00.000Z",
    participantCount: 5,
    successfulParticipants: 2,
    completionRate: 0.4,
    medianCompletionSeconds: 95,
    cohortFingerprint: "cohort_baseline_hash",
    isFreshCohort: true,
    ...overrides,
  };
}

export function makeHoldout(
  overrides: Partial<HumanStudyResult> = {},
): HumanStudyResult {
  return {
    studyId: "terac_holdout_001",
    phase: "HOLDOUT",
    targetUrl: PREVIEW_URL,
    collectedAt: "2026-08-15T12:10:00.000Z",
    participantCount: 5,
    successfulParticipants: 5,
    completionRate: 1,
    medianCompletionSeconds: 28,
    cohortFingerprint: "cohort_holdout_hash",
    excludedCohortFingerprint: "cohort_baseline_hash",
    isFreshCohort: true,
    ...overrides,
  };
}

export function makeCandidate(
  overrides: Partial<CandidateBuild> = {},
): CandidateBuild {
  return {
    attempt: 1,
    sha: CANDIDATE_SHA_1,
    previewUrl: PREVIEW_URL,
    buildIdentityUrl: `${PREVIEW_URL}/api/version`,
    deployedAt: "2026-08-15T11:30:00.000Z",
    buildPassed: true,
    changedFiles: ["app/request-form.tsx"],
    ...overrides,
  };
}

export function makeCleanVerification(
  overrides: Partial<ReplaySnapshot> = {},
): ReplaySnapshot {
  return makeReplaySnapshot({
    targetUrl: PREVIEW_URL,
    observedBuildSha: CANDIDATE_SHA_1,
    observedAt: "2026-08-15T11:45:00.000Z",
    finishedAt: "2026-08-15T11:46:00.000Z",
    open: [],
    fixed: [makeBug("fixed")],
    invalid: [],
    wontfix: [],
    ...overrides,
  });
}

export function makeCertificate(
  mode: RunMode = "LIVE",
  overrides: Partial<ReleaseCertificateRef> = {},
): ReleaseCertificateRef {
  return {
    certificateId: "certificate_001",
    artifactUrl: "https://talos.test/certificates/certificate_001",
    candidateSha: CANDIDATE_SHA_1,
    replayProjectId: "replay_project_001",
    replayFinishedAt: "2026-08-15T11:46:00.000Z",
    baselineStudyId: "terac_baseline_001",
    holdoutStudyId: "terac_holdout_001",
    issuedAt: "2026-08-15T12:12:00.000Z",
    mode,
    ...overrides,
  };
}

export function makePayment(
  mode: RunMode = "LIVE",
  overrides: Partial<PaymentEvidence> = {},
): PaymentEvidence {
  return {
    provider: mode === "DEMO" ? "DEMO" : "STRIPE",
    providerPaymentId: `${mode.toLowerCase()}_payment_001`,
    providerEventId: `${mode.toLowerCase()}_event_001`,
    amountCents: 1_000,
    currency: "usd",
    livemode: mode === "LIVE",
    confirmedAt: "2026-08-15T12:15:00.000Z",
    ...overrides,
  };
}

export function makePatchSpec(
  order: TalosOrder,
  overrides: Partial<PatchSpec> = {},
): PatchSpec {
  const snapshot =
    order.replay.verificationSnapshot ?? order.replay.initialSnapshot;
  if (!snapshot) throw new Error("Patch spec fixture requires Replay evidence");
  const replayBugIds =
    snapshot.open.length > 0
      ? snapshot.open.map((bug) => bug.bugId)
      : snapshot.fixed.map((bug) => bug.bugId);
  const attempt = order.repair.attempt as 1 | 2;
  const trigger = order.repair.trigger ?? "INITIAL_DIAGNOSIS";
  const { specSha256: suppliedHash, ...remainingOverrides } = overrides;
  const unhashed: Omit<PatchSpec, "specSha256"> = {
    specId: `pioneer_spec_${attempt}`,
    compilerProvider: "PIONEER",
    modelKind: "OPEN_WEIGHT",
    modelId: "fastino/gliner2-large-v1",
    attempt,
    trigger,
    bugClass: "FORM_SUBMISSION",
    confidence: 0.94,
    evidence: {
      replayProjectId: snapshot.projectId,
      replaySnapshotObservedAt: snapshot.observedAt,
      replayObservedBuildSha: snapshot.observedBuildSha,
      replayBugIds,
      ...(order.human.holdout
        ? { humanStudyId: order.human.holdout.studyId }
        : {}),
    },
    scope: {
      resolverId: "fixture-route-manifest-v1",
      repositoryUrl: order.contract.repositoryUrl,
      resolvedAtSha: snapshot.observedBuildSha,
    },
    changes: [
      {
        filePath: "app/request-form.tsx",
        intent: "Repair the evidence-backed form submission state transition",
      },
    ],
    compiledAt: "2026-08-15T11:10:00.000Z",
    ...remainingOverrides,
  };
  return {
    ...unhashed,
    specSha256: suppliedHash ?? computePatchSpecSha256(unhashed),
  };
}

type DomainEventType = DomainEvent["type"];
type DomainEventOfType<T extends DomainEventType> = Extract<
  DomainEvent,
  { type: T }
>;
type DomainEventInput = {
  [T in DomainEventType]: Omit<DomainEventOfType<T>, "id" | "at"> &
    Partial<Pick<DomainEventOfType<T>, "id" | "at">>;
}[DomainEventType];

export function event(value: DomainEventInput): DomainEvent {
  return {
    id: `event_${value.type.toLowerCase()}`,
    at: "2026-08-15T12:00:00.000Z",
    ...value,
  } as DomainEvent;
}

export function makeDiagnosingOrder(mode: RunMode = "LIVE"): TalosOrder {
  const draft = makeDraftOrder(mode);
  return reduce(draft, event({ type: "INTAKE_ACCEPTED" })).order;
}

export function makeSpecifyingOrder(mode: RunMode = "LIVE"): TalosOrder {
  const diagnosing = makeDiagnosingOrder(mode);
  return reduce(
    diagnosing,
    event({
      type: "DIAGNOSIS_COMPLETED",
      replay: makeReplaySnapshot(),
      baseline: makeBaseline(),
      repairRequired: true,
    }),
  ).order;
}

export function makePatchingOrder(mode: RunMode = "LIVE"): TalosOrder {
  const specifying = makeSpecifyingOrder(mode);
  return reduce(
    specifying,
    event({ type: "PATCH_SPEC_COMPILED", spec: makePatchSpec(specifying) }),
  ).order;
}

export function makeReplayVerifyingOrder(
  mode: RunMode = "LIVE",
): TalosOrder {
  const patching = makePatchingOrder(mode);
  return reduce(
    patching,
    event({
      id: "event_candidate_deployed_1",
      type: "CANDIDATE_DEPLOYED",
      candidate: makeCandidate(),
    }),
  ).order;
}

export function makeHumanVerifyingOrder(
  mode: RunMode = "LIVE",
): TalosOrder {
  const verifying = makeReplayVerifyingOrder(mode);
  return reduce(
    verifying,
    event({
      id: "event_replay_clean_1",
      type: "REPLAY_SYNCED",
      snapshot: makeCleanVerification(),
    }),
  ).order;
}

export function makeCertifiableOrder(
  mode: RunMode = "LIVE",
): TalosOrder {
  const humanVerifying = makeHumanVerifyingOrder(mode);
  return reduce(
    humanVerifying,
    event({
      id: "event_holdout_pass_1",
      type: "HOLDOUT_COMPLETED",
      result: makeHoldout(),
    }),
  ).order;
}

export function makeAwaitingPaymentOrder(
  mode: RunMode = "LIVE",
): TalosOrder {
  const certifiable = makeCertifiableOrder(mode);
  return reduce(
    certifiable,
    event({
      id: "event_certificate_issued_1",
      type: "CERTIFICATE_ISSUED",
      certificate: makeCertificate(mode),
    }),
  ).order;
}
