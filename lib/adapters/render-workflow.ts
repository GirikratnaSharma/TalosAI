import type {
  AdapterIdentity,
  IsoDateTime,
} from "./contracts";
import type { ProviderOperationExecution } from "./core";
import type { RenderReceipt } from "./receipts";

export interface RenderStartWorkflowInput {
  readonly jobId: string;
  readonly workflowDefinitionId: string;
  readonly stage:
    | "intake"
    | "diagnose"
    | "repair"
    | "evaluate"
    | "certify"
    | "collect";
  readonly payloadReference: string;
  readonly idempotencyKey: string;
}

export interface RenderWorkflowRun {
  readonly workflowRunId: string;
  readonly workflowDefinitionId: string;
  readonly status: "queued" | "running" | "succeeded" | "failed";
  readonly startedAt: IsoDateTime;
  readonly finishedAt: IsoDateTime | null;
}

export interface RenderGetWorkflowRunInput {
  readonly jobId: string;
  readonly workflowRunId: string;
}

export interface RenderWorkflowAdapter extends AdapterIdentity<"render"> {
  startWorkflow(
    input: RenderStartWorkflowInput,
  ): Promise<
    ProviderOperationExecution<
      RenderWorkflowRun,
      RenderReceipt,
      "start_workflow"
    >
  >;

  getWorkflowRun(
    input: RenderGetWorkflowRunInput,
  ): Promise<
    ProviderOperationExecution<
      RenderWorkflowRun,
      RenderReceipt,
      "get_workflow_run"
    >
  >;
}
