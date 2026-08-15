import "server-only";

import { createAdminClient } from "@insforge/sdk";
import { z } from "zod";

import { parseSingleOrderRow, serializeTalosOrder } from "./serializer";
import { OrderLedgerDataCorruptionError } from "./public-events";
import type { TalosOrderReadModel } from "./types";

const ORDER_COLUMNS = [
  "id",
  "public_reference",
  "version",
  "mode",
  "state",
  "deadline_at",
  "critical_journey",
  "original_url",
  "repository_url",
  "base_sha",
  "amount_cents",
  "currency",
  "max_repair_attempts",
  "repair_attempt",
  "minimum_participants",
  "minimum_completion_rate",
  "minimum_absolute_lift",
  "patch_spec_id",
  "patch_spec_sha256",
  "patch_spec_model_id",
  "candidate_sha",
  "candidate_preview_url",
  "replay_project_id",
  "baseline_study_id",
  "holdout_study_id",
  "certificate_id",
  "payment_intent_id",
  "payment_livemode",
  "delivery_receipt_id",
  "close_reason",
  "created_at",
  "updated_at",
].join(",");

const EVENT_COLUMNS = [
  "id",
  "order_id",
  "sequence",
  "event_type",
  "provider",
  "provider_event_id",
  "mode",
  "occurred_at",
  "recorded_at",
  "payload",
].join(",");

const orderReadConfirmationSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  updated_at: z.string().datetime({ offset: true }),
});

const environmentSchema = z.object({
  INSFORGE_URL: z.string().trim().url().startsWith("https://"),
  INSFORGE_API_KEY: z.string().trim().min(1),
});

export type RepositoryFailureReason =
  | "DATABASE_UNCONFIGURED"
  | "DATABASE_UNAVAILABLE";

export class OrderRepositoryUnavailableError extends Error {
  constructor(readonly reason: RepositoryFailureReason) {
    super("Talos order repository is unavailable");
    this.name = "OrderRepositoryUnavailableError";
  }
}

export class OrderRepositoryDataCorruptionError extends Error {
  constructor() {
    super("Talos order repository returned invalid data");
    this.name = "OrderRepositoryDataCorruptionError";
  }
}

export class OrderRepositoryInconsistentSnapshotError extends Error {
  constructor() {
    super("Talos order repository snapshot changed during the read");
    this.name = "OrderRepositoryInconsistentSnapshotError";
  }
}

export interface TalosOrderRepository {
  findByPublicReference(reference: string): Promise<TalosOrderReadModel | null>;
}

export function createInsForgeOrderRepository(
  environment: Record<string, string | undefined>,
): TalosOrderRepository {
  const parsedEnvironment = environmentSchema.safeParse(environment);
  if (!parsedEnvironment.success) {
    throw new OrderRepositoryUnavailableError("DATABASE_UNCONFIGURED");
  }

  const client = createAdminClient({
    baseUrl: parsedEnvironment.data.INSFORGE_URL,
    apiKey: parsedEnvironment.data.INSFORGE_API_KEY,
    retryCount: 0,
    timeout: 5_000,
  });

  return {
    async findByPublicReference(reference) {
      try {
        for (let readAttempt = 0; readAttempt < 2; readAttempt += 1) {
          const orderResult = await client.database
            .from("talos_orders")
            .select(ORDER_COLUMNS)
            .eq("public_reference", reference)
            .maybeSingle();

          if (orderResult.error) {
            throw new OrderRepositoryUnavailableError("DATABASE_UNAVAILABLE");
          }

          const order = parseSingleOrderRow(orderResult.data);
          if (!order) {
            return null;
          }

          const eventResult = await client.database
            .from("talos_order_events")
            .select(EVENT_COLUMNS)
            .eq("order_id", order.id)
            .order("sequence", { ascending: true });

          if (eventResult.error) {
            throw new OrderRepositoryUnavailableError("DATABASE_UNAVAILABLE");
          }

          const confirmationResult = await client.database
            .from("talos_orders")
            .select("id,version,updated_at")
            .eq("public_reference", reference)
            .maybeSingle();

          if (confirmationResult.error) {
            throw new OrderRepositoryUnavailableError("DATABASE_UNAVAILABLE");
          }

          const confirmation = orderReadConfirmationSchema.nullable().parse(
            confirmationResult.data,
          );
          const snapshotIsStable =
            confirmation?.id === order.id &&
            confirmation.version === order.version &&
            confirmation.updated_at === order.updated_at;

          if (!snapshotIsStable) {
            if (readAttempt === 0) {
              continue;
            }
            throw new OrderRepositoryInconsistentSnapshotError();
          }

          return serializeTalosOrder(order, eventResult.data ?? []);
        }

        throw new OrderRepositoryInconsistentSnapshotError();
      } catch (error) {
        if (error instanceof OrderRepositoryUnavailableError) {
          throw error;
        }
        if (
          error instanceof z.ZodError ||
          error instanceof OrderLedgerDataCorruptionError
        ) {
          throw new OrderRepositoryDataCorruptionError();
        }
        if (error instanceof OrderRepositoryDataCorruptionError) {
          throw error;
        }
        if (error instanceof OrderRepositoryInconsistentSnapshotError) {
          throw error;
        }
        throw new OrderRepositoryUnavailableError("DATABASE_UNAVAILABLE");
      }
    },
  };
}
