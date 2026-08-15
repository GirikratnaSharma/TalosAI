import { fixtureExecution } from "./core";
import {
  createFixtureReceipt,
  type ProviderOperationMap,
  type ReceiptArtifact,
  type ReceiptFor,
} from "./receipts";

interface FixtureExecutionInput<
  TProvider extends keyof ProviderOperationMap,
  TOperation extends ProviderOperationMap[TProvider],
> {
  readonly provider: TProvider;
  readonly operation: TOperation;
  readonly requestId: string;
  readonly fixtureId: string;
  readonly recordedAt: string;
  readonly receiptId?: string;
  readonly idempotencyKey?: string;
  readonly artifacts?: readonly ReceiptArtifact[];
}

/**
 * The only shared fixture constructor. It stamps both the top-level execution
 * and its receipt as fixture evidence, preventing fixture payloads from being
 * mistaken for live provider proof.
 */
export function createFixtureExecution<
  TData,
  TProvider extends keyof ProviderOperationMap,
  TOperation extends ProviderOperationMap[TProvider],
>(
  input: FixtureExecutionInput<TProvider, TOperation>,
  data: TData,
) {
  const receipt: ReceiptFor<TProvider, "fixture", TOperation> =
    createFixtureReceipt(input);
  return fixtureExecution(data, receipt);
}
