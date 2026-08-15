import { describe, expect, it } from "vitest";

import {
  parseProviderInboxInput,
  PROVIDER_INBOX_PROVIDERS,
} from "../../lib/server/provider-inbox";

describe("Talos provider inbox", () => {
  it("accepts Pioneer using the same provider spelling as the migration", () => {
    expect(PROVIDER_INBOX_PROVIDERS).toContain("pioneer");
    expect(
      parseProviderInboxInput({
        provider: "pioneer",
        providerEventId: "spec-02",
        payloadHash:
          "b20ddbc71c231b47b5a74dba1d63daef513c86702f22299de9b24b856b41e336",
      }),
    ).toEqual({
      provider: "pioneer",
      providerEventId: "spec-02",
      payloadHash:
        "b20ddbc71c231b47b5a74dba1d63daef513c86702f22299de9b24b856b41e336",
    });
  });

  it("rejects providers outside the migration allowlist", () => {
    expect(() =>
      parseProviderInboxInput({
        provider: "arbitrary-provider",
        providerEventId: "event-01",
        payloadHash:
          "b20ddbc71c231b47b5a74dba1d63daef513c86702f22299de9b24b856b41e336",
      }),
    ).toThrow();
  });
});
