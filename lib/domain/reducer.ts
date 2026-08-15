import { DomainInvariantError, invariant } from "./errors";
import {
  assertOrderInvariants,
  assertValidBaseline,
  assertValidHoldout,
  hasCertifiableEvidence,
  hasDismissedReplayFindings,
  holdoutPasses,
  isReplayStrictlyClean,
  paymentMatchesMode,
} from "./policy";
import type {
  CloseReason,
  Command,
  DomainEvent,
  TalosOrder,
  OrderState,
  Reduction,
  RepairTrigger,
  ReplaySnapshot,
} from "./types";

function expectState(
  order: TalosOrder,
  event: DomainEvent,
  allowed: OrderState[],
): void {
  invariant(
    allowed.includes(order.state),
    "INVALID_TRANSITION",
    `${event.type} is not valid from ${order.state}`,
  );
}

function replayStatus(snapshot: ReplaySnapshot): TalosOrder["replay"]["status"] {
  if (!snapshot.idle) return "RUNNING";
  return isReplayStrictlyClean(snapshot) ? "CLEAN" : "DIRTY";
}

function openBugIds(order: TalosOrder): string[] {
  const source =
    order.replay.verificationSnapshot ?? order.replay.initialSnapshot;
  return source?.open.map((bug) => bug.bugId) ?? [];
}

function repairCommand(
  order: TalosOrder,
  attempt: 1 | 2,
  trigger: RepairTrigger,
): Command {
  return {
    type: "RUN_REPAIR",
    idempotencyKey: `${order.id}:repair:${attempt}`,
    orderId: order.id,
    attempt,
    trigger,
    replayBugIds: openBugIds(order),
  };
}

function closeNoCharge(
  order: TalosOrder,
  at: string,
  reason: CloseReason,
): TalosOrder {
  return {
    ...order,
    state: "CLOSED_NO_CHARGE",
    closure: { reason, closedAt: at },
  };
}

