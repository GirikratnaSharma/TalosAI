import { describe, expect, it } from "vitest";

import {
  ReplayEvidenceError,
  ReplayQaHttpClient,
} from "../../lib/providers/replay";
import type { ProviderFetch } from "../../lib/providers/http";

const PROJECT_ID = "project_123";
const BUG_ID = "bug_123";
const SHA = "a3f9c21";
const TARGET_URL = "https://candidate.talos.test/checkout";
const IDENTITY_URL = "https://candidate.talos.test/api/version";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queueFetch(
  responses: readonly unknown[],
  requests: Array<{ url: string; init?: RequestInit }> = [],
): ProviderFetch {
  let index = 0;
  return async (input, init) => {
    requests.push({ url: String(input), init });
    const response = responses[index++];
    if (response === undefined) throw new Error("Unexpected request");
    return response instanceof Response ? response : jsonResponse(response);
  };
}

function client(fetchImpl: ProviderFetch): ReplayQaHttpClient {
  return new ReplayQaHttpClient({
    apiToken: "lqa_test-token-that-must-stay-private",
    fetchImpl,
  });
}

function bugDetail(status: "open" | "fixed" = "open") {
  return {
    bug_id: BUG_ID,
    title: "Checkout never creates a payment intent",
    status,
    severity: "high",
    description: "Submit appears successful but no request leaves the browser.",
    reproduction_steps: ["Open checkout", "Submit valid details"],
    expected_behavior: "A payment intent is created.",
    actual_behavior: "No request is sent.",
    replay_recording_id: "recording_123",
    analysis: "The submit handler returns before calling the API client.",
    polish_category: null,
  };
}

