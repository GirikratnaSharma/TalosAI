import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requestValidatedJson,
  type ProviderFetch,
  type SanitizedHttpReceipt,
} from "../http";
import { TeracProviderError } from "./errors";
import {
  feasibilityResponseSchema,
  filterCatalogSchema,
  opportunityResponseSchema,
  submissionPageSchema,
  submissionStatusSchema,
  type TeracSubmission,
  type TeracSubmissionStatus,
} from "./schemas";
import type {
  TeracBaselineLaunchInput,
  TeracClient,
  TeracFeasibilityQuote,
  TeracFeasibilityRequestInput,
  TeracFilter,
  TeracHoldoutLaunchInput,
  TeracRawSubmissionCounts,
  TeracResultInput,
  TeracHoldoutResultInput,
  TeracStudyLaunch,
  TeracStudyProgress,
  TeracStudyResult,
} from "./types";

const OFFICIAL_API_BASE_URL = "https://terac.com/api/external/v2/";
const DISJOINT_COHORT_FILTER = "reference--has_not_taken_study";
const MAX_SUBMISSION_PAGES = 100;

const clientConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().url().startsWith("https://").default(OFFICIAL_API_BASE_URL),
  timeoutMs: z.number().int().positive().max(120_000).default(15_000),
});

const feasibilityInputSchema = z.object({
  taskDescription: z.string().trim().min(1).max(10_000),
  panelDescription: z.string().trim().min(1).max(10_000),
  submissionCount: z.number().int().positive(),
  timelineHours: z.number().int().positive(),
  requestorEmail: z.string().email().optional(),
});

const screeningAnswerSchema = z.object({
  text: z.string().trim().min(1),
  qualify_logic: z.enum(["may", "must", "must_one_of", "reject"]),
});

const screeningQuestionSchema = z.object({
  key: z.string().trim().min(1),
  text: z.string().trim().min(1),
  pick: z.enum(["one", "any", "boolean"]),
  answers: z.array(screeningAnswerSchema).min(1),
});

const filterValueSchema = z.union([
  z.string().min(1),
  z.number(),
  z.array(z.string().min(1)).min(1),
]);
const filterSchema = z.record(
  z.string().min(1),
  z.record(z.string().min(1), filterValueSchema),
);

const launchBaseSchema = z.object({
  orderId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5_000),
  targetUrl: z.string().url().startsWith("https://"),
  criticalJourney: z.string().trim().min(1),
  successCriterion: z.string().trim().min(1),
  requestedParticipants: z.number().int().min(1).max(1_000),
  durationMinutes: z.number().int().positive(),
  feasibilityRequestId: z.string().trim().min(1),
  screeningQuestions: z.array(screeningQuestionSchema).min(1),
  filters: z.array(filterSchema).optional(),
});

const baselineLaunchSchema = launchBaseSchema.extend({
  phase: z.literal("BASELINE"),
});
const holdoutLaunchSchema = launchBaseSchema.extend({
  phase: z.literal("HOLDOUT"),
  baselineStudyId: z.string().trim().min(1),
});

const resourceIdSchema = z.string().trim().min(1).max(500);
const minimumParticipantsSchema = z.number().int().positive();

const ALL_STATUSES = submissionStatusSchema.options;

export interface CreateTeracClientInput {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: ProviderFetch;
}

function toUrl(baseUrl: URL, path: string): URL {
  return new URL(path.replace(/^\//, ""), baseUrl);
}

function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new TeracProviderError("INVALID_INPUT");
  }
  return parsed.data;
}

function quoteFromResponse(
  response: z.infer<typeof feasibilityResponseSchema>,
): TeracFeasibilityQuote {
  return {
    requestId: response.id,
    status: response.status,
    submissionCount: response.submissionCount ?? null,
    timelineHours: response.timelineHours ?? null,
    costPerParticipantUsd: response.costPerParticipant,
    respondedAt: response.respondedAt ?? null,
    createdAt: response.createdAt,
    dashboardUrl: response.dashboard_url ?? null,
  };
}

