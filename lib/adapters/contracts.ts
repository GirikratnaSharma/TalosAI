import type {
  ProviderExecutionMode,
  ProviderName,
} from "./core";

export type IsoDateTime = string;
export type Sha256Digest = string;
export type GitCommitSha = string;

export interface AdapterIdentity<TProvider extends ProviderName> {
  readonly provider: TProvider;
  readonly mode: ProviderExecutionMode;
}

export interface CertificationProof {
  readonly status: "certified";
  readonly authority: "replay";
  readonly certificationId: string;
  readonly bugId: string;
  readonly beforeSnapshotId: string;
  readonly afterSnapshotId: string;
  readonly candidateCommitSha: GitCommitSha;
  readonly certifiedAt: IsoDateTime;
  readonly replayReceiptId: string;
}

export interface HumanOutcomeProof {
  readonly status: "verified";
  readonly authority: "terac";
  readonly baselineStudyId: string;
  readonly holdoutStudyId: string;
  readonly baselineCompletionRate: number;
  readonly holdoutCompletionRate: number;
  readonly minimumAbsoluteLift: number;
  readonly verifiedAt: IsoDateTime;
  readonly teracReceiptId: string;
}

export interface ReleaseAuthorization {
  readonly status: "certified";
  readonly certificationId: string;
  readonly candidateCommitSha: GitCommitSha;
  readonly replay: CertificationProof;
  readonly human: HumanOutcomeProof;
  readonly issuedAt: IsoDateTime;
}

export interface EvidenceReference {
  readonly kind:
    | "snapshot"
    | "bug"
    | "patch"
    | "cohort"
    | "certification"
    | "payment";
  readonly id: string;
  readonly sha256?: Sha256Digest;
}
