import { describe, expect, it } from "vitest";

import { ProviderHttpError, type ProviderFetch } from "../../lib/providers/http";
import {
  createTeracClient,
  TeracProviderError,
  type TeracStudyResult,
} from "../../lib/providers/terac";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" },
  });
}

function queuedFetch(
  responses: Response[],
  calls: Array<{ url: string; init?: RequestInit }>,
): ProviderFetch {
  return async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  };
}

const feasibility = (status: "RECEIVED" | "RESPONDED" = "RESPONDED") => ({
  id: "feasibility-1",
  status,
  source: "api",
  taskDescription: "Complete checkout",
  panelDescription: "General population adults",
  submissionCount: 25,
  timelineHours: 8,
  costPerParticipant: status === "RESPONDED" ? "6.50" : null,
  respondedAt: status === "RESPONDED" ? "2026-08-15T18:00:00.000Z" : null,
  createdAt: "2026-08-15T17:00:00.000Z",
  dashboard_url: "https://terac.com/example",
});

const opportunity = (
  status: "draft" | "active" | "completed",
  id = "study-holdout",
) => ({
  id,
  title: "Talos checkout study",
  internal_title: "Talos TAL-01 HOLDOUT",
  description: "Attempt checkout",
  status,
  num_participants: 3,
  project_id: "project-1",
  created_at: "2026-08-15T18:00:00.000Z",
  updated_at: "2026-08-15T19:00:00.000Z",
  launched_at: status === "draft" ? null : "2026-08-15T18:01:00.000Z",
  pricing: {
    cost_per_participant_cents: 650,
    total_cost_cents: 1950,
    currency: "usd",
  },
  submission_stats: {
    total: 3,
    in_progress: 0,
    awaiting_review: 0,
    approved: 2,
    rejected: 1,
  },
});

const launchInput = {
  phase: "HOLDOUT" as const,
  orderId: "TAL-01",
  projectId: "project-1",
  title: "Talos checkout study",
  description: "Attempt the checkout without assistance.",
  targetUrl: "https://candidate.example.test/checkout",
  criticalJourney: "Submit checkout",
  successCriterion: "Reach the confirmed-order screen",
  requestedParticipants: 3,
  durationMinutes: 5,
  feasibilityRequestId: "feasibility-1",
  screeningQuestions: [
    {
      key: "can_attempt",
      text: "Can you attempt an online checkout on your current device?",
      pick: "one" as const,
      answers: [
        { text: "Yes", qualify_logic: "may" as const },
        { text: "No", qualify_logic: "reject" as const },
      ],
    },
  ],
  baselineStudyId: "study-baseline",
};

function submission(
  id: string,
  participantId: string,
  status: "approved" | "rejected" | "abandoned",
  studyId = "study-holdout",
) {
  return {
    id,
    opportunity_id: studyId,
    status,
    participant_id: participantId,
    created_at: "2026-08-15T18:05:00.000Z",
    updated_at: "2026-08-15T18:10:00.000Z",
  };
}

function baselineResult(participantIds: string[]): TeracStudyResult {
  return {
    studyId: "study-baseline",
    phase: "BASELINE",
    cohortId: "baseline-cohort-hash",
    baselineStudyId: null,
    opportunityStatus: "completed",
    requestedParticipants: participantIds.length,
    rawCounts: {
      screen_passed: 0,
      screened_out: 0,
      in_progress: 0,
      awaiting_review: 0,
      approved: participantIds.length,
      rejected: 0,
      abandoned: 0,
    },
    participantIds,
    participantIdsByStatus: {
      screen_passed: [],
      screened_out: [],
      in_progress: [],
      awaiting_review: [],
      approved: participantIds,
      rejected: [],
      abandoned: [],
    },
    observedAt: "2026-08-15T18:00:00.000Z",
    receipts: [],
    attemptedParticipants: participantIds.length,
    completedParticipants: participantIds.length,
    successfulParticipants: participantIds.length,
    unsuccessfulParticipants: 0,
    completionRate: 1,
    isFreshCohort: false,
    excludedCohortId: null,
  };
}