function requirePricedQuote(quote: TeracFeasibilityQuote): void {
  if (quote.status === "RECEIVED") {
    throw new TeracProviderError("FEASIBILITY_PENDING");
  }
  if (
    quote.status !== "RESPONDED" ||
    quote.costPerParticipantUsd === null
  ) {
    throw new TeracProviderError("FEASIBILITY_UNAVAILABLE");
  }
}

function emptyCounts(): TeracRawSubmissionCounts {
  return Object.fromEntries(
    ALL_STATUSES.map((status) => [status, 0]),
  ) as TeracRawSubmissionCounts;
}

function emptyIdsByStatus(): Record<TeracSubmissionStatus, string[]> {
  return Object.fromEntries(
    ALL_STATUSES.map((status) => [status, []]),
  ) as unknown as Record<TeracSubmissionStatus, string[]>;
}

function cohortFingerprint(participantIds: readonly string[]): string {
  return createHash("sha256")
    .update([...participantIds].sort().join("\n"))
    .digest("hex");
}

function latestObservation(
  submissions: readonly TeracSubmission[],
  opportunityUpdatedAt: string,
): string {
  return submissions.reduce(
    (latest, submission) =>
      submission.updated_at > latest ? submission.updated_at : latest,
    opportunityUpdatedAt,
  );
}

