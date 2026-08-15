import type { Command, CommandOutbox } from "@/lib/domain";

export interface CommandExecutionReceipt {
  readonly providerReceipt?: string;
}

export interface CommandDispatcher {
  execute(command: Command): Promise<CommandExecutionReceipt>;
}

export class CommandDispatchError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(`Command dispatch failed (${code})`);
    this.name = "CommandDispatchError";
  }
}

export type OutboxRunResult =
  | { readonly status: "IDLE" }
  | { readonly status: "COMPLETE"; readonly commandId: string }
  | {
      readonly status: "RETRY" | "FAILED";
      readonly commandId: string;
      readonly errorCode: string;
    };

/**
 * Executes at most one durable command. The outbox owns claiming and
 * idempotency; the dispatcher owns provider calls. Unknown failures retry with
 * a fixed, secret-safe code instead of serializing an exception or response.
 */
export async function runOneOutboxCommand(
  outbox: CommandOutbox,
  dispatcher: CommandDispatcher,
): Promise<OutboxRunResult> {
  const claimed = await outbox.claimNext();
  if (!claimed) return { status: "IDLE" };

  try {
    const execution = await dispatcher.execute(claimed.command);
    await outbox.complete(claimed.id, execution.providerReceipt);
    return { status: "COMPLETE", commandId: claimed.id };
  } catch (error) {
    const dispatchError =
      error instanceof CommandDispatchError
        ? error
        : new CommandDispatchError("UNEXPECTED_COMMAND_FAILURE", true);

    if (dispatchError.retryable) {
      await outbox.retry(claimed.id, dispatchError.code);
      return {
        status: "RETRY",
        commandId: claimed.id,
        errorCode: dispatchError.code,
      };
    }

    await outbox.fail(claimed.id, dispatchError.code);
    return {
      status: "FAILED",
      commandId: claimed.id,
      errorCode: dispatchError.code,
    };
  }
}