describe("Replay QA HTTP client", () => {
  it("creates a project using the documented payload and sanitizes its receipt", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = queueFetch(
      [
        {
          exploration_id: "exploration_123",
          url: `https://qa.replay.io/projects/${PROJECT_ID}`,
          internal_secret: "must-not-reach-receipt",
        },
      ],
      requests,
    );
    const result = await client(fetchImpl).createProject({
      name: "Talos checkout repair",
      targetUrl: TARGET_URL,
      instructions: "Verify the checkout submission flow.",
      webhookUrl: "https://talos.test/api/webhooks/replay/bug",
      finishedWebhookUrl: "https://talos.test/api/webhooks/replay/finished",
      budget: 20,
    });

    expect(result.data).toMatchObject({
      projectId: PROJECT_ID,
      explorationId: "exploration_123",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://qa.replay.io/api/v1/projects");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      name: "Talos checkout repair",
      target_url: TARGET_URL,
      instructions: "Verify the checkout submission flow.",
      webhook_url: "https://talos.test/api/webhooks/replay/bug",
      finished_webhook_url:
        "https://talos.test/api/webhooks/replay/finished",
      budget: 20,
    });
    expect(JSON.stringify(result.receipt)).not.toContain("internal_secret");
    expect(JSON.stringify(result.receipt)).not.toContain("lqa_test-token");
  });

  it("gets status, lists bugs, reads root cause, and marks fixed", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = queueFetch(
      [
        {
          project_id: PROJECT_ID,
          status: "idle",
          idle: true,
          bug_count: 1,
          open_bug_count: 1,
          resolved_bug_count: 0,
        },
        {
          bugs: [
            {
              bug_id: BUG_ID,
              title: "Checkout is broken",
              status: "open",
              severity: "high",
            },
          ],
          page: 1,
          page_size: 100,
          total: 1,
        },
        bugDetail(),
        {
          bug_id: BUG_ID,
          title: "Checkout is broken",
          status: "fixed",
          severity: "high",
        },
      ],
      requests,
    );
    const replay = client(fetchImpl);

    const status = await replay.getStatus(PROJECT_ID);
    const bugs = await replay.listBugs({
      projectId: PROJECT_ID,
      status: "open",
      page: 1,
      pageSize: 100,
    });
    const rootCause = await replay.getBugRootCause(BUG_ID);
    const fixed = await replay.markFixed(BUG_ID);

    expect(status.data).toMatchObject({
      projectId: PROJECT_ID,
      idle: true,
      counts: { bugs: 1, openBugs: 1, resolvedBugs: 0 },
    });
    expect(bugs.data).toHaveLength(1);
    expect(rootCause.data).toMatchObject({
      bugId: BUG_ID,
      replayRecordingId: "recording_123",
      recordingUrl: "https://app.replay.io/recording/recording_123",
      analysis: "The submit handler returns before calling the API client.",
    });
    expect(fixed.data).toMatchObject({
      bugId: BUG_ID,
      status: "fixed",
      automaticRetryRequested: true,
    });
    expect(requests[3]?.init?.method).toBe("PATCH");
    expect(requests[3]?.init?.body).toBe(JSON.stringify({ status: "fixed" }));
  });

  it("issues clean evidence only for an idle exact target and exact build", async () => {
    const fetchImpl = queueFetch([
      {
        project_id: PROJECT_ID,
        target_url: TARGET_URL,
        name: "Talos checkout repair",
      },
      { project_id: PROJECT_ID, status: "idle", idle: true, bug_count: 0 },
      {
        created_at: "2026-08-15T18:00:00.000Z",
        started_at: "2026-08-15T18:00:10.000Z",
        first_event_at: "2026-08-15T18:00:12.000Z",
        finished_at: "2026-08-15T18:03:00.000Z",
        time_to_first_event_ms: 12_000,
        time_to_complete_ms: 180_000,
      },
      { bugs: [] },
      { bugs: [] },
      { bugs: [] },
      { sha: SHA },
    ]);

    const evidence = await client(fetchImpl).captureExactBuildEvidence({
      projectId: PROJECT_ID,
      targetUrl: TARGET_URL,
      buildIdentityUrl: IDENTITY_URL,
      candidateCommitSha: SHA,
    });

    expect(evidence).toMatchObject({
      authority: "replay",
      projectId: PROJECT_ID,
      targetUrl: TARGET_URL,
      candidateCommitSha: SHA,
      replayFinishedAt: "2026-08-15T18:03:00.000Z",
      disqualifyingBugCount: 0,
      clean: true,
    });
    expect(evidence.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.receipts).toHaveLength(7);
  });

  it("fails closed for dismissed findings and a mismatched build", async () => {
    const common = [
      { project_id: PROJECT_ID, target_url: TARGET_URL },
      { project_id: PROJECT_ID, status: "idle", idle: true, bug_count: 1 },
      {
        created_at: "2026-08-15T18:00:00.000Z",
        started_at: "2026-08-15T18:00:10.000Z",
        first_event_at: "2026-08-15T18:00:12.000Z",
        finished_at: "2026-08-15T18:03:00.000Z",
        time_to_first_event_ms: 12_000,
        time_to_complete_ms: 180_000,
      },
    ] as const;
    const invalidBug = {
      bug_id: BUG_ID,
      title: "Dismissed bug",
      status: "invalid",
    };
    const replayWithDismissal = client(
      queueFetch([
        ...common,
        { bugs: [] },
        { bugs: [invalidBug] },
        { bugs: [] },
        { sha: SHA },
      ]),
    );

    await expect(
      replayWithDismissal.captureExactBuildEvidence({
        projectId: PROJECT_ID,
        targetUrl: TARGET_URL,
        buildIdentityUrl: IDENTITY_URL,
        candidateCommitSha: SHA,
      }),
    ).rejects.toMatchObject({ code: "DISQUALIFYING_BUGS" });

    const replayWithWrongBuild = client(
      queueFetch([
        ...common,
        { bugs: [] },
        { bugs: [] },
        { bugs: [] },
        { sha: "fffffff" },
      ]),
    );
    await expect(
      replayWithWrongBuild.captureExactBuildEvidence({
        projectId: PROJECT_ID,
        targetUrl: TARGET_URL,
        buildIdentityUrl: IDENTITY_URL,
        candidateCommitSha: SHA,
      }),
    ).rejects.toBeInstanceOf(ReplayEvidenceError);
    await expect(
      client(queueFetch([])).captureExactBuildEvidence({
        projectId: PROJECT_ID,
        targetUrl: TARGET_URL,
        buildIdentityUrl: "https://attacker.test/api/version",
        candidateCommitSha: SHA,
      }),
    ).rejects.toMatchObject({ code: "BUILD_IDENTITY_ORIGIN_MISMATCH" });
  });

  it("rejects unofficial API origins and malformed tokens before fetch", () => {
    expect(
      () =>
        new ReplayQaHttpClient({
          apiToken: "lqa_test",
          baseUrl: "https://attacker.test/api/v1",
        }),
    ).toThrow("official HTTPS API origin");
    expect(() => new ReplayQaHttpClient({ apiToken: "secret" })).toThrow(
      "non-empty lqa_ token",
    );
  });
});