export function createTeracClient(input: CreateTeracClientInput): TeracClient {
  const parsedConfig = clientConfigSchema.safeParse(input);
  if (!parsedConfig.success) {
    throw new TeracProviderError("INVALID_CONFIGURATION");
  }

  const apiKey = parsedConfig.data.apiKey;
  const baseUrl = new URL(parsedConfig.data.baseUrl);
  const timeoutMs = parsedConfig.data.timeoutMs;
  const fetchImpl = input.fetchImpl;

  async function request<TSchema extends z.ZodType>(requestInput: {
    operation: string;
    path: string;
    method: "GET" | "POST";
    schema: TSchema;
    body?: unknown;
  }) {
    return requestValidatedJson({
      operation: requestInput.operation,
      url: toUrl(baseUrl, requestInput.path),
      method: requestInput.method,
      bearerToken: apiKey,
      schema: requestInput.schema,
      ...(requestInput.body === undefined ? {} : { body: requestInput.body }),
      timeoutMs,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }

  async function getFeasibilityQuote(requestId: string) {
    const id = parseOrFail(resourceIdSchema, requestId);
    const response = await request({
      operation: "terac.get_feasibility_quote",
      path: `feasibility/requests/${encodeURIComponent(id)}`,
      method: "GET",
      schema: feasibilityResponseSchema,
    });
    return { quote: quoteFromResponse(response.data), receipt: response.receipt };
  }

  async function assertDisjointFilterAvailable(): Promise<SanitizedHttpReceipt> {
    const response = await request({
      operation: "terac.verify_disjoint_filter",
      path: "filters",
      method: "GET",
      schema: filterCatalogSchema,
    });
    const filter = response.data.data.find(
      ({ slug }) => slug === DISJOINT_COHORT_FILTER,
    );
    if (!filter?.operators.includes("$in")) {
      throw new TeracProviderError("DISJOINT_FILTER_UNAVAILABLE");
    }
    return response.receipt;
  }

  async function launchStudy(
    rawInput: TeracBaselineLaunchInput | TeracHoldoutLaunchInput,
  ): Promise<TeracStudyLaunch> {
    const launchInput =
      rawInput.phase === "BASELINE"
        ? parseOrFail(baselineLaunchSchema, rawInput)
        : parseOrFail(holdoutLaunchSchema, rawInput);

    const quoteResponse = await getFeasibilityQuote(
      launchInput.feasibilityRequestId,
    );
    requirePricedQuote(quoteResponse.quote);
    const receipts: SanitizedHttpReceipt[] = [quoteResponse.receipt];

    const filters: TeracFilter[] = [...(launchInput.filters ?? [])];
    let baselineStudyId: string | null = null;
    if (launchInput.phase === "HOLDOUT") {
      baselineStudyId = launchInput.baselineStudyId;
      receipts.push(await assertDisjointFilterAvailable());
      filters.push({
        [DISJOINT_COHORT_FILTER]: { $in: [launchInput.baselineStudyId] },
      });
    }

    const draftResponse = await request({
      operation: `terac.create_${launchInput.phase.toLowerCase()}_study`,
      path: "opportunities",
      method: "POST",
      schema: opportunityResponseSchema,
      body: {
        title: launchInput.title,
        internal_title: `Talos ${launchInput.orderId} ${launchInput.phase}`,
        description: launchInput.description,
        project_id: launchInput.projectId,
        num_participants: launchInput.requestedParticipants,
        business_type: "b2c",
        tasks: [
          {
            sequence: 1,
            task_type: "activity",
            review_type: "auto_approve",
            task_url: launchInput.targetUrl,
            title: launchInput.criticalJourney,
            description: launchInput.successCriterion,
            duration_minutes: launchInput.durationMinutes,
          },
        ],
        ...(filters.length > 0
          ? { filters }
          : { unrestricted_audience: true }),
        screening_questions: launchInput.screeningQuestions,
        expected_days_to_complete: 5,
        feasibility_request_id: launchInput.feasibilityRequestId,
      },
    });
    receipts.push(draftResponse.receipt);
    if (draftResponse.data.status !== "draft") {
      throw new TeracProviderError("INVALID_INPUT");
    }

    const launchedResponse = await request({
      operation: `terac.launch_${launchInput.phase.toLowerCase()}_study`,
      path: `opportunities/${encodeURIComponent(draftResponse.data.id)}/launch`,
      method: "POST",
      schema: opportunityResponseSchema,
      body: {},
    });
    receipts.push(launchedResponse.receipt);
    if (
      launchedResponse.data.status !== "active" ||
      !launchedResponse.data.launched_at
    ) {
      throw new TeracProviderError("INVALID_INPUT");
    }

    return {
      studyId: launchedResponse.data.id,
      phase: launchInput.phase,
      status: "active",
      projectId: launchedResponse.data.project_id,
      requestedParticipants: launchedResponse.data.num_participants,
      baselineStudyId,
      participantExclusionFilterApplied: launchInput.phase === "HOLDOUT",
      launchedAt: launchedResponse.data.launched_at,
      pricing: launchedResponse.data.pricing
        ? {
            costPerParticipantCents:
              launchedResponse.data.pricing.cost_per_participant_cents,
            totalCostCents: launchedResponse.data.pricing.total_cost_cents,
            currency: launchedResponse.data.pricing.currency,
          }
        : null,
      receipts,
    };
  }

  async function getAllSubmissions(studyId: string) {
    const submissions: TeracSubmission[] = [];
    const receipts: SanitizedHttpReceipt[] = [];
    const seenSubmissionIds = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    for (let page = 0; page < MAX_SUBMISSION_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const response = await request({
        operation: "terac.list_submissions",
        path: `opportunities/${encodeURIComponent(studyId)}/submissions?${query}`,
        method: "GET",
        schema: submissionPageSchema,
      });
      receipts.push(response.receipt);

      for (const submission of response.data.data) {
        if (
          submission.opportunity_id !== studyId ||
          seenSubmissionIds.has(submission.id)
        ) {
          throw new TeracProviderError("INCONSISTENT_SUBMISSIONS");
        }
        seenSubmissionIds.add(submission.id);
        submissions.push(submission);
      }

      if (!response.data.pagination.has_more) {
        return { submissions, receipts };
      }
      const nextCursor = response.data.pagination.next_cursor;
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new TeracProviderError("INCONSISTENT_SUBMISSIONS");
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    throw new TeracProviderError("INCONSISTENT_SUBMISSIONS");
  }

  async function getStudyProgress(rawStudyId: string): Promise<TeracStudyProgress> {
    const studyId = parseOrFail(resourceIdSchema, rawStudyId);
    const opportunityResponse = await request({
      operation: "terac.get_study",
      path: `opportunities/${encodeURIComponent(studyId)}`,
      method: "GET",
      schema: opportunityResponseSchema,
    });
    const submissionResponse = await getAllSubmissions(studyId);
    const rawCounts = emptyCounts();
    const participantIdsByStatus = emptyIdsByStatus();
    const participantIds = new Set<string>();

    for (const submission of submissionResponse.submissions) {
      rawCounts[submission.status] += 1;
      participantIdsByStatus[submission.status].push(submission.participant_id);
      participantIds.add(submission.participant_id);
    }

    for (const ids of Object.values(participantIdsByStatus)) ids.sort();

    return {
      studyId,
      opportunityStatus: opportunityResponse.data.status,
      requestedParticipants: opportunityResponse.data.num_participants,
      rawCounts,
      participantIds: [...participantIds].sort(),
      participantIdsByStatus,
      observedAt: latestObservation(
        submissionResponse.submissions,
        opportunityResponse.data.updated_at,
      ),
      receipts: [opportunityResponse.receipt, ...submissionResponse.receipts],
    };
  }

  async function getStudyResult(
    rawInput: TeracResultInput | TeracHoldoutResultInput,
  ): Promise<TeracStudyResult> {
    const studyId = parseOrFail(resourceIdSchema, rawInput.studyId);
    const minimumParticipants = parseOrFail(
      minimumParticipantsSchema,
      rawInput.minimumParticipants,
    );
    const progress = await getStudyProgress(studyId);
    if (progress.opportunityStatus !== "completed") {
      throw new TeracProviderError("STUDY_NOT_COMPLETE");
    }

    const successful = progress.rawCounts.approved;
    const rejected = progress.rawCounts.rejected;
    const abandoned = progress.rawCounts.abandoned;
    const completed = successful + rejected;
    const attempted = completed + abandoned;
    if (
      attempted < minimumParticipants ||
      progress.rawCounts.in_progress > 0 ||
      progress.rawCounts.awaiting_review > 0
    ) {
      throw new TeracProviderError("INSUFFICIENT_COHORT");
    }

    const cohortId = cohortFingerprint(progress.participantIds);
    let baselineStudyId: string | null = null;
    let excludedCohortId: string | null = null;
    if (rawInput.phase === "HOLDOUT") {
      baselineStudyId = rawInput.baseline.studyId;
      excludedCohortId = rawInput.baseline.cohortId;
      if (studyId === baselineStudyId) {
        throw new TeracProviderError("STUDY_ID_REUSED");
      }
      const baselineParticipants = new Set(rawInput.baseline.participantIds);
      if (
        progress.participantIds.some((participantId) =>
          baselineParticipants.has(participantId),
        )
      ) {
        throw new TeracProviderError("COHORT_OVERLAP");
      }
    }

    return {
      ...progress,
      phase: rawInput.phase,
      cohortId,
      baselineStudyId,
      attemptedParticipants: attempted,
      completedParticipants: completed,
      successfulParticipants: successful,
      unsuccessfulParticipants: rejected + abandoned,
      completionRate: successful / attempted,
      isFreshCohort: rawInput.phase === "HOLDOUT",
      excludedCohortId,
    };
  }

  return Object.freeze({
    async requestFeasibility(rawInput: TeracFeasibilityRequestInput) {
      const feasibilityInput = parseOrFail(feasibilityInputSchema, rawInput);
      const response = await request({
        operation: "terac.request_feasibility",
        path: "feasibility/requests",
        method: "POST",
        schema: feasibilityResponseSchema,
        body: feasibilityInput,
      });
      return { quote: quoteFromResponse(response.data), receipt: response.receipt };
    },
    getFeasibilityQuote,
    launchBaselineStudy: (input: TeracBaselineLaunchInput) =>
      launchStudy(input),
    launchHoldoutStudy: (input: TeracHoldoutLaunchInput) =>
      launchStudy(input),
    getStudyProgress,
    getStudyResult,
  });
}
