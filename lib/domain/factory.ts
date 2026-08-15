import { invariant } from "./errors";
import type { CreateOrderInput, TalosOrder } from "./types";

export function createDraftOrder(input: CreateOrderInput): TalosOrder {
  invariant(input.id.length > 0, "ORDER_ID_REQUIRED", "Order ID is required");
  invariant(
    input.contract.criticalJourney.trim().length > 0,
    "CRITICAL_JOURNEY_REQUIRED",
    "A critical journey is required",
  );
  invariant(
    input.contract.amountCents > 0,
    "INVALID_AMOUNT",
    "The post-verification price must be positive",
  );
  invariant(
    input.contract.maxRepairAttempts === 2,
    "INVALID_ATTEMPT_LIMIT",
    "Talos v0 permits exactly two repair attempts",
  );
  invariant(
    input.contract.minimumParticipants > 0,
    "INVALID_PARTICIPANT_MINIMUM",
    "At least one participant is required",
  );
  invariant(
    input.contract.minimumCompletionRate >= 0 &&
      input.contract.minimumCompletionRate <= 1,
    "INVALID_COMPLETION_RATE",
    "Minimum completion rate must be between zero and one",
  );
  invariant(
    input.contract.minimumAbsoluteLift > 0 &&
      input.contract.minimumAbsoluteLift <= 1,
    "INVALID_LIFT",
    "Minimum absolute lift must be greater than zero and at most one",
  );

  return {
    id: input.id,
    version: 0,
    mode: input.mode,
    state: "DRAFT",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    deadlineAt: input.deadlineAt,
    customer: { ...input.customer },
    contract: { ...input.contract },
    replay: { status: "NOT_STARTED" },
    human: {},
    repair: { attempt: 0 },
    processedEventIds: [],
  };
}
