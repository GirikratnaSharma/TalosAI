import type {
  AdapterIdentity,
  CertificationProof,
  IsoDateTime,
} from "./contracts";
import type { ProviderOperationExecution } from "./core";
import type { BandReceipt } from "./receipts";

export interface BandRequestReleaseDecisionInput {
  readonly jobId: string;
  readonly releaseId: string;
  readonly certification: CertificationProof;
  readonly patchReceiptId: string;
  readonly holdoutReceiptId: string;
  readonly idempotencyKey: string;
}

export interface BandGetReleaseDecisionInput {
  readonly jobId: string;
  readonly decisionId: string;
}

export interface BandReleaseDecision {
  readonly decisionId: string;
  readonly releaseId: string;
  readonly decision: "pending" | "approved" | "vetoed";
  readonly reasonCode: string | null;
  readonly decidedAt: IsoDateTime | null;
}

export interface BandAdapter extends AdapterIdentity<"band"> {
  requestReleaseDecision(
    input: BandRequestReleaseDecisionInput,
  ): Promise<
    ProviderOperationExecution<
      BandReleaseDecision,
      BandReceipt,
      "request_release_decision"
    >
  >;

  getReleaseDecision(
    input: BandGetReleaseDecisionInput,
  ): Promise<
    ProviderOperationExecution<
      BandReleaseDecision,
      BandReceipt,
      "get_release_decision"
    >
  >;
}
