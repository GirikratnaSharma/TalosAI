export const ORDER_STATES = [
  "DRAFT",
  "DIAGNOSING",
  "PATCHING",
  "REPLAY_VERIFYING",
  "HUMAN_VERIFYING",
  "AWAITING_PAYMENT",
  "DELIVERING",
  "DELIVERED",
  "CLOSED_NO_CHARGE",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];
export type RunMode = "LIVE" | "TEST" | "DEMO";
export type ReplayStatus =
  | "NOT_STARTED"
  | "RUNNING"
  | "DIRTY"
  | "CLEAN"
  | "ERROR";

export type CloseReason =
  | "NO_REPAIR_NEEDED"
  | "UNSUPPORTED"
  | "DEADLINE_EXCEEDED"
  | "ATTEMPTS_EXHAUSTED"
  | "REPLAY_DISMISSED_FINDINGS"
  | "PAYMENT_WINDOW_EXPIRED"
  | "CUSTOMER_CANCELED";

export interface EventMeta {
  id: string;
  at: string;
}

export interface ReplayBugEvidence {
  bugId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  status: "open" | "fixed" | "invalid" | "wontfix";
  recordingId: string;
  recordingUrl: string;
  reproductionSteps: string[];
  expectedBehavior: string;
  actualBehavior: string;
  rootCause: string;
}

export interface ReplaySnapshot {
  projectId: string;
  projectUrl: string;
  targetUrl: string;
  observedBuildSha: string;
  idle: boolean;
  observedAt: string;
  finishedAt?: string;
  open: ReplayBugEvidence[];
  fixed: ReplayBugEvidence[];
  invalid: ReplayBugEvidence[];
  wontfix: ReplayBugEvidence[];
}

export interface HumanStudyResult {
  studyId: string;
  phase: "BASELINE" | "HOLDOUT";
  targetUrl: string;
  collectedAt: string;
  participantCount: number;
  successfulParticipants: number;
  completionRate: number;
  medianCompletionSeconds?: number;
  cohortFingerprint: string;
  excludedCohortFingerprint?: string;
  isFreshCohort: boolean;
}

export interface CandidateBuild {
  attempt: 1 | 2;
  sha: string;
  previewUrl: string;
  buildIdentityUrl: string;
  deployedAt: string;
  buildPassed: true;
  changedFiles: string[];
}

export interface ReleaseCertificateRef {
  certificateId: string;
  artifactUrl: string;
  candidateSha: string;
  replayProjectId: string;
  replayFinishedAt: string;
  baselineStudyId: string;
  holdoutStudyId: string;
  issuedAt: string;
  mode: RunMode;
}

export interface PaymentEvidence {
  provider: "STRIPE" | "DEMO";
  providerPaymentId: string;
  providerEventId: string;
  amountCents: number;
  currency: "usd";
  livemode: boolean;
  confirmedAt: string;
}

export interface TalosContract {
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
}

export interface TalosOrder {
  id: string;
  version: number;
  mode: RunMode;
  state: OrderState;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  customer: {
    externalId: string;
    deliveryAddress: string;
  };
  contract: TalosContract;
  replay: {
    status: ReplayStatus;
    projectId?: string;
    projectUrl?: string;
    initialSnapshot?: ReplaySnapshot;
    verificationSnapshot?: ReplaySnapshot;
  };
  human: {
    baseline?: HumanStudyResult;
    holdout?: HumanStudyResult;
  };
  repair: {
    attempt: 0 | 1 | 2;
    candidate?: CandidateBuild;
  };
  certificate?: ReleaseCertificateRef;
  payment?: PaymentEvidence;
  delivery?: {
    receiptId: string;
    deliveredAt: string;
  };
  closure?: {
    reason: CloseReason;
    closedAt: string;
  };
  lastError?: {
    provider: string;
    code: string;
    retryable: boolean;
    occurredAt: string;
  };
  processedEventIds: string[];
}

export type RepairTrigger =
  | "INITIAL_DIAGNOSIS"
  | "REPLAY_DIRTY"
  | "HUMAN_HOLDOUT_FAILED"
  | "REPAIR_RETRY";

export type Command =
  | {
      type: "CREATE_REPLAY_PROJECT";
      idempotencyKey: string;
      orderId: string;
      targetUrl: string;
      criticalJourney: string;
    }
  | {
      type: "START_BASELINE_STUDY";
      idempotencyKey: string;
      orderId: string;
      targetUrl: string;
      criticalJourney: string;
      participantCount: number;
    }
  | {
      type: "RUN_REPAIR";
      idempotencyKey: string;
      orderId: string;
      attempt: 1 | 2;
      trigger: RepairTrigger;
      replayBugIds: string[];
    }
  | {
      type: "MARK_REPLAY_BUGS_FIXED";
      idempotencyKey: string;
      orderId: string;
      projectId: string;
      bugIds: string[];
    }
  | {
      type: "SYNC_REPLAY";
      idempotencyKey: string;
      orderId: string;
      projectId: string;
      expectedTargetUrl: string;
      expectedBuildSha: string;
    }
  | {
      type: "START_HOLDOUT_STUDY";
      idempotencyKey: string;
      orderId: string;
      targetUrl: string;
      criticalJourney: string;
      participantCount: number;
      excludeCohortFingerprint: string;
    }
  | {
      type: "ISSUE_CERTIFICATE";
      idempotencyKey: string;
      orderId: string;
      candidateSha: string;
    }
  | {
      type: "REQUEST_PAYMENT_LINK";
      idempotencyKey: string;
      orderId: string;
      certificateId: string;
      amountCents: number;
      currency: "usd";
    }
  | {
      type: "DELIVER_CERTIFICATE";
      idempotencyKey: string;
      orderId: string;
      certificateId: string;
      destination: string;
    };

export type DomainEvent = EventMeta &
  (
    | { type: "INTAKE_ACCEPTED" }
    | {
        type: "DIAGNOSIS_COMPLETED";
        replay: ReplaySnapshot;
        baseline: HumanStudyResult;
        repairRequired: boolean;
      }
    | { type: "REPAIR_FAILED"; reason: string }
    | { type: "CANDIDATE_DEPLOYED"; candidate: CandidateBuild }
    | { type: "REPLAY_SYNCED"; snapshot: ReplaySnapshot }
    | { type: "HOLDOUT_COMPLETED"; result: HumanStudyResult }
    | {
        type: "CERTIFICATE_ISSUED";
        certificate: ReleaseCertificateRef;
      }
    | { type: "PAYMENT_CONFIRMED"; payment: PaymentEvidence }
    | {
        type: "DELIVERY_CONFIRMED";
        certificateId: string;
        receiptId: string;
      }
    | { type: "CLOSE_NO_CHARGE"; reason: CloseReason }
    | {
        type: "PROVIDER_ERROR_RECORDED";
        provider: string;
        code: string;
        retryable: boolean;
      }
  );

export interface Reduction {
  order: TalosOrder;
  commands: Command[];
}

export interface CreateOrderInput {
  id: string;
  mode: RunMode;
  createdAt: string;
  deadlineAt: string;
  customer: TalosOrder["customer"];
  contract: TalosContract;
}
