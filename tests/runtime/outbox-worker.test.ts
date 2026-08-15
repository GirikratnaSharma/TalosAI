import { describe, expect, it, vi } from "vitest";

import type { Command, CommandOutbox } from "../../lib/domain";
import {
  CommandDispatchError,
  runOneOutboxCommand,
} from "../../lib/runtime";

const command: Command = {
  type: "CREATE_REPLAY_PROJECT",
  idempotencyKey: "order_1:replay:create",
  orderId: "order_1",
  targetUrl: "https://fixture.example/checkout",
  criticalJourney: "Complete checkout",
};

function makeOutbox(claimed: boolean): CommandOutbox {
  return {
    claimNext: vi
      .fn()
      .mockResolvedValue(claimed ? { id: "cmd_1", command } : null),
    complete: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

describe("durable outbox worker", () => {
  it("does nothing when no command can be claimed", async () => {
    const outbox = makeOutbox(false);
    const dispatcher = { execute: vi.fn() };

    await expect(runOneOutboxCommand(outbox, dispatcher)).resolves.toEqual({
      status: "IDLE",
    });
    expect(dispatcher.execute).not.toHaveBeenCalled();
  });

  it("completes a claimed command with its sanitized receipt", async () => {
    const outbox = makeOutbox(true);
    const dispatcher = {
      execute: vi.fn().mockResolvedValue({ providerReceipt: "receipt_123" }),
    };

    await expect(runOneOutboxCommand(outbox, dispatcher)).resolves.toEqual({
      status: "COMPLETE",
      commandId: "cmd_1",
    });
    expect(outbox.complete).toHaveBeenCalledWith("cmd_1", "receipt_123");
    expect(outbox.retry).not.toHaveBeenCalled();
    expect(outbox.fail).not.toHaveBeenCalled();
  });

  it("retries transient failures without persisting exception text", async () => {
    const outbox = makeOutbox(true);
    const dispatcher = {
      execute: vi
        .fn()
        .mockRejectedValue(new Error("Bearer secret-do-not-store")),
    };

    await expect(runOneOutboxCommand(outbox, dispatcher)).resolves.toEqual({
      status: "RETRY",
      commandId: "cmd_1",
      errorCode: "UNEXPECTED_COMMAND_FAILURE",
    });
    expect(outbox.retry).toHaveBeenCalledWith(
      "cmd_1",
      "UNEXPECTED_COMMAND_FAILURE",
    );
  });

  it("dead-letters explicit permanent provider failures", async () => {
    const outbox = makeOutbox(true);
    const dispatcher = {
      execute: vi
        .fn()
        .mockRejectedValue(new CommandDispatchError("INVALID_TARGET", false)),
    };

    await expect(runOneOutboxCommand(outbox, dispatcher)).resolves.toEqual({
      status: "FAILED",
      commandId: "cmd_1",
      errorCode: "INVALID_TARGET",
    });
    expect(outbox.fail).toHaveBeenCalledWith("cmd_1", "INVALID_TARGET");
    expect(outbox.retry).not.toHaveBeenCalled();
  });
});
