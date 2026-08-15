import "server-only";

import { createAdminClient } from "@insforge/sdk";
import { z } from "zod";

const environmentSchema = z.object({
  INSFORGE_URL: z.string().trim().url().startsWith("https://"),
  INSFORGE_API_KEY: z.string().trim().min(1),
});

const providerSchema = z.enum(["stripe", "replay", "terac", "superserve"]);

export interface ProviderInboxReceipt {
  id: string;
  duplicate: boolean;
}

export class ProviderInboxUnavailableError extends Error {
  constructor() {
    super("Talos provider inbox is unavailable");
    this.name = "ProviderInboxUnavailableError";
  }
}

export function createProviderInbox(
  environment: Record<string, string | undefined> = process.env,
) {
  const parsedEnvironment = environmentSchema.safeParse(environment);
  if (!parsedEnvironment.success) {
    throw new ProviderInboxUnavailableError();
  }

  const client = createAdminClient({
    baseUrl: parsedEnvironment.data.INSFORGE_URL,
    apiKey: parsedEnvironment.data.INSFORGE_API_KEY,
    retryCount: 0,
    timeout: 5_000,
  });

  return {
    async record(input: {
      provider: z.infer<typeof providerSchema>;
      providerEventId: string;
      payloadHash: string;
    }): Promise<ProviderInboxReceipt> {
      const parsed = z
        .object({
          provider: providerSchema,
          providerEventId: z.string().min(1).max(255),
          payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(input);

      const existing = await client.database
        .from("talos_provider_inbox")
        .select("id,payload_hash")
        .eq("provider", parsed.provider)
        .eq("provider_event_id", parsed.providerEventId)
        .maybeSingle();

      if (existing.error) {
        throw new ProviderInboxUnavailableError();
      }

      if (existing.data) {
        const existingRow = z
          .object({ id: z.string().uuid(), payload_hash: z.string() })
          .parse(existing.data);
        if (existingRow.payload_hash !== parsed.payloadHash) {
          throw new ProviderInboxUnavailableError();
        }
        return { id: existingRow.id, duplicate: true };
      }

      const inserted = await client.database
        .from("talos_provider_inbox")
        .insert([
          {
            provider: parsed.provider,
            provider_event_id: parsed.providerEventId,
            payload_hash: parsed.payloadHash,
          },
        ])
        .select("id")
        .maybeSingle();

      if (inserted.error || !inserted.data) {
        // A concurrent delivery may have won the unique constraint. Re-read
        // before declaring failure so retries remain idempotent.
        const raced = await client.database
          .from("talos_provider_inbox")
          .select("id,payload_hash")
          .eq("provider", parsed.provider)
          .eq("provider_event_id", parsed.providerEventId)
          .maybeSingle();
        if (raced.error || !raced.data) {
          throw new ProviderInboxUnavailableError();
        }
        const racedRow = z
          .object({ id: z.string().uuid(), payload_hash: z.string() })
          .parse(raced.data);
        if (racedRow.payload_hash !== parsed.payloadHash) {
          throw new ProviderInboxUnavailableError();
        }
        return { id: racedRow.id, duplicate: true };
      }

      const insertedRow = z.object({ id: z.string().uuid() }).parse(inserted.data);
      return { id: insertedRow.id, duplicate: false };
    },
  };
}
