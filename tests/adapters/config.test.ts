import { describe, expect, it } from "vitest";

import {
  parseProviderEnvironment,
  PROVIDER_ENVIRONMENT_SPECS,
} from "../../lib/config/providers";

describe("provider capability configuration", () => {
  it("defaults core providers to explicit fixture mode and optional providers off", () => {
    const environment = parseProviderEnvironment({});

    expect(environment.report.core).toBe("fixture_only");
    expect(environment.report.providers.replay).toMatchObject({
      requestedMode: "fixture",
      effectiveMode: "fixture",
      liveReady: false,
      status: "fixture",
    });
    expect(environment.report.providers.render).toMatchObject({
      requestedMode: "disabled",
      effectiveMode: "disabled",
      status: "disabled",
    });
    expect(() => environment.assertLive("replay")).toThrow(
      "Live replay calls are disabled",
    );
  });

  it("never silently falls back when live mode lacks credentials", () => {
    const environment = parseProviderEnvironment({
      TALOS_REPLAY_MODE: "live",
      REPLAY_API_URL: "https://provider.invalid",
    });

    expect(environment.report.core).toBe("blocked");
    expect(environment.report.providers.replay).toMatchObject({
      requestedMode: "live",
      effectiveMode: "unavailable",
      liveReady: false,
      status: "live_credentials_missing",
      configuredVariables: ["REPLAY_API_URL"],
      missingVariables: ["REPLAY_API_KEY", "REPLAY_WEBHOOK_SECRET"],
    });
    expect(() => environment.assertLive("replay")).toThrow(
      "capability status is live_credentials_missing",
    );
  });

  it("reports live readiness using names while keeping every value private", () => {
    const secrets = {
      replayUrl: "https://replay.example.test",
      replayKey: "replay-secret-should-never-serialize",
      replayWebhook: "replay-webhook-secret-should-never-serialize",
      superserveUrl: "https://superserve.example.test",
      superserveKey: "superserve-secret-should-never-serialize",
      teracUrl: "https://terac.example.test",
      teracKey: "terac-secret-should-never-serialize",
      stripeKey: "stripe-secret-should-never-serialize",
      stripeWebhook: "webhook-secret-should-never-serialize",
      stripePaymentLink: "https://buy.stripe.test/organizer-approved-link",
      stripePaymentLinkId: "plink_secret-should-never-serialize",
    };
    const environment = parseProviderEnvironment({
      TALOS_REPLAY_MODE: "live",
      REPLAY_API_URL: secrets.replayUrl,
      REPLAY_API_KEY: secrets.replayKey,
      REPLAY_WEBHOOK_SECRET: secrets.replayWebhook,
      TALOS_SUPERSERVE_MODE: "live",
      SUPERSERVE_API_URL: secrets.superserveUrl,
      SUPERSERVE_API_KEY: secrets.superserveKey,
      TALOS_TERAC_MODE: "live",
      TERAC_API_URL: secrets.teracUrl,
      TERAC_API_KEY: secrets.teracKey,
      TALOS_STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: secrets.stripeKey,
      STRIPE_WEBHOOK_SECRET: secrets.stripeWebhook,
      STRIPE_PAYMENT_LINK_URL: secrets.stripePaymentLink,
      STRIPE_PAYMENT_LINK_ID: secrets.stripePaymentLinkId,
    });

    expect(environment.report.core).toBe("live");
    expect(environment.report.providers.replay.configuredVariables).toEqual([
      "REPLAY_API_URL",
      "REPLAY_API_KEY",
      "REPLAY_WEBHOOK_SECRET",
    ]);
    expect(environment.report.providers.stripe.configuredVariables).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PAYMENT_LINK_URL",
      "STRIPE_PAYMENT_LINK_ID",
    ]);

    const serialized = JSON.stringify(environment);
    for (const secret of Object.values(secrets)) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain("variable names only");

    const providerSawCredentials = environment.withLiveCredentials(
      "replay",
      (credentials) =>
        credentials.REPLAY_API_KEY === secrets.replayKey &&
        credentials.REPLAY_API_URL === secrets.replayUrl &&
        credentials.REPLAY_WEBHOOK_SECRET === secrets.replayWebhook,
    );
    expect(providerSawCredentials).toBe(true);
  });

  it("rejects invalid mode values without echoing the supplied value", () => {
    const unsafeValue = "do-not-echo-this-value";

    expect(() =>
      parseProviderEnvironment({
        [PROVIDER_ENVIRONMENT_SPECS.replay.modeVariable]: unsafeValue,
      }),
    ).toThrow("Invalid TALOS_REPLAY_MODE");

    try {
      parseProviderEnvironment({
        TALOS_REPLAY_MODE: unsafeValue,
      });
    } catch (error) {
      expect(String(error)).not.toContain(unsafeValue);
    }
  });
});
