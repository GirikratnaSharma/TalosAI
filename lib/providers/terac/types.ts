import type { SanitizedHttpReceipt } from "../http";
import type { TeracSubmissionStatus } from "./schemas";

export type TeracPhase = "BASELINE" | "HOLDOUT";

export interface TeracFeasibilityRequestInput {
  taskDescription: string;
  panelDescription: string;
  submissionCount: number;
  timelineHours: number;
  requestorEmail?: string;
}

export interface TeracFeasibilityQuote {
  requestId: string;
  status: "RECEIVED" | "RESPONDED" | "WON" | "LOST" | "NOT_PURSUED";
  submissionCount: number | null;
  timelineHours: number | null;
  costPerParticipantUsd: string | null;
  respondedAt: string | null;
  createdAt: string;
  dashboardUrl: string | null;
}

export interface TeracScreeningAnswer {
  text: string;
  qualify_logic: "may" | "must" | "must_one_of" | "reject";
}

export interface TeracScreeningQuestion {
  key: string;
  text: string;
  pick: "one" | "any" | "boolean";
  answers: TeracScreeningAnswer[];
}

export type TeracFilter = Record<
  string,
  Record<string, string | number | string[]>
>;

interface TeracStudyLaunchBase {
  orderId: string;
  projectId: string;
  title: string;
  description: string;
  targetUrl: string;
  criticalJourney: string;
  successCriterion: string;
  requestedParticipants: number;
  durationMinutes: number;
  feasibilityRequestId: string;
  screeningQuestions: TeracScreeningQuestion[];
  filters?: TeracFilter[];
}

export interface TeracBaselineLaunchInput extends TeracStudyLaunchBase {
  phase: "BASELINE";
}

export interface TeracHoldoutLaunchInput extends TeracStudyLaunchBase {
  phase: "HOLDOUT";
  baselineStudyId: string;
}

export interface TeracStudyLaunch {
  studyId: string;
  phase: TeracPhase;
  status: "active";
  projectId: string;
  requestedParticipants: number;
  baselineStudyId: string | null;
  participantExclusionFilterApplied: boolean;
  launchedAt: string;
  pricing: {
    costPerParticipantCents: number;
    totalCostCents: number;
    currency: "usd";
  } | null;
  receipts: readonly SanitizedHttpReceipt[];
}

export type TeracRawSubmissionCounts = Record<TeracSubmissionStatus, number>;

export interface TeracStudyProgress {
  studyId: string;
  opportunityStatus: "draft" | "active" | "paused" | "completed";
  requestedParticipants: number;
  rawCounts: TeracRawSubmissionCounts;
  participantIds: string[];
  participantIdsByStatus: Record<TeracSubmissionStatus, string[]>;
  observedAt: string;
  receipts: readonly SanitizedHttpReceipt[];
}

export interface TeracStudyResult extends TeracStudyProgress {
  phase: TeracPhase;
  cohortId: string;
  baselineStudyId: string | null;
  attemptedParticipants: number;
  completedParticipants: number;
  successfulParticipants: number;
  unsuccessfulParticipants: number;
  completionRate: number;
  isFreshCohort: boolean;
  excludedCohortId: string | null;
}

export interface TeracResultInput {
  studyId: string;
  phase: "BASELINE";
  minimumParticipants: number;
}

export interface TeracHoldoutResultInput {
  studyId: string;
  phase: "HOLDOUT";
  minimumParticipants: number;
  baseline: TeracStudyResult;
}

export interface TeracClient {
  requestFeasibility(
    input: TeracFeasibilityRequestInput,
  ): Promise<{ quote: TeracFeasibilityQuote; receipt: SanitizedHttpReceipt }>;
  getFeasibilityQuote(
    requestId: string,
  ): Promise<{ quote: TeracFeasibilityQuote; receipt: SanitizedHttpReceipt }>;
  launchBaselineStudy(input: TeracBaselineLaunchInput): Promise<TeracStudyLaunch>;
  launchHoldoutStudy(input: TeracHoldoutLaunchInput): Promise<TeracStudyLaunch>;
  getStudyProgress(studyId: string): Promise<TeracStudyProgress>;
  getStudyResult(
    input: TeracResultInput | TeracHoldoutResultInput,
  ): Promise<TeracStudyResult>;
}
