import {
  PROVIDER_NAMES,
  type ProviderName,
} from "../adapters/core";

export type RequestedProviderMode = "live" | "fixture" | "disabled";
export type EffectiveProviderMode =
  | RequestedProviderMode
  | "unavailable";

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

interface ProviderEnvironmentSpec {
  readonly modeVariable: string;
  readonly requiredVariables: readonly string[];
  readonly requiredForCore: boolean;
  readonly defaultMode: RequestedProviderMode;
}

export const PROVIDER_ENVIRONMENT_SPECS = {
  replay: {
    modeVariable: "TALOS_REPLAY_MODE",
    requiredVariables: [
      "REPLAY_API_URL",
      "REPLAY_API_KEY",
      "REPLAY_WEBHOOK_SECRET",
    ],
    requiredForCore: true,
    defaultMode: "fixture",
  },
  superserve: {
    modeVariable: "TALOS_SUPERSERVE_MODE",
    requiredVariables: ["SUPERSERVE_API_URL", "SUPERSERVE_API_KEY"],
    requiredForCore: true,
    defaultMode: "fixture",
  },
  terac: {
    modeVariable: "TALOS_TERAC_MODE",
    requiredVariables: ["TERAC_API_URL", "TERAC_API_KEY"],
    requiredForCore: true,
    defaultMode: "fixture",
  },
  stripe: {
    modeVariable: "TALOS_STRIPE_MODE",
    requiredVariables: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PAYMENT_LINK_URL",
      "STRIPE_PAYMENT_LINK_ID",
    ],
    requiredForCore: true,
    defaultMode: "fixture",
  },
  render: {
    modeVariable: "TALOS_RENDER_MODE",
    requiredVariables: ["RENDER_API_KEY", "RENDER_WORKFLOW_ID"],
    requiredForCore: false,
    defaultMode: "disabled",
  },
  band: {
    modeVariable: "TALOS_BAND_MODE",
    requiredVariables: ["BAND_API_URL", "BAND_API_KEY"],
    requiredForCore: false,
    defaultMode: "disabled",
  },
} as const satisfies Record<ProviderName, ProviderEnvironmentSpec>;

export interface ProviderCapability {
  readonly provider: ProviderName;
  readonly requiredForCore: boolean;
  readonly requestedMode: RequestedProviderMode;
  readonly effectiveMode: EffectiveProviderMode;
  readonly liveReady: boolean;
  readonly fixtureAvailable: true;
  readonly configuredVariables: readonly string[];
  readonly missingVariables: readonly string[];
  readonly status:
    | "live"
    | "fixture"
    | "disabled"
    | "live_credentials_missing";
}

export interface ProviderCapabilityReport {
  readonly disclosure: "variable names only; secret values redacted";
  readonly core:
    | "live"
    | "mixed_live_and_fixture"
    | "fixture_only"
    | "blocked";
  readonly providers: Readonly<Record<ProviderName, ProviderCapability>>;
}

type LiveCredentials = Readonly<Record<string, string>>;

function parseRequestedMode(
  source: EnvironmentSource,
  spec: ProviderEnvironmentSpec,
): RequestedProviderMode {
  const rawMode = source[spec.modeVariable]?.trim().toLowerCase();
  if (!rawMode) return spec.defaultMode;
  if (
    rawMode === "live" ||
    rawMode === "fixture" ||
    rawMode === "disabled"
  ) {
    return rawMode;
  }

  throw new Error(
    "Invalid " +
      spec.modeVariable +
      "; expected live, fixture, or disabled.",
  );
}

function nonEmptyValue(
  source: EnvironmentSource,
  variableName: string,
): string | undefined {
  const value = source[variableName]?.trim();
  return value ? value : undefined;
}

function summarizeCore(
  providers: Readonly<Record<ProviderName, ProviderCapability>>,
): ProviderCapabilityReport["core"] {
  const core = PROVIDER_NAMES.map((provider) => providers[provider]).filter(
    (capability) => capability.requiredForCore,
  );

  if (
    core.some(
      (capability) =>
        capability.effectiveMode === "unavailable" ||
        capability.effectiveMode === "disabled",
    )
  ) {
    return "blocked";
  }

  const liveCount = core.filter(
    (capability) => capability.effectiveMode === "live",
  ).length;
  if (liveCount === core.length) return "live";
  if (liveCount > 0) return "mixed_live_and_fixture";
  return "fixture_only";
}

/**
 * Secret-bearing values live only in a private map. Serializing this object
 * returns the capability report, whose only environment details are variable
 * names. Live credentials are available solely inside an explicitly gated
 * callback.
 */
export class ProviderEnvironment {
  readonly report: ProviderCapabilityReport;
  readonly #secretValues: ReadonlyMap<string, string>;

  constructor(
    report: ProviderCapabilityReport,
    secretValues: ReadonlyMap<string, string>,
  ) {
    this.report = report;
    this.#secretValues = secretValues;
  }

  assertLive(provider: ProviderName): void {
    const capability = this.report.providers[provider];
    if (capability.effectiveMode !== "live") {
      throw new Error(
        "Live " +
          provider +
          " calls are disabled; capability status is " +
          capability.status +
          ".",
      );
    }
  }

  withLiveCredentials<T>(
    provider: ProviderName,
    consumeCredentials: (credentials: LiveCredentials) => T,
  ): T {
    this.assertLive(provider);
    const spec = PROVIDER_ENVIRONMENT_SPECS[provider];
    const credentials: Record<string, string> = {};

    for (const variableName of spec.requiredVariables) {
      const value = this.#secretValues.get(variableName);
      if (!value) {
        throw new Error(
          "Live " + provider + " credentials became unavailable.",
        );
      }
      credentials[variableName] = value;
    }

    return consumeCredentials(Object.freeze(credentials));
  }

  toJSON(): ProviderCapabilityReport {
    return this.report;
  }

  toString(): string {
    return "[ProviderEnvironment: secrets redacted]";
  }
}

export function parseProviderEnvironment(
  source: EnvironmentSource,
): ProviderEnvironment {
  const providers = {} as Record<ProviderName, ProviderCapability>;
  const secretValues = new Map<string, string>();

  for (const provider of PROVIDER_NAMES) {
    const spec = PROVIDER_ENVIRONMENT_SPECS[provider];
    const requestedMode = parseRequestedMode(source, spec);
    const configuredVariables: string[] = [];
    const missingVariables: string[] = [];

    for (const variableName of spec.requiredVariables) {
      const value = nonEmptyValue(source, variableName);
      if (value) {
        configuredVariables.push(variableName);
        secretValues.set(variableName, value);
      } else {
        missingVariables.push(variableName);
      }
    }

    const liveReady = missingVariables.length === 0;
    const effectiveMode: EffectiveProviderMode =
      requestedMode === "live" && !liveReady
        ? "unavailable"
        : requestedMode;
    const status: ProviderCapability["status"] =
      effectiveMode === "unavailable"
        ? "live_credentials_missing"
        : effectiveMode;

    providers[provider] = Object.freeze({
      provider,
      requiredForCore: spec.requiredForCore,
      requestedMode,
      effectiveMode,
      liveReady,
      fixtureAvailable: true,
      configuredVariables: Object.freeze(configuredVariables),
      missingVariables: Object.freeze(missingVariables),
      status,
    });
  }

  const frozenProviders = Object.freeze(providers);
  const report: ProviderCapabilityReport = Object.freeze({
    disclosure: "variable names only; secret values redacted",
    core: summarizeCore(frozenProviders),
    providers: frozenProviders,
  });

  return new ProviderEnvironment(report, secretValues);
}
