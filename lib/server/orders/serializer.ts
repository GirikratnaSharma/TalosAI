import { z } from "zod";

import {
  talosOrderEventRowSchema,
  talosOrderRowSchema,
  type TalosOrderReadModel,
} from "./types";

const orderRowsSchema = z.array(talosOrderRowSchema).max(1);
const eventRowsSchema = z.array(talosOrderEventRowSchema);

function paymentStatus(
  state: TalosOrderReadModel["order"]["state"],
  paymentIntentId: string | null,
): TalosOrderReadModel["order"]["payment"]["status"] {
  if (paymentIntentId) {
    return "CONFIRMED";
  }
  if (state === "CLOSED_NO_CHARGE") {
    return "NOT_CHARGED";
  }
  if (state === "AWAITING_PAYMENT") {
    return "LINK_RELEASED";
  }
  return "LOCKED";
}

export function parseSingleOrderRow(value: unknown) {
  const rows = orderRowsSchema.parse(value === null ? [] : [value]);
  return rows[0] ?? null;
}

export function serializeTalosOrder(
  rawOrder: unknown,
  rawEvents: unknown,
): TalosOrderReadModel {
  const order = talosOrderRowSchema.parse(rawOrder);
  const events = eventRowsSchema.parse(rawEvents).sort(
    (left, right) => left.sequence - right.sequence,
  );

  if (events.some((event) => event.order_id !== order.id)) {
    throw new Error("Order event relationship validation failed");
  }

  return {
    schemaVersion: "2026-08-15",
    provenance: {
      source: "INSFORGE_DATABASE",
      mode: order.mode,
      isLive: order.mode === "LIVE",
      disclosure:
        "Loaded from the read-only Talos order ledger in InsForge. Event modes identify live, test, or demo provider evidence.",
    },
    order: {
      id: order.public_reference,
      version: order.version,
      mode: order.mode,
      state: order.state,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      deadlineAt: order.deadline_at,
      contract: {
        criticalJourney: order.critical_journey,
        originalUrl: order.original_url,
        repositoryUrl: order.repository_url,
        baseSha: order.base_sha,
        amountCents: order.amount_cents,
        currency: order.currency,
        maxRepairAttempts: order.max_repair_attempts,
        minimumParticipants: order.minimum_participants,
        minimumCompletionRate: order.minimum_completion_rate,
        minimumAbsoluteLift: order.minimum_absolute_lift,
      },
      repair: {
        attempt: order.repair_attempt,
        candidateSha: order.candidate_sha,
        candidatePreviewUrl: order.candidate_preview_url,
      },
      evidence: {
        replayProjectId: order.replay_project_id,
        baselineStudyId: order.baseline_study_id,
        holdoutStudyId: order.holdout_study_id,
        certificateId: order.certificate_id,
      },
      payment: {
        status: paymentStatus(order.state, order.payment_intent_id),
        livemode: order.payment_livemode,
      },
      delivery: {
        receiptId: order.delivery_receipt_id,
      },
      closeReason: order.close_reason,
    },
    events: events.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      type: event.event_type,
      provider: event.provider,
      providerEventId: event.provider_event_id,
      mode: event.mode,
      occurredAt: event.occurred_at,
      recordedAt: event.recorded_at,
      evidence: event.payload,
    })),
  };
}
