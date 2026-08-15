import type {
  AdapterIdentity,
  CertificationProof,
  GitCommitSha,
  IsoDateTime,
  Sha256Digest,
} from "./contracts";
import type { ProviderOperationExecution } from "./core";
import type { ReplayReceipt } from "./receipts";

export * from "../providers/replay";

export interface ReplayCreateProjectInput {
  readonly jobId: string;
  readonly name: string;
  readonly targetUrl: string;
  readonly idempotencyKey: string;
}

export interface ReplayProject {
  readonly projectId: string;
  readonly jobId: string;
  readonly createdAt: IsoDateTime;
}

export interface ReplayCaptureAuthoritativeSnapshotInput {
  readonly jobId: string;
  readonly projectId: string;
  readonly targetUrl: string;
  readonly releaseId: string;
  readonly idempotencyKey: string;
}

export interface ReplayAuthoritativeSnapshot {
  readonly projectId: string;
  readonly snapshotId: string;
  readonly replayId: string;
  readonly releaseId: string;
  readonly capturedAt: IsoDateTime;
  readonly authority: "replay";
  readonly immutable: true;
}

export interface ReplayGetBugInput {
  readonly jobId: string;
  readonly projectId: string;
  readonly snapshotId: string;
}

export interface ReplayBug {
  readonly bugId: string;
  readonly projectId: string;
  readonly snapshotId: string;
  readonly status: "open" | "fixed";
  readonly summary: string;
  readonly failingStep: string;
  readonly evidenceSha256: Sha256Digest;
  readonly detectedAt: IsoDateTime;
}

export interface ReplayMarkFixedInput {
  readonly jobId: string;
  readonly projectId: string;
  readonly bugId: string;
  readonly beforeSnapshotId: string;
  readonly afterSnapshotId: string;
  readonly candidateCommitSha: GitCommitSha;
  readonly idempotencyKey: string;
}

export interface ReplayFixedBug {
  readonly bugId: string;
  readonly status: "fixed";
  readonly authority: "replay";
  readonly verifiedSnapshotId: string;
  readonly candidateCommitSha: GitCommitSha;
  readonly fixedAt: IsoDateTime;
  readonly certification: CertificationProof;
}

export interface ReplayAdapter extends AdapterIdentity<"replay"> {
  createProject(
    input: ReplayCreateProjectInput,
  ): Promise<
    ProviderOperationExecution<
      ReplayProject,
      ReplayReceipt,
      "create_project"
    >
  >;

  captureAuthoritativeSnapshot(
    input: ReplayCaptureAuthoritativeSnapshotInput,
  ): Promise<
    ProviderOperationExecution<
      ReplayAuthoritativeSnapshot,
      ReplayReceipt,
      "capture_authoritative_snapshot"
    >
  >;

  getBug(
    input: ReplayGetBugInput,
  ): Promise<
    ProviderOperationExecution<ReplayBug, ReplayReceipt, "get_bug">
  >;

  markFixed(
    input: ReplayMarkFixedInput,
  ): Promise<
    ProviderOperationExecution<ReplayFixedBug, ReplayReceipt, "mark_fixed">
  >;
}
