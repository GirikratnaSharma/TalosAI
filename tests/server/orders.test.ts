import { describe, expect, it } from "vitest";

import {
  OrderRepositoryDataCorruptionError,
  OrderRepositoryInconsistentSnapshotError,
  OrderRepositoryUnavailableError,
  type TalosOrderRepository,
} from "../../lib/server/orders/repository";
import { serializeTalosOrder } from "../../lib/server/orders/serializer";
import { lookupOrder } from "../../lib/server/orders/service";

const orderRow = {
  id: "5a0796b8-951c-46f1-b4b2-926792ca3ee8",
  public_reference: "TAL-A12",
  version: 3,
  mode: "TEST",
  state: "AWAITING_PAYMENT",
  deadline_at: "2026-08-15T20:00:00.000Z",
  critical_journey: "Submit checkout",
  original_url: "https://example.test/broken",
  repository_url: "https://github.com/example/project",
  base_sha: "abc1234",
  amount_cents: 2500,
  currency: "usd",
  max_repair_attempts: 2,
  repair_attempt: 1,
  minimum_participants: 25,
  minimum_completion_rate: "0.80",
  minimum_absolute_lift: "0.30",
  patch_spec_id: "pioneer_spec_1",
  patch_spec_sha256:
    "a20ddbc71c231b47b5a74dba1d63daef513c86702f22299de9b24b856b41e336",
  patch_spec_model_id: "fastino/gliner2-base-v1",
  candidate_sha: "def5678",
  candidate_preview_url: "https://preview.example.test",
  replay_project_id: "replay-12",
  baseline_study_id: "baseline-12",
  holdout_study_id: "holdout-12",
  certificate_id: "certificate-12",
  payment_intent_id: null,
  payment_livemode: false,
  delivery_receipt_id: null,
  close_reason: null,
  created_at: "2026-08-15T19:00:00.000Z",
  updated_at: "2026-08-15T19:30:00.000Z",
} as const;

const event = (sequence: number, id: string) => ({
  id,
  order_id: orderRow.id,
  sequence,
  event_type: "PAYMENT_LINK_RELEASED",
  provider: "stripe",
  provider_event_id: `provider-${sequence}`,
  mode: "TEST",
  occurred_at: `2026-08-15T19:0${sequence}:00.000Z`,
  recorded_at: `2026-08-15T19:0${sequence}:01.000Z`,
  payload: { amountCents: 2500, currency: "usd", charged: false },
});

describe("Talos order read model", () => {
  it("validates rows, converts numeric rates, and orders ledger events", () => {
    const result = serializeTalosOrder(orderRow, [
      event(2, "630042f7-9817-4ae8-9f43-065c42dce430"),
      event(1, "4950ab73-ac3f-4e9a-8af6-0c6778647cfa"),
    ]);

    expect(result.provenance).toMatchObject({
      source: "INSFORGE_DATABASE",
      mode: "TEST",
      isLive: false,
    });
    expect(result.order.contract.minimumCompletionRate).toBe(0.8);
    expect(result.order.payment.status).toBe("LINK_RELEASED");
    expect(result.events.map(({ sequence }) => sequence)).toEqual([1, 2]);
  });

  it("projects public event evidence through an event-specific allowlist", () => {
    const result = serializeTalosOrder(orderRow, [
      {
        ...event(1, "4950ab73-ac3f-4e9a-8af6-0c6778647cfa"),
        payload: {
          amountCents: 2500,
          currency: "usd",
          charged: false,
          webhook: { customer_email: "private@example.test" },
          providerResponse: { client_secret: "must-not-leak" },
        },
      },
    ]);

    expect(result.events[0]?.evidence).toEqual({
      amountCents: 2500,
      currency: "usd",
      charged: false,
    });
  });

  it("rejects unknown event types and invalid event/provider pairings", () => {
    expect(() =>
      serializeTalosOrder(orderRow, [
        {
          ...event(1, "4950ab73-ac3f-4e9a-8af6-0c6778647cfa"),
          event_type: "ARBITRARY_WEBHOOK_RECEIVED",
        },
      ]),
    ).toThrow("ledger data failed validation");

    expect(() =>
      serializeTalosOrder(orderRow, [
        {
          ...event(1, "4950ab73-ac3f-4e9a-8af6-0c6778647cfa"),
          provider: "replay",
        },
      ]),
    ).toThrow("ledger data failed validation");
  });

  it("rejects an event attached to a different order", () => {
    expect(() =>
      serializeTalosOrder(orderRow, [
        {
          ...event(1, "4950ab73-ac3f-4e9a-8af6-0c6778647cfa"),
          order_id: "502fdf11-f8c5-4812-b18b-7622f6950349",
        },
      ]),
    ).toThrow("relationship validation failed");
  });

  it("falls back only for the seeded demo reference and discloses provenance", async () => {
    const repositoryFactory = (): TalosOrderRepository => {
      throw new OrderRepositoryUnavailableError("DATABASE_UNCONFIGURED");
    };

    const result = await lookupOrder("TAL-D04", { repositoryFactory });

    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("Expected a demo order");
    expect(result.body.provenance).toEqual(
      expect.objectContaining({
        source: "DEMO_FIXTURE",
        mode: "DEMO",
        isLive: false,
        fallbackReason: "DATABASE_UNCONFIGURED",
      }),
    );
    expect(result.body.provenance.disclosure).toContain("No live provider call");
    expect(result.body.order.payment.livemode).toBe(false);
  });

  it("does not invent a fallback for other references", async () => {
    const repositoryFactory = (): TalosOrderRepository => {
      throw new OrderRepositoryUnavailableError("DATABASE_UNAVAILABLE");
    };

    const result = await lookupOrder("TAL-A12", { repositoryFactory });

    expect(result).toEqual({
      status: 503,
      body: {
        error: "ORDER_LEDGER_UNAVAILABLE",
        message: "The order ledger is temporarily unavailable.",
      },
    });
  });

  it.each([
    new OrderRepositoryDataCorruptionError(),
    new OrderRepositoryInconsistentSnapshotError(),
  ])(
    "does not demo-fallback for corrupt or inconsistent live reads",
    async (repositoryError) => {
      const repositoryFactory = (): TalosOrderRepository => ({
        findByPublicReference: async () => {
          throw repositoryError;
        },
      });

      const result = await lookupOrder("TAL-D04", { repositoryFactory });
      expect(result.status).toBe(503);
    },
  );

  it("binds the demo's second repair attempt to its own Pioneer spec event", async () => {
    const repositoryFactory = (): TalosOrderRepository => {
      throw new OrderRepositoryUnavailableError("DATABASE_UNCONFIGURED");
    };

    const result = await lookupOrder("TAL-D04", { repositoryFactory });
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("Expected a demo order");

    const compiledSpecs = result.body.events.filter(
      ({ type }) => type === "PIONEER_PATCH_SPEC_COMPILED",
    );
    expect(compiledSpecs).toHaveLength(2);
    expect(compiledSpecs.at(-1)?.evidence).toMatchObject({
      attempt: 2,
      specId: result.body.order.repair.patchSpecId,
      specSha256: result.body.order.repair.patchSpecSha256,
    });
    expect(result.body.order.version).toBe(result.body.events.length);
  });

  it("returns not found without substituting demo data", async () => {
    const repositoryFactory = (): TalosOrderRepository => ({
      findByPublicReference: async () => null,
    });

    const result = await lookupOrder("TAL-D04", { repositoryFactory });
    expect(result.status).toBe(404);
  });
});
