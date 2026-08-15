import { z } from "zod";

export const feasibilityResponseSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum([
      "RECEIVED",
      "RESPONDED",
      "WON",
      "LOST",
      "NOT_PURSUED",
    ]),
    source: z.string().min(1),
    taskDescription: z.string(),
    panelDescription: z.string(),
    submissionCount: z.number().int().nonnegative().nullable().optional(),
    timelineHours: z.number().int().positive().nullable().optional(),
    costPerParticipant: z.string().min(1).nullable(),
    respondedAt: z.string().datetime({ offset: true }).nullable().optional(),
    createdAt: z.string().datetime({ offset: true }),
    dashboard_url: z.string().url().optional(),
  })
  .passthrough();

export const opportunityResponseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    internal_title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    status: z.enum(["draft", "active", "paused", "completed"]),
    num_participants: z.number().int().nonnegative(),
    project_id: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    launched_at: z.string().datetime({ offset: true }).nullable().optional(),
    pricing: z
      .object({
        cost_per_participant_cents: z.number().int().nonnegative(),
        total_cost_cents: z.number().int().nonnegative(),
        currency: z.literal("usd"),
      })
      .nullable()
      .optional(),
    submission_stats: z
      .object({
        total: z.number().int().nonnegative(),
        in_progress: z.number().int().nonnegative(),
        awaiting_review: z.number().int().nonnegative(),
        approved: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
      })
      .optional(),
  })
  .passthrough();

export const submissionStatusSchema = z.enum([
  "screen_passed",
  "screened_out",
  "in_progress",
  "awaiting_review",
  "approved",
  "rejected",
  "abandoned",
]);

export const submissionSchema = z
  .object({
    id: z.string().min(1),
    opportunity_id: z.string().min(1),
    status: submissionStatusSchema,
    participant_id: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    screening_outcome: z.string().nullable().optional(),
  })
  .passthrough();

export const submissionPageSchema = z
  .object({
    data: z.array(submissionSchema),
    pagination: z.object({
      next_cursor: z.string().min(1).nullable().optional(),
      has_more: z.boolean(),
    }),
    dashboard_url: z.string().url().optional(),
  })
  .passthrough();

export const filterCatalogSchema = z
  .object({
    data: z.array(
      z
        .object({
          slug: z.string().min(1),
          operators: z.array(z.string().min(1)),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type TeracSubmissionStatus = z.infer<typeof submissionStatusSchema>;
export type TeracSubmission = z.infer<typeof submissionSchema>;
