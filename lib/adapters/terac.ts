import type {
  AdapterIdentity,
  GitCommitSha,
  IsoDateTime,
} from "./contracts";
import type { ProviderOperationExecution } from "./core";
import type { TeracReceipt } from "./receipts";

interface TeracCohortInput {
  readonly jobId: string;
  readonly taskDefinitionId: string;
  readonly taskVersion: string;
  readonly requestedParticipants: number;
  readonly successCriterion: string;
  readonly blinded: true;
  readonly freshParticipants: true;
  readonly idempotencyKey: string;
}

export interface TeracBaselineInput extends TeracCohortInput {
  readonly releaseId: string;
}

export interface TeracHoldoutInput extends TeracCohortInput {
  readonly candidateReleaseId: string;
  readonly candidateCommitSha: GitCommitSha;
  readonly baselineRunId: string;
}

export interface TeracCohortRun {
  readonly runId: string;
  readonly phase: "baseline" | "holdout";
  readonly taskDefinitionId: string;
  readonly taskVersion: string;
  readonly blinded: true;
  readonly freshParticipants: true;
  readonly startedAt: IsoDateTime;
}

export interface TeracGetCohortResultInput {
  readonly jobId: string;
  readonly runId: string;
}

export interface TeracCohortResult {
  readonly runId: string;
  readonly phase: "baseline" | "holdout";
  readonly assigned: number;
  readonly completed: number;
  readonly successful: number;
  readonly unsuccessful: number;
  readonly abandoned: number;
  readonly blinded: true;
  readonly freshParticipants: true;
  readonly interpretation: "directional_pilot";
  readonly completedAt: IsoDateTime;
}

export interface TeracAdapter extends AdapterIdentity<"terac"> {
  runBaseline(
    input: TeracBaselineInput,
  ): Promise<
    ProviderOperationExecution<
      TeracCohortRun,
      TeracReceipt,
      "run_baseline"
    >
  >;

  runHoldout(
    input: TeracHoldoutInput,
  ): Promise<
    ProviderOperationExecution<
      TeracCohortRun,
      TeracReceipt,
      "run_holdout"
    >
  >;

  getCohortResult(
    input: TeracGetCohortResultInput,
  ): Promise<
    ProviderOperationExecution<
      TeracCohortResult,
      TeracReceipt,
      "get_cohort_result"
    >
  >;
}
