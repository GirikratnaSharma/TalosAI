export type SuperserveSandboxStatus = "active" | "paused" | "resuming";

export interface SuperserveSandboxRef {
  readonly id: string;
  readonly name: string;
  readonly status: SuperserveSandboxStatus;
}

export interface CreateSuperserveSandboxInput {
  readonly name: string;
  readonly template?: string;
  /** Active-session cap. Superserve pauses the VM when this expires. */
  readonly activeTimeoutSeconds?: number;
  /** Cleanup window after pause. The adapter still destroys explicitly. */
  readonly autoDeleteSeconds?: number;
  readonly metadata?: Readonly<Record<string, string>>;
  /** Egress remains deny-by-default; these hosts are the only additions. */
  readonly allowedHosts?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface RunSuperserveCommandInput {
  readonly sandboxId: string;
  /** Executed directly, not through a shell. Use /bin/sh explicitly if needed. */
  readonly executable: string;
  readonly args?: readonly string[];
  readonly workingDirectory?: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
}

export interface SuperserveCommandOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly outputTruncated: boolean;
}

export type SuperserveReceiptOperation =
  | "create_sandbox"
  | "run_command"
  | "pause_sandbox"
  | "resume_sandbox"
  | "destroy_sandbox";

interface SuperserveReceiptBase {
  readonly schemaVersion: 1;
  readonly provider: "superserve";
  readonly operation: SuperserveReceiptOperation;
  /** Talos-generated correlation ID. Never a credential or raw provider body. */
  readonly requestId: string;
  readonly recordedAt: string;
  readonly sandboxId: string;
}

export interface SuperserveCreateReceipt extends SuperserveReceiptBase {
  readonly operation: "create_sandbox";
  readonly outcome: "created";
  readonly sandboxStatus: "active";
  readonly template: string;
  readonly networkPolicy: "deny_by_default";
}

export interface SuperserveRunReceipt extends SuperserveReceiptBase {
  readonly operation: "run_command";
  readonly outcome: "succeeded" | "failed" | "timed_out";
  readonly commandSha256: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly timeoutMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly outputTruncated: boolean;
}

export interface SuperservePauseReceipt extends SuperserveReceiptBase {
  readonly operation: "pause_sandbox";
  readonly outcome: "paused" | "already_paused";
}

export interface SuperserveResumeReceipt extends SuperserveReceiptBase {
  readonly operation: "resume_sandbox";
  readonly outcome: "active";
}

export interface SuperserveDestroyReceipt extends SuperserveReceiptBase {
  readonly operation: "destroy_sandbox";
  readonly outcome: "deleted" | "already_deleted";
}

export type SuperserveSanitizedReceipt =
  | SuperserveCreateReceipt
  | SuperserveRunReceipt
  | SuperservePauseReceipt
  | SuperserveResumeReceipt
  | SuperserveDestroyReceipt;

export interface SuperserveOperationResult<
  TData,
  TReceipt extends SuperserveSanitizedReceipt,
> {
  readonly data: TData;
  readonly receipt: TReceipt;
}

export type SuperserveProviderErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_INPUT"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT"
  | "NETWORK_ERROR"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_RESPONSE"
  | "PROVIDER_REJECTED"
  | "SANDBOX_NOT_ACTIVE";

export class SuperserveProviderError extends Error {
  readonly code: SuperserveProviderErrorCode;
  readonly operation: SuperserveReceiptOperation;
  readonly status?: number;
  readonly providerCode?: string;

  constructor(input: {
    code: SuperserveProviderErrorCode;
    operation: SuperserveReceiptOperation;
    status?: number;
    providerCode?: string;
  }) {
    const statusText = input.status === undefined ? "" : `, HTTP ${input.status}`;
    const providerText = input.providerCode ? `, ${input.providerCode}` : "";
    super(`${input.operation} failed (${input.code}${statusText}${providerText})`);
    this.name = "SuperserveProviderError";
    this.code = input.code;
    this.operation = input.operation;
    this.status = input.status;
    this.providerCode = input.providerCode;
  }
}

export type SuperserveFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SuperserveHttpClientOptions {
  readonly apiKey: string;
  readonly controlPlaneUrl?: string;
  readonly dataPlaneUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly maxControlResponseBytes?: number;
  readonly fetchImpl?: SuperserveFetch;
  readonly now?: () => Date;
  readonly monotonicNow?: () => number;
  readonly requestId?: () => string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}
