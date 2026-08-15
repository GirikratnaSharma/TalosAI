import { createHash, randomUUID } from "node:crypto";

import {
  activateResponseSchema,
  execResponseSchema,
  sandboxIdSchema,
  sandboxResponseSchema,
  sandboxStatusResponseSchema,
  sanitizeSuperserveReceipt,
} from "./schemas";
import { parseSuperserveJson, requestSuperserve } from "./http";
import {
  SuperserveProviderError,
  type CreateSuperserveSandboxInput,
  type RunSuperserveCommandInput,
  type SuperserveCommandOutput,
  type SuperserveCreateReceipt,
  type SuperserveDestroyReceipt,
  type SuperserveHttpClientOptions,
  type SuperserveOperationResult,
  type SuperservePauseReceipt,
  type SuperserveReceiptOperation,
  type SuperserveResumeReceipt,
  type SuperserveRunReceipt,
  type SuperserveSandboxRef,
} from "./types";

const DEFAULT_CONTROL_PLANE = "https://api.superserve.ai/";
const DEFAULT_DATA_PLANE = "https://sandbox.superserve.ai/";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_CONTROL_RESPONSE_BYTES = 128 * 1024;
const DEFAULT_ACTIVE_TIMEOUT_SECONDS = 600;
const DEFAULT_AUTO_DELETE_SECONDS = 3_600;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_COMMAND_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
const REQUIRED_SUPERSERVE_EGRESS = "*.superserve.ai";

function invalidInput(operation: SuperserveReceiptOperation): never {
  throw new SuperserveProviderError({ code: "INVALID_INPUT", operation });
}

function positiveInteger(
  value: number,
  maximum: number,
  operation: SuperserveReceiptOperation,
): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    return invalidInput(operation);
  }
  return value;
}

function nonNegativeInteger(
  value: number,
  maximum: number,
  operation: SuperserveReceiptOperation,
): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    return invalidInput(operation);
  }
  return value;
}