describe("Terac REST v2 client", () => {
  it("requests a feasibility quote with bearer auth and preserves the quote", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createTeracClient({
      apiKey: "tk_secret_value",
      fetchImpl: queuedFetch([jsonResponse(feasibility("RECEIVED"))], calls),
    });

    const result = await client.requestFeasibility({
      taskDescription: "Complete checkout",
      panelDescription: "General population adults",
      submissionCount: 25,
      timelineHours: 8,
    });

    expect(result.quote).toMatchObject({
      requestId: "feasibility-1",
      status: "RECEIVED",
      costPerParticipantUsd: null,
    });
    expect(calls[0]?.url).toBe(
      "https://terac.com/api/external/v2/feasibility/requests",
    );
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
      "Bearer tk_secret_value",
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      submissionCount: 25,
      timelineHours: 8,
    });
    expect(JSON.stringify(result)).not.toContain("tk_secret_value");
  });

  it("launches a holdout only after confirming the disjoint-study filter", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createTeracClient({
      apiKey: "tk_test",
      fetchImpl: queuedFetch(
        [
          jsonResponse(feasibility()),
          jsonResponse({
            data: [
              {
                slug: "reference--has_not_taken_study",
                operators: ["$in"],
              },
            ],
          }),
          jsonResponse(opportunity("draft")),
          jsonResponse(opportunity("active")),
        ],
        calls,
      ),
    });

    const result = await client.launchHoldoutStudy(launchInput);

    expect(result).toMatchObject({
      studyId: "study-holdout",
      phase: "HOLDOUT",
      baselineStudyId: "study-baseline",
      participantExclusionFilterApplied: true,
    });
    const createBody = JSON.parse(String(calls[2]?.init?.body));
    expect(createBody.filters).toContainEqual({
      "reference--has_not_taken_study": { $in: ["study-baseline"] },
    });
    expect(createBody.tasks[0]).toMatchObject({
      task_type: "activity",
      review_type: "auto_approve",
      task_url: "https://candidate.example.test/checkout",
    });
    expect(calls[3]?.init?.body).toBe("{}");
  });

  it("fails closed when the feasibility request has not been priced", async () => {
    const client = createTeracClient({
      apiKey: "tk_test",
      fetchImpl: queuedFetch([jsonResponse(feasibility("RECEIVED"))], []),
    });

    await expect(client.launchHoldoutStudy(launchInput)).rejects.toMatchObject({
      code: "FEASIBILITY_PENDING",
    });
  });

  it("paginates submissions and preserves raw counts and cohort identity", async () => {
    const client = createTeracClient({
      apiKey: "tk_test",
      fetchImpl: queuedFetch(
        [
          jsonResponse(opportunity("completed")),
          jsonResponse({
            data: [
              submission("sub-1", "holdout-p1", "approved"),
              submission("sub-2", "holdout-p2", "rejected"),
            ],
            pagination: { has_more: true, next_cursor: "cursor-2" },
          }),
          jsonResponse({
            data: [submission("sub-3", "holdout-p3", "abandoned")],
            pagination: { has_more: false, next_cursor: null },
          }),
        ],
        [],
      ),
    });

    const result = await client.getStudyResult({
      studyId: "study-holdout",
      phase: "HOLDOUT",
      minimumParticipants: 3,
      baseline: baselineResult(["baseline-p1", "baseline-p2"]),
    });

    expect(result.rawCounts).toMatchObject({
      approved: 1,
      rejected: 1,
      abandoned: 1,
    });
    expect(result).toMatchObject({
      attemptedParticipants: 3,
      completedParticipants: 2,
      successfulParticipants: 1,
      unsuccessfulParticipants: 2,
      completionRate: 1 / 3,
      isFreshCohort: true,
      excludedCohortId: "baseline-cohort-hash",
    });
    expect(result.cohortId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.participantIds).toEqual([
      "holdout-p1",
      "holdout-p2",
      "holdout-p3",
    ]);
  });

  it("rejects any post-hoc participant overlap despite the launch filter", async () => {
    const client = createTeracClient({
      apiKey: "tk_test",
      fetchImpl: queuedFetch(
        [
          jsonResponse(opportunity("completed")),
          jsonResponse({
            data: [
              submission("sub-1", "baseline-p1", "approved"),
              submission("sub-2", "holdout-p2", "approved"),
              submission("sub-3", "holdout-p3", "approved"),
            ],
            pagination: { has_more: false, next_cursor: null },
          }),
        ],
        [],
      ),
    });

    await expect(
      client.getStudyResult({
        studyId: "study-holdout",
        phase: "HOLDOUT",
        minimumParticipants: 3,
        baseline: baselineResult(["baseline-p1"]),
      }),
    ).rejects.toMatchObject({ code: "COHORT_OVERLAP" });
  });

  it("does not return results for an active or undersized study", async () => {
    const client = createTeracClient({
      apiKey: "tk_test",
      fetchImpl: queuedFetch(
        [
          jsonResponse(opportunity("active", "study-baseline")),
          jsonResponse({
            data: [],
            pagination: { has_more: false, next_cursor: null },
          }),
        ],
        [],
      ),
    });

    await expect(
      client.getStudyResult({
        studyId: "study-baseline",
        phase: "BASELINE",
        minimumParticipants: 3,
      }),
    ).rejects.toMatchObject({ code: "STUDY_NOT_COMPLETE" });
  });

  it("aborts a stalled request at the configured timeout", async () => {
    const stalledFetch: ProviderFetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const client = createTeracClient({
      apiKey: "tk_test",
      timeoutMs: 5,
      fetchImpl: stalledFetch,
    });

    await expect(client.getFeasibilityQuote("feasibility-1")).rejects.toEqual(
      expect.objectContaining<Partial<ProviderHttpError>>({ code: "TIMEOUT" }),
    );
  });

  it("rejects beta API shape drift instead of guessing", async () => {
    const client = createTeracClient({
      apiKey: "tk_test",
      fetchImpl: queuedFetch([jsonResponse({ id: "changed-shape" })], []),
    });

    await expect(client.getFeasibilityQuote("feasibility-1")).rejects.toEqual(
      expect.objectContaining<Partial<ProviderHttpError>>({
        code: "INVALID_RESPONSE",
      }),
    );
  });

  it("uses stable, sanitized policy errors", () => {
    const error = new TeracProviderError("COHORT_OVERLAP");
    expect(error.message).toBe("Terac operation failed (COHORT_OVERLAP)");
  });
});
