import { createHash } from "node:crypto";

import { z } from "zod";

import {
  type ProviderFetch,
  type SanitizedHttpReceipt,
  requestValidatedJson,
} from "../http";
import {
  buildIdentityResponseSchema,
  replayBugDetailResponseSchema,
  replayBugListResponseSchema,
  replayBugStatusSchema,
  replayCreateProjectResponseSchema,
  replayMarkFixedResponseSchema,
  replayProjectDetailResponseSchema,
  replayProjectStatusResponseSchema,
  replayProjectTimingResponseSchema,
} from "./schemas";

const DEFAULT_BASE_URL = "https://qa.replay.io/api/v1";
const OFFICIAL_API_HOSTS = new Set(["qa.replay.io", "loop-qa.replay.io"]);

export const REPLAY_QA_OPERATIONS = [
  "create_project",
  "get_project",
  "get_status",
  "get_timing",
  "list_bugs",
  "get_bug_root_cause",
  "mark_fixed",
  "get_build_identity",
] as const;

export type ReplayQaOperation = (typeof REPLAY_QA_OPERATIONS)[number];
export type ReplayBugStatus = z.infer<typeof replayBugStatusSchema>;

export interface ReplayQaReceipt extends SanitizedHttpReceipt {
  readonly provider: "replay";
  readonly operation: ReplayQaOperation;
}

export interface ReplayQaResult<T> {
  readonly data: T;
  readonly receipt: ReplayQaReceipt;
}

export interface ReplayCreatedProject {
  readonly projectId?: string;
  readonly explorationId: string;
  readonly dashboardUrl: string;
  readonly reverseProxySetupUrl?: string;
}

export interface ReplayProjectStatus {
  readonly projectId: string;
  readonly status?: string;
  readonly idle?: boolean;
  readonly counts: {
    readonly explorations?: number;
    readonly journeys?: number;
    readonly testRuns?: number;
    readonly bugs?: number;
    readonly openBugs?: number;
    readonly resolvedBugs?: number;
  };
}

export interface ReplayBugSummary {
  readonly bugId: string;
  readonly title: string;
  readonly status: ReplayBugStatus;
  readonly severity?: string;
}

export interface ReplayBugRootCause extends ReplayBugSummary {
  readonly severity: string;
  readonly description: string;
  readonly reproductionSteps: readonly string[];
  readonly expectedBehavior: string;
  readonly actualBehavior: string;
  readonly replayRecordingId: string;
  readonly recordingUrl: string;
  readonly analysis: string;
  readonly polishCategory?: string | null;
}

export interface ReplayExactBuildEvidence {
  readonly authority: "replay";
  readonly projectId: string;
  readonly targetUrl: string;
  readonly candidateCommitSha: string;
  readonly replayFinishedAt: string;
  readonly disqualifyingBugCount: 0;
  readonly clean: true;
  readonly evidenceSha256: string;
  readonly receipts: readonly ReplayQaReceipt[];
}

export type ReplayEvidenceErrorCode =
  | "BUG_ID_MISMATCH"
  | "BUILD_IDENTITY_ORIGIN_MISMATCH"
  | "BUILD_SHA_MISMATCH"
  | "DISQUALIFYING_BUGS"
  | "PROJECT_TARGET_MISMATCH"
  | "QA_NOT_IDLE";

export class ReplayEvidenceError extends Error {
  readonly code: ReplayEvidenceErrorCode;

  constructor(code: ReplayEvidenceErrorCode) {
    super(`Replay evidence rejected (${code})`);
    this.name = "ReplayEvidenceError";
    this.code = code;
  }
}

export interface ReplayQaHttpClientOptions {
  readonly apiToken: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: ProviderFetch;
}

const createProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(1_000),
    targetUrl: z.string().url().max(2_048),
    instructions: z.string().trim().min(1).max(50_000),
    webhookUrl: z.string().url().max(2_048).optional(),
    finishedWebhookUrl: z.string().url().max(2_048).optional(),
    designDocument: z.string().max(100_000).optional(),
    useReverseProxy: z.boolean().optional(),
    budget: z.number().nonnegative().optional(),
  })
  .strict();

const exactBuildInputSchema = z
  .object({
    projectId: z.string().trim().min(1).max(256),
    targetUrl: z.string().url().max(2_048),
    buildIdentityUrl: z.string().url().max(2_048),
    candidateCommitSha: z
      .string()
      .trim()
      .regex(/^[A-Fa-f0-9]{7,64}$/),
  })
  .strict();