function serviceUrl(value: string, operation: SuperserveReceiptOperation): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalidInput(operation);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return invalidInput(operation);
  }
  parsed.pathname = parsed.pathname.replace(/\/*$/, "/");
  return parsed;
}

function endpoint(base: URL, path: string): URL {
  return new URL(path.replace(/^\//, ""), base);
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function clipUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return value;
  return bytes.subarray(0, maxBytes).toString("utf8");
}

function boundOutput(
  stdout: string,
  stderr: string,
  maxBytes: number,
): { stdout: string; stderr: string; truncated: boolean } {
  const stdoutLength = utf8Length(stdout);
  const stderrLength = utf8Length(stderr);
  if (stdoutLength + stderrLength <= maxBytes) {
    return { stdout, stderr, truncated: false };
  }

  let stdoutBudget = Math.min(stdoutLength, Math.floor(maxBytes / 2));
  let stderrBudget = Math.min(stderrLength, maxBytes - stdoutBudget);
  let remaining = maxBytes - stdoutBudget - stderrBudget;
  const extraStdout = Math.min(stdoutLength - stdoutBudget, remaining);
  stdoutBudget += extraStdout;
  remaining -= extraStdout;
  stderrBudget += Math.min(stderrLength - stderrBudget, remaining);

  return {
    stdout: clipUtf8(stdout, stdoutBudget),
    stderr: clipUtf8(stderr, stderrBudget),
    truncated: true,
  };
}

function validateSandboxId(
  sandboxId: string,
  operation: SuperserveReceiptOperation,
): string {
  const parsed = sandboxIdSchema.safeParse(sandboxId);
  return parsed.success ? parsed.data : invalidInput(operation);
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(trimmed)) {
    return invalidInput("create_sandbox");
  }
  return trimmed;
}

function validateHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  const domain = /^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
  const ipv4Cidr = /^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (trimmed.length > 253 || (!domain.test(trimmed) && !ipv4Cidr.test(trimmed))) {
    return invalidInput("create_sandbox");
  }
  return trimmed;
}

function validateMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  const entries = Object.entries(metadata ?? {});
  if (entries.length > 63) return invalidInput("create_sandbox");

  for (const [key, value] of entries) {
    if (
      !key ||
      utf8Length(key) > 256 ||
      utf8Length(value) > 2_048 ||
      /^superserve\.|^_superserve/i.test(key)
    ) {
      return invalidInput("create_sandbox");
    }
    result[key] = value;
  }
  result["talos.disposable"] = "true";
  if (utf8Length(JSON.stringify(result)) > 16_384) {
    return invalidInput("create_sandbox");
  }
  return result;
}

function receiptRequestId(factory: () => string): string {
  const value = factory();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) {
    throw new SuperserveProviderError({
      code: "INVALID_CONFIGURATION",
      operation: "create_sandbox",
    });
  }
  return value;
}

export class SuperserveHttpClient {
  readonly provider = "superserve" as const;
  readonly mode = "live" as const;

  private readonly apiKey: string;
  private readonly controlPlane: URL;
  private readonly dataPlane: URL;
  private readonly requestTimeoutMs: number;
  private readonly maxControlResponseBytes: number;
  private readonly fetchImpl: NonNullable<SuperserveHttpClientOptions["fetchImpl"]>;
  private readonly now: () => Date;
  private readonly monotonicNow: () => number;
  private readonly requestId: () => string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: SuperserveHttpClientOptions) {
    const apiKey = options.apiKey.trim();
    if (!/^ss_live_[A-Za-z0-9_-]+$/.test(apiKey)) {
      throw new SuperserveProviderError({
        code: "INVALID_CONFIGURATION",
        operation: "create_sandbox",
      });
    }
    this.apiKey = apiKey;
    this.controlPlane = serviceUrl(
      options.controlPlaneUrl ?? DEFAULT_CONTROL_PLANE,
      "create_sandbox",
    );
    this.dataPlane = serviceUrl(
      options.dataPlaneUrl ?? DEFAULT_DATA_PLANE,
      "run_command",
    );
    this.requestTimeoutMs = positiveInteger(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      15 * 60_000,
      "create_sandbox",
    );
    this.maxControlResponseBytes = positiveInteger(
      options.maxControlResponseBytes ?? DEFAULT_CONTROL_RESPONSE_BYTES,
      2 * 1024 * 1024,
      "create_sandbox",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.requestId = options.requestId ?? (() => `ss-${randomUUID()}`);
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
  }

  async createSandbox(
    input: CreateSuperserveSandboxInput,
  ): Promise<SuperserveOperationResult<SuperserveSandboxRef, SuperserveCreateReceipt>> {
    const name = validateName(input.name);
    const template = input.template?.trim() || "superserve/base";
    if (template.length > 160 || /[\0\r\n]/.test(template)) {
      return invalidInput("create_sandbox");
    }
    this.assertNoProviderSecret([name, template, ...Object.values(input.metadata ?? {})], "create_sandbox");
    const activeTimeoutSeconds = positiveInteger(
      input.activeTimeoutSeconds ?? DEFAULT_ACTIVE_TIMEOUT_SECONDS,
      604_800,
      "create_sandbox",
    );
    const autoDeleteSeconds = nonNegativeInteger(
      input.autoDeleteSeconds ?? DEFAULT_AUTO_DELETE_SECONDS,
      2_592_000,
      "create_sandbox",
    );
    const allowOut = Array.from(
      new Set([
        REQUIRED_SUPERSERVE_EGRESS,
        ...(input.allowedHosts ?? []).map(validateHost),
      ]),
    );

    const response = await requestSuperserve({
      operation: "create_sandbox",
      url: endpoint(this.controlPlane, "/sandboxes"),
      method: "POST",
      headers: { "X-API-Key": this.apiKey },
      body: {
        name,
        from_template: template,
        timeout_seconds: activeTimeoutSeconds,
        auto_delete_seconds: autoDeleteSeconds,
        metadata: validateMetadata(input.metadata),
        network: {
          allow_out: allowOut,
          deny_out: ["0.0.0.0/0"],
        },
        preview_access: "private",
      },
      timeoutMs: this.requestTimeoutMs,
      maxResponseBytes: this.maxControlResponseBytes,
      expectedStatuses: [201],
      retryable: false,
      fetchImpl: this.fetchImpl,
      signal: input.signal,
      sleep: this.sleep,
      random: this.random,
    });
    const sandbox = parseSuperserveJson(
      response,
      "create_sandbox",
      sandboxResponseSchema,
    );
    if (sandbox.status !== "active") {
      throw new SuperserveProviderError({
        code: "INVALID_RESPONSE",
        operation: "create_sandbox",
        status: response.status,
      });
    }

    const receipt = sanitizeSuperserveReceipt({
      schemaVersion: 1,
      provider: "superserve",
      operation: "create_sandbox",
      requestId: receiptRequestId(this.requestId),
      recordedAt: this.now().toISOString(),
      sandboxId: sandbox.id,
      outcome: "created",
      sandboxStatus: "active",
      template,
      networkPolicy: "deny_by_default",
    }) as SuperserveCreateReceipt;

    return {
      data: { id: sandbox.id, name: sandbox.name, status: sandbox.status },
      receipt,
    };
  }

  async runCommand(
    input: RunSuperserveCommandInput,
  ): Promise<SuperserveOperationResult<SuperserveCommandOutput, SuperserveRunReceipt>> {
    const sandboxId = validateSandboxId(input.sandboxId, "run_command");
    const executable = input.executable.trim();
    const args = [...(input.args ?? [])];
    if (
      !executable ||
      executable.length > 4_096 ||
      /\0/.test(executable) ||
      args.length > 256 ||
      args.some((value) => value.length > 65_536 || /\0/.test(value))
    ) {
      return invalidInput("run_command");
    }
    if (
      input.workingDirectory !== undefined &&
      (!input.workingDirectory.startsWith("/") ||
        input.workingDirectory.length > 4_096 ||
        /\0/.test(input.workingDirectory))
    ) {
      return invalidInput("run_command");
    }
    this.assertNoProviderSecret([executable, ...args], "run_command");
    const timeoutMs = positiveInteger(
      input.timeoutMs,
      MAX_COMMAND_TIMEOUT_MS,
      "run_command",
    );
    const maxOutputBytes = positiveInteger(
      input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      MAX_OUTPUT_BYTES,
      "run_command",
    );
    const accessToken = await this.activate(sandboxId, "run_command", input.signal);
    const commandSha256 = createHash("sha256")
      .update(JSON.stringify([executable, args]))
      .digest("hex");
    const startedAt = this.monotonicNow();

    const response = await requestSuperserve({
      operation: "run_command",
      url: endpoint(this.dataPlane, "/exec"),
      method: "POST",
      headers: {
        "X-Access-Token": accessToken,
        "X-Superserve-Sandbox-Id": sandboxId,
      },
      body: {
        command: executable,
        args,
        ...(input.workingDirectory
          ? { working_dir: input.workingDirectory }
          : {}),
        timeout_s: Math.max(1, Math.ceil(timeoutMs / 1_000)),
      },
      timeoutMs: timeoutMs + Math.min(this.requestTimeoutMs, 30_000),
      maxResponseBytes: Math.min(
        2 * 1024 * 1024,
        maxOutputBytes * 6 + 64 * 1024,
      ),
      expectedStatuses: [200],
      retryable: false,
      fetchImpl: this.fetchImpl,
      signal: input.signal,
      sleep: this.sleep,
      random: this.random,
    });
    const result = parseSuperserveJson(
      response,
      "run_command",
      execResponseSchema,
    );
    const bounded = boundOutput(result.stdout, result.stderr, maxOutputBytes);
    const outputTruncated = result.truncated || bounded.truncated;
    const timedOut = result.exit_code === 124;
    const durationMs = Math.max(0, Math.round(this.monotonicNow() - startedAt));
    const output: SuperserveCommandOutput = {
      stdout: bounded.stdout,
      stderr: bounded.stderr,
      exitCode: result.exit_code,
      timedOut,
      outputTruncated,
    };
    const receipt = sanitizeSuperserveReceipt({
      schemaVersion: 1,
      provider: "superserve",
      operation: "run_command",
      requestId: receiptRequestId(this.requestId),
      recordedAt: this.now().toISOString(),
      sandboxId,
      outcome: timedOut
        ? "timed_out"
        : result.exit_code === 0
          ? "succeeded"
          : "failed",
      commandSha256,
      exitCode: result.exit_code,
      durationMs,
      timeoutMs,
      stdoutBytes: utf8Length(bounded.stdout),
      stderrBytes: utf8Length(bounded.stderr),
      outputTruncated,
    }) as SuperserveRunReceipt;
    return { data: output, receipt };
  }

  async pauseSandbox(
    sandboxIdInput: string,
    signal?: AbortSignal,
  ): Promise<SuperserveOperationResult<{ status: "paused" }, SuperservePauseReceipt>> {
    const sandboxId = validateSandboxId(sandboxIdInput, "pause_sandbox");
    const current = await this.getSandbox(sandboxId, "pause_sandbox", signal);
    let outcome: SuperservePauseReceipt["outcome"] = "paused";
    if (current.status === "paused") {
      outcome = "already_paused";
    } else if (current.status === "resuming") {
      throw new SuperserveProviderError({
        code: "SANDBOX_NOT_ACTIVE",
        operation: "pause_sandbox",
      });
    } else {
      try {
        await requestSuperserve({
          operation: "pause_sandbox",
          url: endpoint(this.controlPlane, `/sandboxes/${sandboxId}/pause`),
          method: "POST",
          headers: { "X-API-Key": this.apiKey },
          timeoutMs: this.requestTimeoutMs,
          maxResponseBytes: this.maxControlResponseBytes,
          expectedStatuses: [204],
          retryable: false,
          fetchImpl: this.fetchImpl,
          signal,
          sleep: this.sleep,
          random: this.random,
        });
      } catch (error) {
        if (!(error instanceof SuperserveProviderError) || error.status !== 409) {
          throw error;
        }
        const afterConflict = await this.getSandbox(
          sandboxId,
          "pause_sandbox",
          signal,
        );
        if (afterConflict.status !== "paused") throw error;
        outcome = "already_paused";
      }
    }
    const receipt = sanitizeSuperserveReceipt({
      schemaVersion: 1,
      provider: "superserve",
      operation: "pause_sandbox",
      requestId: receiptRequestId(this.requestId),
      recordedAt: this.now().toISOString(),
      sandboxId,
      outcome,
    }) as SuperservePauseReceipt;
    return { data: { status: "paused" }, receipt };
  }

  async resumeSandbox(
    sandboxIdInput: string,
    signal?: AbortSignal,
  ): Promise<SuperserveOperationResult<{ status: "active" }, SuperserveResumeReceipt>> {
    const sandboxId = validateSandboxId(sandboxIdInput, "resume_sandbox");
    await this.activate(sandboxId, "resume_sandbox", signal);
    const receipt = sanitizeSuperserveReceipt({
      schemaVersion: 1,
      provider: "superserve",
      operation: "resume_sandbox",
      requestId: receiptRequestId(this.requestId),
      recordedAt: this.now().toISOString(),
      sandboxId,
      outcome: "active",
    }) as SuperserveResumeReceipt;
    return { data: { status: "active" }, receipt };
  }

  async destroySandbox(
    sandboxIdInput: string,
    signal?: AbortSignal,
  ): Promise<SuperserveOperationResult<{ destroyed: true }, SuperserveDestroyReceipt>> {
    const sandboxId = validateSandboxId(sandboxIdInput, "destroy_sandbox");
    const response = await requestSuperserve({
      operation: "destroy_sandbox",
      url: endpoint(this.controlPlane, `/sandboxes/${sandboxId}`),
      method: "DELETE",
      headers: { "X-API-Key": this.apiKey },
      timeoutMs: this.requestTimeoutMs,
      maxResponseBytes: this.maxControlResponseBytes,
      expectedStatuses: [204, 404],
      retryable: true,
      fetchImpl: this.fetchImpl,
      signal,
      sleep: this.sleep,
      random: this.random,
    });
    const receipt = sanitizeSuperserveReceipt({
      schemaVersion: 1,
      provider: "superserve",
      operation: "destroy_sandbox",
      requestId: receiptRequestId(this.requestId),
      recordedAt: this.now().toISOString(),
      sandboxId,
      outcome: response.status === 404 ? "already_deleted" : "deleted",
    }) as SuperserveDestroyReceipt;
    return { data: { destroyed: true }, receipt };
  }

  private async activate(
    sandboxId: string,
    operation: "run_command" | "resume_sandbox",
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await requestSuperserve({
      operation,
      url: endpoint(this.controlPlane, `/sandboxes/${sandboxId}/activate`),
      method: "POST",
      headers: { "X-API-Key": this.apiKey },
      timeoutMs: this.requestTimeoutMs,
      maxResponseBytes: this.maxControlResponseBytes,
      expectedStatuses: [200],
      retryable: true,
      fetchImpl: this.fetchImpl,
      signal,
      sleep: this.sleep,
      random: this.random,
    });
    return parseSuperserveJson(response, operation, activateResponseSchema)
      .access_token;
  }

  private async getSandbox(
    sandboxId: string,
    operation: "pause_sandbox",
    signal?: AbortSignal,
  ) {
    const response = await requestSuperserve({
      operation,
      url: endpoint(this.controlPlane, `/sandboxes/${sandboxId}`),
      method: "GET",
      headers: { "X-API-Key": this.apiKey },
      timeoutMs: this.requestTimeoutMs,
      maxResponseBytes: this.maxControlResponseBytes,
      expectedStatuses: [200],
      retryable: true,
      fetchImpl: this.fetchImpl,
      signal,
      sleep: this.sleep,
      random: this.random,
    });
    return parseSuperserveJson(response, operation, sandboxStatusResponseSchema);
  }

  private assertNoProviderSecret(
    values: readonly string[],
    operation: SuperserveReceiptOperation,
  ): void {
    if (
      values.some(
        (value) =>
          value.includes(this.apiKey) ||
          /ss_live_[A-Za-z0-9_-]+/.test(value) ||
          /SUPERSERVE_API_KEY/.test(value),
      )
    ) {
      return invalidInput(operation);
    }
  }
}

/** Missing credentials disable live Superserve; no fixture is presented as live. */
export function createSuperserveClientFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: Omit<SuperserveHttpClientOptions, "apiKey"> = {},
): SuperserveHttpClient | null {
  const apiKey = env.SUPERSERVE_API_KEY?.trim();
  return apiKey ? new SuperserveHttpClient({ ...options, apiKey }) : null;
}