function applyEvent(
  order: TalosOrder,
  event: DomainEvent,
): Omit<Reduction, "order"> & { order: TalosOrder } {
  switch (event.type) {
    case "INTAKE_ACCEPTED": {
      expectState(order, event, ["DRAFT"]);
      return {
        order: {
          ...order,
          state: "DIAGNOSING",
          replay: { ...order.replay, status: "RUNNING" },
        },
        commands: [
          {
            type: "CREATE_REPLAY_PROJECT",
            idempotencyKey: `${order.id}:replay:initial`,
            orderId: order.id,
            targetUrl: order.contract.originalUrl,
            criticalJourney: order.contract.criticalJourney,
          },
          {
            type: "START_BASELINE_STUDY",
            idempotencyKey: `${order.id}:terac:baseline`,
            orderId: order.id,
            targetUrl: order.contract.originalUrl,
            criticalJourney: order.contract.criticalJourney,
            participantCount: order.contract.minimumParticipants,
          },
        ],
      };
    }

    case "DIAGNOSIS_COMPLETED": {
      expectState(order, event, ["DIAGNOSING"]);
      assertValidBaseline(order, event.baseline);
      invariant(
        event.replay.idle,
        "INITIAL_REPLAY_NOT_IDLE",
        "Diagnosis cannot complete while Replay is still running",
      );
      invariant(
        event.replay.targetUrl === order.contract.originalUrl,
        "INITIAL_REPLAY_TARGET_MISMATCH",
        "Initial Replay must test the original target",
      );
      invariant(
        event.replay.observedBuildSha === order.contract.baseSha,
        "INITIAL_REPLAY_SHA_MISMATCH",
        "Initial Replay must identify the declared base SHA",
      );

      const diagnosed: TalosOrder = {
        ...order,
        replay: {
          status: replayStatus(event.replay),
          projectId: event.replay.projectId,
          projectUrl: event.replay.projectUrl,
          initialSnapshot: event.replay,
        },
        human: { ...order.human, baseline: event.baseline },
      };

      if (hasDismissedReplayFindings(event.replay)) {
        return {
          order: closeNoCharge(
            diagnosed,
            event.at,
            "REPLAY_DISMISSED_FINDINGS",
          ),
          commands: [],
        };
      }

      if (!event.repairRequired) {
        invariant(
          event.replay.open.length === 0,
          "OPEN_BUGS_IGNORED",
          "An order with open Replay bugs cannot be declared repair-free",
        );
        return {
          order: closeNoCharge(diagnosed, event.at, "NO_REPAIR_NEEDED"),
          commands: [],
        };
      }

      const patching: TalosOrder = {
        ...diagnosed,
        state: "PATCHING",
        repair: { attempt: 1 },
      };
      return {
        order: patching,
        commands: [repairCommand(patching, 1, "INITIAL_DIAGNOSIS")],
      };
    }

    case "REPAIR_FAILED": {
      expectState(order, event, ["PATCHING"]);
      if (order.repair.attempt >= order.contract.maxRepairAttempts) {
        return {
          order: closeNoCharge(order, event.at, "ATTEMPTS_EXHAUSTED"),
          commands: [],
        };
      }
      const attempt = (order.repair.attempt + 1) as 2;
      const retrying: TalosOrder = {
        ...order,
        repair: { ...order.repair, attempt },
      };
      return {
        order: retrying,
        commands: [repairCommand(retrying, attempt, "REPAIR_RETRY")],
      };
    }

    case "CANDIDATE_DEPLOYED": {
      expectState(order, event, ["PATCHING"]);
      invariant(
        event.candidate.attempt === order.repair.attempt,
        "CANDIDATE_ATTEMPT_MISMATCH",
        "Candidate attempt must match the active repair attempt",
      );
      invariant(
        event.candidate.sha !== order.contract.baseSha ||
          order.repair.attempt === 2,
        "UNCHANGED_CANDIDATE",
        "The first repair candidate must differ from the base SHA",
      );
      invariant(
        event.candidate.previewUrl.length > 0 &&
          event.candidate.buildIdentityUrl.length > 0,
        "CANDIDATE_IDENTITY_MISSING",
        "Candidate requires preview and build identity URLs",
      );

      const bugIds = openBugIds(order);
      const commands: Command[] = [];
      if (bugIds.length > 0) {
        commands.push({
          type: "MARK_REPLAY_BUGS_FIXED",
          idempotencyKey: `${order.id}:replay:mark-fixed:${event.candidate.sha}`,
          orderId: order.id,
          projectId: order.replay.projectId ?? "",
          bugIds,
        });
      }
      commands.push({
        type: "SYNC_REPLAY",
        idempotencyKey: `${order.id}:replay:sync:${event.candidate.sha}`,
        orderId: order.id,
        projectId: order.replay.projectId ?? "",
        expectedTargetUrl: event.candidate.previewUrl,
        expectedBuildSha: event.candidate.sha,
      });

      return {
        order: {
          ...order,
          state: "REPLAY_VERIFYING",
          repair: {
            attempt: order.repair.attempt,
            candidate: event.candidate,
          },
          replay: {
            ...order.replay,
            status: "RUNNING",
            verificationSnapshot: undefined,
          },
          human: { baseline: order.human.baseline },
          certificate: undefined,
          payment: undefined,
          delivery: undefined,
        },
        commands,
      };
    }

    case "REPLAY_SYNCED": {
      expectState(order, event, ["REPLAY_VERIFYING"]);
      const candidate = order.repair.candidate;
      invariant(candidate, "CANDIDATE_MISSING", "Replay verification requires a candidate");
      invariant(
        event.snapshot.projectId === order.replay.projectId,
        "REPLAY_PROJECT_MISMATCH",
        "Replay snapshot belongs to another project",
      );
      invariant(
        event.snapshot.targetUrl === candidate.previewUrl,
        "REPLAY_TARGET_MISMATCH",
        "Replay must test the candidate preview URL",
      );
      invariant(
        event.snapshot.observedBuildSha === candidate.sha,
        "REPLAY_SHA_MISMATCH",
        "Replay must observe the exact candidate SHA",
      );

      const synced: TalosOrder = {
        ...order,
        replay: {
          ...order.replay,
          status: replayStatus(event.snapshot),
          verificationSnapshot: event.snapshot,
        },
      };

      if (!event.snapshot.idle) {
        return { order: synced, commands: [] };
      }

      if (hasDismissedReplayFindings(event.snapshot)) {
        return {
          order: closeNoCharge(
            synced,
            event.at,
            "REPLAY_DISMISSED_FINDINGS",
          ),
          commands: [],
        };
      }

      if (!isReplayStrictlyClean(event.snapshot)) {
        if (order.repair.attempt >= order.contract.maxRepairAttempts) {
          return {
            order: closeNoCharge(synced, event.at, "ATTEMPTS_EXHAUSTED"),
            commands: [],
          };
        }
        const attempt = (order.repair.attempt + 1) as 2;
        const patching: TalosOrder = {
          ...synced,
          state: "PATCHING",
          repair: { ...synced.repair, attempt },
        };
        return {
          order: patching,
          commands: [repairCommand(patching, attempt, "REPLAY_DIRTY")],
        };
      }

      const verifying: TalosOrder = {
        ...synced,
        state: "HUMAN_VERIFYING",
        replay: { ...synced.replay, status: "CLEAN" },
        human: { baseline: synced.human.baseline },
      };
      const baseline = verifying.human.baseline;
      invariant(baseline, "BASELINE_MISSING", "Holdout requires a baseline");
      return {
        order: verifying,
        commands: [
          {
            type: "START_HOLDOUT_STUDY",
            idempotencyKey: `${order.id}:terac:holdout:${candidate.sha}`,
            orderId: order.id,
            targetUrl: candidate.previewUrl,
            criticalJourney: order.contract.criticalJourney,
            participantCount: order.contract.minimumParticipants,
            excludeCohortFingerprint: baseline.cohortFingerprint,
          },
        ],
      };
    }

    case "HOLDOUT_COMPLETED": {
      expectState(order, event, ["HUMAN_VERIFYING"]);
      assertValidHoldout(order, event.result);
      const withHoldout: TalosOrder = {
        ...order,
        human: { ...order.human, holdout: event.result },
      };

      if (holdoutPasses(withHoldout, event.result)) {
        const candidate = withHoldout.repair.candidate;
        invariant(candidate, "CANDIDATE_MISSING", "Certificate requires a candidate");
        return {
          order: withHoldout,
          commands: [
            {
              type: "ISSUE_CERTIFICATE",
              idempotencyKey: `${order.id}:certificate:${candidate.sha}`,
              orderId: order.id,
              candidateSha: candidate.sha,
            },
          ],
        };
      }

      if (order.repair.attempt >= order.contract.maxRepairAttempts) {
        return {
          order: closeNoCharge(withHoldout, event.at, "ATTEMPTS_EXHAUSTED"),
          commands: [],
        };
      }
      const attempt = (order.repair.attempt + 1) as 2;
      const patching: TalosOrder = {
        ...withHoldout,
        state: "PATCHING",
        repair: { ...withHoldout.repair, attempt },
      };
      return {
        order: patching,
        commands: [
          repairCommand(patching, attempt, "HUMAN_HOLDOUT_FAILED"),
        ],
      };
    }

    case "CERTIFICATE_ISSUED": {
      expectState(order, event, ["HUMAN_VERIFYING"]);
      invariant(
        hasCertifiableEvidence(order),
        "NOT_CERTIFIABLE",
        "Strict Replay and fresh Terac lift are required before certification",
      );
      const candidate = order.repair.candidate;
      const replay = order.replay.verificationSnapshot;
      const baseline = order.human.baseline;
      const holdout = order.human.holdout;
      invariant(
        candidate && replay && baseline && holdout,
        "CERTIFICATE_EVIDENCE_MISSING",
        "Certificate evidence is incomplete",
      );
      invariant(
        event.certificate.candidateSha === candidate.sha &&
          event.certificate.replayProjectId === replay.projectId &&
          event.certificate.replayFinishedAt === replay.finishedAt &&
          event.certificate.baselineStudyId === baseline.studyId &&
          event.certificate.holdoutStudyId === holdout.studyId &&
          event.certificate.mode === order.mode,
        "CERTIFICATE_REFERENCE_MISMATCH",
        "Certificate does not reference the verified evidence",
      );

      return {
        order: {
          ...order,
          state: "AWAITING_PAYMENT",
          certificate: event.certificate,
        },
        commands: [
          {
            type: "REQUEST_PAYMENT_LINK",
            idempotencyKey: `${order.id}:payment-link`,
            orderId: order.id,
            certificateId: event.certificate.certificateId,
            amountCents: order.contract.amountCents,
            currency: order.contract.currency,
          },
        ],
      };
    }

    case "PAYMENT_CONFIRMED": {
      expectState(order, event, ["AWAITING_PAYMENT"]);
      invariant(
        event.payment.amountCents === order.contract.amountCents &&
          event.payment.currency === order.contract.currency,
        "PAYMENT_TERMS_MISMATCH",
        "Payment must match the certified quote",
      );
      invariant(
        paymentMatchesMode(order.mode, event.payment),
        "PAYMENT_MODE_MISMATCH",
        "Payment evidence must honestly match LIVE, TEST, or DEMO mode",
      );
      const certificate = order.certificate;
      invariant(certificate, "CERTIFICATE_MISSING", "Payment requires a certificate");
      return {
        order: {
          ...order,
          state: "DELIVERING",
          payment: event.payment,
        },
        commands: [
          {
            type: "DELIVER_CERTIFICATE",
            idempotencyKey: `${order.id}:delivery:${certificate.certificateId}`,
            orderId: order.id,
            certificateId: certificate.certificateId,
            destination: order.customer.deliveryAddress,
          },
        ],
      };
    }

    case "DELIVERY_CONFIRMED": {
      expectState(order, event, ["DELIVERING"]);
      invariant(
        event.certificateId === order.certificate?.certificateId,
        "DELIVERY_CERTIFICATE_MISMATCH",
        "Delivery receipt must reference the paid certificate",
      );
      return {
        order: {
          ...order,
          state: "DELIVERED",
          delivery: { receiptId: event.receiptId, deliveredAt: event.at },
        },
        commands: [],
      };
    }

    case "CLOSE_NO_CHARGE": {
      expectState(order, event, [
        "DRAFT",
        "DIAGNOSING",
        "PATCHING",
        "REPLAY_VERIFYING",
        "HUMAN_VERIFYING",
        "AWAITING_PAYMENT",
      ]);
      invariant(
        !order.payment,
        "CANNOT_CLOSE_CHARGED_ORDER",
        "A charged order cannot close as no-charge",
      );
      return {
        order: closeNoCharge(order, event.at, event.reason),
        commands: [],
      };
    }

    case "PROVIDER_ERROR_RECORDED": {
      expectState(order, event, [
        "DIAGNOSING",
        "PATCHING",
        "REPLAY_VERIFYING",
        "HUMAN_VERIFYING",
        "AWAITING_PAYMENT",
        "DELIVERING",
      ]);
      return {
        order: {
          ...order,
          lastError: {
            provider: event.provider,
            code: event.code,
            retryable: event.retryable,
            occurredAt: event.at,
          },
        },
        commands: [],
      };
    }

    default: {
      const exhaustive: never = event;
      throw new DomainInvariantError(
        "UNKNOWN_EVENT",
        `Unknown event ${(exhaustive as DomainEvent).type}`,
      );
    }
  }
}

export function reduce(
  order: TalosOrder,
  event: DomainEvent,
): Reduction {
  assertOrderInvariants(order);

  if (order.processedEventIds.includes(event.id)) {
    return { order, commands: [] };
  }

  const reduction = applyEvent(order, event);
  const next: TalosOrder = {
    ...reduction.order,
    version: order.version + 1,
    updatedAt: event.at,
    processedEventIds: [...order.processedEventIds, event.id],
  };
  assertOrderInvariants(next);
  return { order: next, commands: reduction.commands };
}
