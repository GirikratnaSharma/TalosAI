import type {
  AdapterIdentity,
  GitCommitSha,
  Sha256Digest,
} from "./contracts";
import type { ProviderOperationExecution } from "./core";
import type { SuperserveReceipt } from "./receipts";

export interface SuperserveSandboxPolicy {
  readonly network: "deny_by_default";
  readonly allowedHosts: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly maxWallTimeMs: number;
  readonly maxChangedFiles: number;
}

export interface SuperserveRepairInput {
  readonly jobId: string;
  readonly bugId: string;
  readonly replaySnapshotId: string;
  readonly replayEvidenceSha256: Sha256Digest;
  readonly repositoryUrl: string;
  readonly baseCommitSha: GitCommitSha;
  readonly credentialGrantId: string;
  readonly policy: SuperserveSandboxPolicy;
  readonly verificationCommands: readonly string[];
  readonly idempotencyKey: string;
}

export interface SuperserveCommandResult {
  readonly commandName: string;
  readonly status: "passed" | "failed" | "timed_out";
  readonly exitCode: number | null;
  readonly durationMs: number;
}

export interface SuperserveRepairArtifact {
  readonly sandboxId: string;
  readonly baseCommitSha: GitCommitSha;
  readonly candidateCommitSha: GitCommitSha;
  readonly patchSha256: Sha256Digest;
  readonly changedFiles: readonly string[];
  readonly commands: readonly SuperserveCommandResult[];
  readonly networkPolicy: "deny_by_default";
  readonly sandboxTerminated: boolean;
}

export interface SuperserveDestroySandboxInput {
  readonly jobId: string;
  readonly sandboxId: string;
  readonly idempotencyKey: string;
}

export interface SuperserveDestroyedSandbox {
  readonly sandboxId: string;
  readonly terminated: true;
}

export interface SuperserveAdapter extends AdapterIdentity<"superserve"> {
  runRepair(
    input: SuperserveRepairInput,
  ): Promise<
    ProviderOperationExecution<
      SuperserveRepairArtifact,
      SuperserveReceipt,
      "run_repair"
    >
  >;

  destroySandbox(
    input: SuperserveDestroySandboxInput,
  ): Promise<
    ProviderOperationExecution<
      SuperserveDestroyedSandbox,
      SuperserveReceipt,
      "destroy_sandbox"
    >
  >;
}
