import { z } from "zod";

import type { SuperserveSanitizedReceipt } from "./types";

export const sandboxIdSchema = z
  .string()
  .regex(/^(?:sb-[a-z0-9]+-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const sandboxResponseSchema = z
  .object({
    id: sandboxIdSchema,
    name: z.string().min(1).max(64),
    status: z.enum(["active", "paused", "resuming"]),
    access_token: z.string().min(1),
  })
  .passthrough();

export const sandboxStatusResponseSchema = z
  .object({
    id: sandboxIdSchema,
    name: z.string().min(1).max(64),
    status: z.enum(["active", "paused", "resuming"]),
  })
  .passthrough();

export const activateResponseSchema = z
  .object({
    id: sandboxIdSchema,
    status: z.literal("active"),
    access_token: z.string().min(1),
  })
  .passthrough();

export const execResponseSchema = z
  .object({
    stdout: z.string(),
    stderr: z.string(),
    exit_code: z.number().int(),
    truncated: z.boolean().optional().default(false),
  })
  .passthrough();

export const providerErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const receiptBase = {
  schemaVersion: z.literal(1),
  provider: z.literal("superserve"),
  requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/),
  recordedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  sandboxId: sandboxIdSchema,
};

const createReceiptSchema = z
  .object({
    ...receiptBase,
    operation: z.literal("create_sandbox"),
    outcome: z.literal("created"),
    sandboxStatus: z.literal("active"),
    template: z.string().min(1).max(160),
    networkPolicy: z.literal("deny_by_default"),
  })
  .strip();

const runReceiptSchema = z
  .object({
    ...receiptBase,
    operation: z.literal("run_command"),
    outcome: z.enum(["succeeded", "failed", "timed_out"]),
    commandSha256: z.string().regex(/^[a-f0-9]{64}$/),
    exitCode: z.number().int(),
    durationMs: z.number().int().nonnegative(),
    timeoutMs: z.number().int().positive(),
    stdoutBytes: z.number().int().nonnegative(),
    stderrBytes: z.number().int().nonnegative(),
    outputTruncated: z.boolean(),
  })
  .strip();

const pauseReceiptSchema = z
  .object({
    ...receiptBase,
    operation: z.literal("pause_sandbox"),
    outcome: z.enum(["paused", "already_paused"]),
  })
  .strip();

const resumeReceiptSchema = z
  .object({
    ...receiptBase,
    operation: z.literal("resume_sandbox"),
    outcome: z.literal("active"),
  })
  .strip();

const destroyReceiptSchema = z
  .object({
    ...receiptBase,
    operation: z.literal("destroy_sandbox"),
    outcome: z.enum(["deleted", "already_deleted"]),
  })
  .strip();

const superserveReceiptSchema = z.discriminatedUnion("operation", [
  createReceiptSchema,
  runReceiptSchema,
  pauseReceiptSchema,
  resumeReceiptSchema,
  destroyReceiptSchema,
]);

/** Allowlist a receipt so tokens, raw bodies, command text, and output cannot leak. */
export function sanitizeSuperserveReceipt(input: unknown): SuperserveSanitizedReceipt {
  return Object.freeze(superserveReceiptSchema.parse(input));
}
