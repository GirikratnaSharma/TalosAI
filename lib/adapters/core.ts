export const PROVIDER_NAMES = [
  "replay",
  "superserve",
  "pioneer",
  "terac",
  "stripe",
  "render",
  "band",
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];
export type ProviderExecutionMode = "live" | "fixture";

export const FIXTURE_WARNING =
  "FIXTURE DATA — not evidence of a live provider call." as const;

export interface LiveExecution<TData, TReceipt extends { mode: "live" }> {
  readonly mode: "live";
  readonly isFixture: false;
  readonly data: TData;
  readonly receipt: TReceipt;
}

export interface FixtureExecution<TData, TReceipt extends { mode: "fixture" }> {
  readonly mode: "fixture";
  readonly isFixture: true;
  readonly fixtureWarning: typeof FIXTURE_WARNING;
  readonly data: TData;
  readonly receipt: TReceipt;
}

export type ProviderExecution<
  TData,
  TReceipt extends { mode: ProviderExecutionMode },
> =
  | LiveExecution<TData, Extract<TReceipt, { mode: "live" }>>
  | FixtureExecution<TData, Extract<TReceipt, { mode: "fixture" }>>;

export type ProviderOperationExecution<
  TData,
  TReceipt extends {
    mode: ProviderExecutionMode;
    operation: string;
  },
  TOperation extends TReceipt["operation"],
> = ProviderExecution<TData, TReceipt & { operation: TOperation }>;

export function liveExecution<
  TData,
  TReceipt extends { mode: "live" },
>(data: TData, receipt: TReceipt): LiveExecution<TData, TReceipt> {
  return {
    mode: "live",
    isFixture: false,
    data,
    receipt,
  };
}

export function fixtureExecution<
  TData,
  TReceipt extends { mode: "fixture" },
>(data: TData, receipt: TReceipt): FixtureExecution<TData, TReceipt> {
  return {
    mode: "fixture",
    isFixture: true,
    fixtureWarning: FIXTURE_WARNING,
    data,
    receipt,
  };
}
