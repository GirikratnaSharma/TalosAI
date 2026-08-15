export type TeracErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_INPUT"
  | "FEASIBILITY_PENDING"
  | "FEASIBILITY_UNAVAILABLE"
  | "DISJOINT_FILTER_UNAVAILABLE"
  | "STUDY_NOT_COMPLETE"
  | "INSUFFICIENT_COHORT"
  | "COHORT_OVERLAP"
  | "STUDY_ID_REUSED"
  | "INCONSISTENT_SUBMISSIONS";

export class TeracProviderError extends Error {
  constructor(readonly code: TeracErrorCode) {
    super(`Terac operation failed (${code})`);
    this.name = "TeracProviderError";
  }
}
