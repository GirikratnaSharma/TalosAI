import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(256);
const absoluteUrlSchema = z.string().url().max(2_048);
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const timestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Expected an ISO-compatible timestamp",
);

export const replayBugStatusSchema = z.enum([
  "open",
  "reopened",
  "fixed",
  "wontfix",
  "invalid",
  "judge-rejected",
  "pr-closed",
]);

export const replayCreateProjectResponseSchema = z
  .object({
    exploration_id: identifierSchema,
    url: absoluteUrlSchema,
    project_id: identifierSchema.optional(),
    reverse_proxy_setup_url: absoluteUrlSchema.optional(),
  })
  .passthrough();

export const replayProjectDetailResponseSchema = z
  .object({
    project_id: identifierSchema,
    target_url: absoluteUrlSchema,
    name: z.string().trim().min(1).max(1_000).optional(),
    url: absoluteUrlSchema.optional(),
  })
  .passthrough();

const replayStatusCountsSchema = z
  .object({
    explorations: nonNegativeIntegerSchema.optional(),
    journeys: nonNegativeIntegerSchema.optional(),
    test_runs: nonNegativeIntegerSchema.optional(),
    bugs: nonNegativeIntegerSchema.optional(),
    open_bugs: nonNegativeIntegerSchema.optional(),
    resolved_bugs: nonNegativeIntegerSchema.optional(),
  })
  .passthrough();

export const replayProjectStatusResponseSchema = z
  .object({
    project_id: identifierSchema.optional(),
    status: z.string().trim().min(1).max(80).optional(),
    idle: z.boolean().optional(),
    exploration_count: nonNegativeIntegerSchema.optional(),
    journey_count: nonNegativeIntegerSchema.optional(),
    test_run_count: nonNegativeIntegerSchema.optional(),
    bug_count: nonNegativeIntegerSchema.optional(),
    open_bug_count: nonNegativeIntegerSchema.optional(),
    resolved_bug_count: nonNegativeIntegerSchema.optional(),
    counts: replayStatusCountsSchema.optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (
      value.status === undefined &&
      value.idle === undefined &&
      value.exploration_count === undefined &&
      value.journey_count === undefined &&
      value.test_run_count === undefined &&
      value.bug_count === undefined &&
      value.open_bug_count === undefined &&
      value.resolved_bug_count === undefined &&
      value.counts === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Project status did not contain a documented summary field",
      });
    }
  });

export const replayProjectTimingResponseSchema = z
  .object({
    created_at: timestampSchema,
    started_at: timestampSchema.nullable(),
    first_event_at: timestampSchema.nullable(),
    finished_at: timestampSchema.nullable(),
    time_to_first_event_ms: nonNegativeIntegerSchema.nullable(),
    time_to_complete_ms: nonNegativeIntegerSchema.nullable(),
  })
  .passthrough();

export const replayBugSummaryResponseSchema = z
  .object({
    bug_id: identifierSchema,
    title: z.string().trim().min(1).max(1_000),
    status: replayBugStatusSchema,
    severity: z.string().trim().min(1).max(80).optional(),
  })
  .passthrough();

export const replayBugListResponseSchema = z.union([
  z.array(replayBugSummaryResponseSchema).max(100),
  z
    .object({
      bugs: z.array(replayBugSummaryResponseSchema).max(100),
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().max(100).optional(),
      total: nonNegativeIntegerSchema.optional(),
    })
    .passthrough(),
]);

export const replayBugDetailResponseSchema = z
  .object({
    bug_id: identifierSchema,
    title: z.string().trim().min(1).max(1_000),
    status: replayBugStatusSchema,
    severity: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(50_000),
    reproduction_steps: z.array(z.string().trim().min(1).max(5_000)).max(100),
    expected_behavior: z.string().trim().min(1).max(20_000),
    actual_behavior: z.string().trim().min(1).max(20_000),
    replay_recording_id: identifierSchema,
    analysis: z.string().trim().min(1).max(100_000),
    polish_category: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .passthrough();

export const replayMarkFixedResponseSchema = replayBugSummaryResponseSchema
  .extend({ status: z.literal("fixed") })
  .passthrough();

export const buildIdentityResponseSchema = z
  .object({
    sha: z.string().trim().regex(/^[A-Fa-f0-9]{7,64}$/),
  })
  .passthrough();

export type ReplayCreateProjectResponse = z.infer<
  typeof replayCreateProjectResponseSchema
>;
export type ReplayProjectStatusResponse = z.infer<
  typeof replayProjectStatusResponseSchema
>;
export type ReplayProjectTimingResponse = z.infer<
  typeof replayProjectTimingResponseSchema
>;
export type ReplayBugSummaryResponse = z.infer<
  typeof replayBugSummaryResponseSchema
>;
export type ReplayBugDetailResponse = z.infer<
  typeof replayBugDetailResponseSchema
>;