function apiBaseUrl(raw: string): URL {
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:" ||
    !OFFICIAL_API_HOSTS.has(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError("Replay baseUrl must be an official HTTPS API origin");
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (path === "") parsed.pathname = "/api/v1";
  else if (path !== "/api/v1") {
    throw new TypeError("Replay baseUrl must end at /api/v1");
  }
  return parsed;
}

function projectIdFromDashboardUrl(raw: string): string | undefined {
  const segments = new URL(raw).pathname.split("/").filter(Boolean);
  const projectsIndex = segments.lastIndexOf("projects");
  const projectId =
    projectsIndex >= 0 ? segments[projectsIndex + 1] : undefined;
  return projectId ? decodeURIComponent(projectId) : undefined;
}

function replayReceipt(
  operation: ReplayQaOperation,
  receipt: SanitizedHttpReceipt,
): ReplayQaReceipt {
  return Object.freeze({
    ...receipt,
    provider: "replay",
    operation,
  });
}

function bugSummary(input: {
  bug_id: string;
  title: string;
  status: ReplayBugStatus;
  severity?: string;
}): ReplayBugSummary {
  return Object.freeze({
    bugId: input.bug_id,
    title: input.title,
    status: input.status,
    ...(input.severity ? { severity: input.severity } : {}),
  });
}

function sameNormalizedTarget(left: string, right: string): boolean {
  const a = new URL(left);
  const b = new URL(right);
  a.hash = "";
  b.hash = "";
  return a.toString() === b.toString();
}

export class ReplayQaHttpClient {
  readonly #apiToken: string;
  readonly #baseUrl: URL;
  readonly #timeoutMs?: number;
  readonly #maxResponseBytes?: number;
  readonly #fetchImpl?: ProviderFetch;

  constructor(options: ReplayQaHttpClientOptions) {
    const token = options.apiToken.trim();
    if (!token.startsWith("lqa_") || token.length <= 4) {
      throw new TypeError("Replay apiToken must be a non-empty lqa_ token");
    }
    this.#apiToken = token;
    this.#baseUrl = apiBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#timeoutMs = options.timeoutMs;
    this.#maxResponseBytes = options.maxResponseBytes;
    this.#fetchImpl = options.fetchImpl;
  }

  #url(path: string): URL {
    return new URL(
      `${this.#baseUrl.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
      this.#baseUrl.origin,
    );
  }

  async #request<TSchema extends z.ZodType>(input: {
    operation: ReplayQaOperation;
    path: string;
    method: "GET" | "POST" | "PATCH";
    schema: TSchema;
    body?: unknown;
  }): Promise<ReplayQaResult<z.output<TSchema>>> {
    const result = await requestValidatedJson({
      operation: `replay.${input.operation}`,
      url: this.#url(input.path),
      method: input.method,
      bearerToken: this.#apiToken,
      schema: input.schema,
      body: input.body,
      timeoutMs: this.#timeoutMs,
      maxResponseBytes: this.#maxResponseBytes,
      fetchImpl: this.#fetchImpl,
    });
    return {
      data: result.data,
      receipt: replayReceipt(input.operation, result.receipt),
    };
  }

  async createProject(
    input: z.input<typeof createProjectInputSchema>,
  ): Promise<ReplayQaResult<ReplayCreatedProject>> {
    const parsed = createProjectInputSchema.parse(input);
    const target = new URL(parsed.targetUrl);
    const localTarget =
      target.hostname === "localhost" ||
      target.hostname === "127.0.0.1" ||
      target.hostname === "[::1]";
    if (target.protocol !== "https:" && !(localTarget && parsed.useReverseProxy)) {
      throw new TypeError(
        "Replay targetUrl must be HTTPS unless a local reverse proxy is enabled",
      );
    }

    const response = await this.#request({
      operation: "create_project",
      path: "projects",
      method: "POST",
      schema: replayCreateProjectResponseSchema,
      body: {
        name: parsed.name,
        target_url: parsed.targetUrl,
        instructions: parsed.instructions,
        ...(parsed.webhookUrl ? { webhook_url: parsed.webhookUrl } : {}),
        ...(parsed.finishedWebhookUrl
          ? { finished_webhook_url: parsed.finishedWebhookUrl }
          : {}),
        ...(parsed.designDocument
          ? { design_document: parsed.designDocument }
          : {}),
        ...(parsed.useReverseProxy !== undefined
          ? { use_reverse_proxy: parsed.useReverseProxy }
          : {}),
        ...(parsed.budget !== undefined ? { budget: parsed.budget } : {}),
      },
    });

    const projectId =
      response.data.project_id ??
      projectIdFromDashboardUrl(response.data.url);
    return {
      data: Object.freeze({
        ...(projectId ? { projectId } : {}),
        explorationId: response.data.exploration_id,
        dashboardUrl: response.data.url,
        ...(response.data.reverse_proxy_setup_url
          ? { reverseProxySetupUrl: response.data.reverse_proxy_setup_url }
          : {}),
      }),
      receipt: response.receipt,
    };
  }

  async getProject(projectId: string) {
    const id = z.string().trim().min(1).max(256).parse(projectId);
    return this.#request({
      operation: "get_project",
      path: `projects/${encodeURIComponent(id)}`,
      method: "GET",
      schema: replayProjectDetailResponseSchema,
    });
  }

  async getStatus(
    projectId: string,
  ): Promise<ReplayQaResult<ReplayProjectStatus>> {
    const id = z.string().trim().min(1).max(256).parse(projectId);
    const response = await this.#request({
      operation: "get_status",
      path: `projects/${encodeURIComponent(id)}/status`,
      method: "GET",
      schema: replayProjectStatusResponseSchema,
    });
    const counts = response.data.counts;
    return {
      data: Object.freeze({
        projectId: response.data.project_id ?? id,
        ...(response.data.status ? { status: response.data.status } : {}),
        ...(response.data.idle !== undefined
          ? { idle: response.data.idle }
          : {}),
        counts: Object.freeze({
          explorations:
            response.data.exploration_count ?? counts?.explorations,
          journeys: response.data.journey_count ?? counts?.journeys,
          testRuns: response.data.test_run_count ?? counts?.test_runs,
          bugs: response.data.bug_count ?? counts?.bugs,
          openBugs: response.data.open_bug_count ?? counts?.open_bugs,
          resolvedBugs:
            response.data.resolved_bug_count ?? counts?.resolved_bugs,
        }),
      }),
      receipt: response.receipt,
    };
  }

  async getTiming(projectId: string) {
    const id = z.string().trim().min(1).max(256).parse(projectId);
    return this.#request({
      operation: "get_timing",
      path: `projects/${encodeURIComponent(id)}/timing`,
      method: "GET",
      schema: replayProjectTimingResponseSchema,
    });
  }

  async listBugs(input: {
    projectId: string;
    status?: Extract<ReplayBugStatus, "open" | "fixed" | "wontfix" | "invalid">;
    page?: number;
    pageSize?: number;
  }): Promise<ReplayQaResult<readonly ReplayBugSummary[]>> {
    const parsed = z
      .object({
        projectId: z.string().trim().min(1).max(256),
        status: z.enum(["open", "fixed", "wontfix", "invalid"]).optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
      })
      .strict()
      .parse(input);
    const query = new URLSearchParams();
    if (parsed.status) query.set("status", parsed.status);
    if (parsed.page) query.set("page", String(parsed.page));
    if (parsed.pageSize) query.set("page_size", String(parsed.pageSize));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = await this.#request({
      operation: "list_bugs",
      path: `projects/${encodeURIComponent(parsed.projectId)}/bugs${suffix}`,
      method: "GET",
      schema: replayBugListResponseSchema,
    });
    const bugs = Array.isArray(response.data)
      ? response.data
      : response.data.bugs;
    return {
      data: Object.freeze(bugs.map(bugSummary)),
      receipt: response.receipt,
    };
  }

  async getBugRootCause(
    bugId: string,
  ): Promise<ReplayQaResult<ReplayBugRootCause>> {
    const id = z.string().trim().min(1).max(256).parse(bugId);
    const response = await this.#request({
      operation: "get_bug_root_cause",
      path: `bugs/${encodeURIComponent(id)}`,
      method: "GET",
      schema: replayBugDetailResponseSchema,
    });
    const bug = response.data;
    return {
      data: Object.freeze({
        ...bugSummary(bug),
        severity: bug.severity,
        description: bug.description,
        reproductionSteps: Object.freeze([...bug.reproduction_steps]),
        expectedBehavior: bug.expected_behavior,
        actualBehavior: bug.actual_behavior,
        replayRecordingId: bug.replay_recording_id,
        recordingUrl: `https://app.replay.io/recording/${encodeURIComponent(bug.replay_recording_id)}`,
        analysis: bug.analysis,
        ...(bug.polish_category !== undefined
          ? { polishCategory: bug.polish_category }
          : {}),
      }),
      receipt: response.receipt,
    };
  }

  async markFixed(
    bugId: string,
  ): Promise<
    ReplayQaResult<
      ReplayBugSummary & { readonly automaticRetryRequested: true }
    >
  > {
    const id = z.string().trim().min(1).max(256).parse(bugId);
    const response = await this.#request({
      operation: "mark_fixed",
      path: `bugs/${encodeURIComponent(id)}`,
      method: "PATCH",
      schema: replayMarkFixedResponseSchema,
      body: { status: "fixed" },
    });
    if (response.data.bug_id !== id) {
      throw new ReplayEvidenceError("BUG_ID_MISMATCH");
    }
    return {
      data: Object.freeze({
        ...bugSummary(response.data),
        automaticRetryRequested: true,
      }),
      receipt: response.receipt,
    };
  }

  async captureExactBuildEvidence(
    input: z.input<typeof exactBuildInputSchema>,
  ): Promise<ReplayExactBuildEvidence> {
    const parsed = exactBuildInputSchema.parse(input);
    const target = new URL(parsed.targetUrl);
    const identity = new URL(parsed.buildIdentityUrl);
    if (target.origin !== identity.origin) {
      throw new ReplayEvidenceError("BUILD_IDENTITY_ORIGIN_MISMATCH");
    }

    const [project, status, timing, open, invalid, wontfix, build] =
      await Promise.all([
        this.getProject(parsed.projectId),
        this.getStatus(parsed.projectId),
        this.getTiming(parsed.projectId),
        this.listBugs({ projectId: parsed.projectId, status: "open", pageSize: 100 }),
        this.listBugs({ projectId: parsed.projectId, status: "invalid", pageSize: 100 }),
        this.listBugs({ projectId: parsed.projectId, status: "wontfix", pageSize: 100 }),
        requestValidatedJson({
          operation: "replay.get_build_identity",
          url: identity,
          method: "GET",
          schema: buildIdentityResponseSchema,
          timeoutMs: this.#timeoutMs,
          maxResponseBytes: this.#maxResponseBytes,
          fetchImpl: this.#fetchImpl,
        }),
      ]);

    if (!sameNormalizedTarget(project.data.target_url, parsed.targetUrl)) {
      throw new ReplayEvidenceError("PROJECT_TARGET_MISMATCH");
    }
    if (!timing.data.finished_at || status.data.idle === false) {
      throw new ReplayEvidenceError("QA_NOT_IDLE");
    }
    const disqualifyingBugCount =
      open.data.length + invalid.data.length + wontfix.data.length;
    if (disqualifyingBugCount > 0) {
      throw new ReplayEvidenceError("DISQUALIFYING_BUGS");
    }
    if (
      build.data.sha.toLowerCase() !==
      parsed.candidateCommitSha.toLowerCase()
    ) {
      throw new ReplayEvidenceError("BUILD_SHA_MISMATCH");
    }

    const buildReceipt = replayReceipt("get_build_identity", build.receipt);
    const receipts = Object.freeze([
      project.receipt,
      status.receipt,
      timing.receipt,
      open.receipt,
      invalid.receipt,
      wontfix.receipt,
      buildReceipt,
    ]);
    const evidenceSha256 = createHash("sha256")
      .update(
        JSON.stringify({
          projectId: parsed.projectId,
          targetUrl: parsed.targetUrl,
          candidateCommitSha: parsed.candidateCommitSha.toLowerCase(),
          replayFinishedAt: timing.data.finished_at,
          responseHashes: receipts.map((receipt) => receipt.responseSha256),
        }),
      )
      .digest("hex");

    return Object.freeze({
      authority: "replay",
      projectId: parsed.projectId,
      targetUrl: parsed.targetUrl,
      candidateCommitSha: parsed.candidateCommitSha,
      replayFinishedAt: timing.data.finished_at,
      disqualifyingBugCount: 0,
      clean: true,
      evidenceSha256,
      receipts,
    });
  }
}
