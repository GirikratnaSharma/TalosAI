import type {
  ProviderFetch,
  SanitizedHttpReceipt,
} from "../http";
import {
  requestPioneerInference,
} from "./http";
import {
  compilePatchSpecInputSchema,
  pioneerPatchClassificationSchema,
  pioneerInferenceResponseSchema,
  pioneerModelIdSchema,
  SUPPORTED_PATCH_BUG_CLASSES,
  type CompilePatchSpecInput,
  type PioneerPatchClassification,
  type PioneerInferenceResponse,
  type SupportedPatchBugClass,
} from "./schemas";

const DEFAULT_BASE_URL = "https://api.pioneer.ai";
const DEFAULT_MODEL_ID = "fastino/gliner2-large-v1";
const DEFAULT_MINIMUM_CONFIDENCE = 0.85;
const MAX_COMPILER_INPUT_CHARACTERS = 50_000;
const OFFICIAL_API_HOST = "api.pioneer.ai";

const SELECTOR_REQUIRED_BUG_CLASSES = new Set<SupportedPatchBugClass>([
  "checkout_button_no_action",
  "form_submission_blocked",
  "checkout_request_not_created",
]);

export type PioneerPatchSpecErrorCode =
  | "AMBIGUOUS_RESULT"
  | "EVIDENCE_MISMATCH"
  | "INVALID_MODEL"
  | "INVALID_SPAN"
  | "LOW_CONFIDENCE"
  | "UNSAFE_TO_AUTOFIX";

export class PioneerPatchSpecError extends Error {
  readonly code: PioneerPatchSpecErrorCode;
  readonly receipt?: PioneerInferenceReceipt;

  constructor(
    code: PioneerPatchSpecErrorCode,
    receipt?: PioneerInferenceReceipt,
  ) {
    super(`Pioneer patch spec rejected (${code})`);
    this.name = "PioneerPatchSpecError";
    this.code = code;
    this.receipt = receipt;
  }
}

export interface PioneerInferenceReceipt extends SanitizedHttpReceipt {
  readonly provider: "pioneer";
  readonly operation: "compile_patch_spec";
  readonly inferenceId: string;
  readonly modelId: string;
}

export interface PioneerCompileResult {
  readonly classification: PioneerPatchClassification;
  readonly receipt: PioneerInferenceReceipt;
}

export interface PioneerPatchSpecClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly modelId?: string;
  readonly projectId?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: ProviderFetch;
}

interface ScoredSpan {
  readonly text: string;
  readonly confidence: number;
  readonly start: number;
  readonly end: number;
}

function officialBaseUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.hostname !== OFFICIAL_API_HOST ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new TypeError("Pioneer baseUrl must be the official HTTPS API origin");
  }
  url.pathname = "/";
  return url;
}

function safeProjectId(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) {
    throw new TypeError("Pioneer projectId must be a safe identifier");
  }
  return value;
}

function compilerText(input: CompilePatchSpecInput): string {
  const text = JSON.stringify({
    critical_journey: {
      name: input.criticalJourney.name,
      route: input.criticalJourney.route,
      ...(input.criticalJourney.selector
        ? { selector: input.criticalJourney.selector }
        : {}),
      expected_behavior: input.criticalJourney.expectedBehavior,
    },
    replay_evidence: input.evidence.map((evidence) => ({
      evidence_id: evidence.evidenceId,
      title: evidence.title,
      ...(evidence.route ? { route: evidence.route } : {}),
      ...(evidence.selector ? { selector: evidence.selector } : {}),
      expected_behavior: evidence.expectedBehavior,
      actual_behavior: evidence.actualBehavior,
      reproduction_steps: evidence.reproductionSteps,
    })),
  });

  if (text.length > MAX_COMPILER_INPUT_CHARACTERS) {
    throw new TypeError("Pioneer compiler input exceeds the safe size limit");
  }
  return text;
}

function inferenceBody(
  modelId: string,
  text: string,
  threshold: number,
  projectId: string | undefined,
): unknown {
  return {
    model_id: modelId,
    text,
    schema: {
      classifications: [
        {
          task: "bug_class",
          labels: [...SUPPORTED_PATCH_BUG_CLASSES],
          multi_label: false,
          top_k: 1,
        },
        {
          task: "autofixability",
          labels: ["safe_to_autofix", "block_autofix"],
          multi_label: false,
          top_k: 1,
        },
      ],
      structures: {
        patch_spec: {
          fields: [
            {
              name: "route",
              dtype: "str",
              description: "Relative application route for the broken critical journey",
            },
            {
              name: "selector",
              dtype: "str",
              description: "Exact UI selector associated with the failure, when present",
            },
            {
              name: "expected_behavior",
              dtype: "str",
              description: "Verbatim expected behavior from the critical journey or Replay evidence",
            },
            {
              name: "actual_behavior",
              dtype: "str",
              description: "Verbatim actual behavior from Replay evidence",
            },
            {
              name: "evidence_ids",
              dtype: "list",
              description: "Replay evidence IDs that directly support this one failure",
            },
          ],
        },
      },
    },
    threshold,
    include_confidence: true,
    include_spans: true,
    format_results: true,
    store: true,
    ...(projectId ? { project_id: projectId } : {}),
  };
}

function inferenceReceipt(
  response: PioneerInferenceResponse,
  receipt: SanitizedHttpReceipt,
): PioneerInferenceReceipt {
  return Object.freeze({
    ...receipt,
    provider: "pioneer",
    operation: "compile_patch_spec",
    inferenceId: response.inference_id,
    modelId: response.model_used,
  });
}

function assertValidSpan(span: ScoredSpan, source: string): void {
  const codePointSlice = Array.from(source)
    .slice(span.start, span.end)
    .join("");
  if (
    source.slice(span.start, span.end) !== span.text &&
    codePointSlice !== span.text
  ) {
    throw new PioneerPatchSpecError("INVALID_SPAN");
  }
}

function oneOf(value: string, allowed: ReadonlySet<string>): boolean {
  return allowed.has(value);
}

function compileValidatedClassification(input: {
  request: CompilePatchSpecInput;
  source: string;
  response: PioneerInferenceResponse;
  receipt: PioneerInferenceReceipt;
  minimumConfidence: number;
}): PioneerPatchClassification {
  const { request, source, response, receipt, minimumConfidence } = input;
  const result = response.result;
  const extracted = result.patch_spec[0];
  const spans = [
    extracted.route,
    extracted.expected_behavior,
    extracted.actual_behavior,
    ...extracted.evidence_ids,
    ...(extracted.selector ? [extracted.selector] : []),
  ];
  for (const span of spans) {
    try {
      assertValidSpan(span, source);
    } catch (error) {
      if (error instanceof PioneerPatchSpecError) {
        throw new PioneerPatchSpecError(error.code, receipt);
      }
      throw error;
    }
  }

  const bugClassResult = SUPPORTED_PATCH_BUG_CLASSES.includes(
    result.bug_class.label as SupportedPatchBugClass,
  )
    ? (result.bug_class.label as SupportedPatchBugClass)
    : undefined;
  if (!bugClassResult) {
    throw new PioneerPatchSpecError("AMBIGUOUS_RESULT", receipt);
  }
  if (result.autofixability.label !== "safe_to_autofix") {
    throw new PioneerPatchSpecError("UNSAFE_TO_AUTOFIX", receipt);
  }

  const routeCandidates = new Set([
    request.criticalJourney.route,
    ...request.evidence.flatMap((evidence) =>
      evidence.route ? [evidence.route] : [],
    ),
  ]);
  const selectorCandidates = new Set([
    ...(request.criticalJourney.selector
      ? [request.criticalJourney.selector]
      : []),
    ...request.evidence.flatMap((evidence) =>
      evidence.selector ? [evidence.selector] : [],
    ),
  ]);
  const expectedCandidates = new Set([
    request.criticalJourney.expectedBehavior,
    ...request.evidence.map((evidence) => evidence.expectedBehavior),
  ]);
  const actualCandidates = new Set(
    request.evidence.map((evidence) => evidence.actualBehavior),
  );
  const evidenceCandidates = new Set(
    request.evidence.map((evidence) => evidence.evidenceId),
  );

  if (
    !oneOf(extracted.route.text, routeCandidates) ||
    !oneOf(extracted.expected_behavior.text, expectedCandidates) ||
    !oneOf(extracted.actual_behavior.text, actualCandidates)
  ) {
    throw new PioneerPatchSpecError("EVIDENCE_MISMATCH", receipt);
  }

  const selector = extracted.selector?.text ?? null;
  if (
    (selector !== null && !oneOf(selector, selectorCandidates)) ||
    (SELECTOR_REQUIRED_BUG_CLASSES.has(bugClassResult) && selector === null)
  ) {
    throw new PioneerPatchSpecError("EVIDENCE_MISMATCH", receipt);
  }

  const evidenceIds = extracted.evidence_ids.map((item) => item.text);
  if (
    new Set(evidenceIds).size !== evidenceIds.length ||
    evidenceIds.some((id) => !evidenceCandidates.has(id))
  ) {
    throw new PioneerPatchSpecError("EVIDENCE_MISMATCH", receipt);
  }

  const selectedEvidence = request.evidence.filter((evidence) =>
    evidenceIds.includes(evidence.evidenceId),
  );
  const selectedRoutes = new Set([
    request.criticalJourney.route,
    ...selectedEvidence.flatMap((evidence) =>
      evidence.route ? [evidence.route] : [],
    ),
  ]);
  const selectedSelectors = new Set([
    ...(request.criticalJourney.selector
      ? [request.criticalJourney.selector]
      : []),
    ...selectedEvidence.flatMap((evidence) =>
      evidence.selector ? [evidence.selector] : [],
    ),
  ]);
  const selectedExpected = new Set([
    request.criticalJourney.expectedBehavior,
    ...selectedEvidence.map((evidence) => evidence.expectedBehavior),
  ]);
  const selectedActual = new Set(
    selectedEvidence.map((evidence) => evidence.actualBehavior),
  );
  if (
    !selectedRoutes.has(extracted.route.text) ||
    (selector !== null && !selectedSelectors.has(selector)) ||
    !selectedExpected.has(extracted.expected_behavior.text) ||
    !selectedActual.has(extracted.actual_behavior.text) ||
    extracted.expected_behavior.text === extracted.actual_behavior.text
  ) {
    throw new PioneerPatchSpecError("EVIDENCE_MISMATCH", receipt);
  }

  const confidence = Math.min(
    result.bug_class.confidence,
    result.autofixability.confidence,
    ...spans.map((span) => span.confidence),
  );
  if (confidence < minimumConfidence) {
    throw new PioneerPatchSpecError("LOW_CONFIDENCE", receipt);
  }

  return pioneerPatchClassificationSchema.parse({
    schemaVersion: 1,
    bugClass: bugClassResult,
    route: extracted.route.text,
    selector,
    expectedBehavior: extracted.expected_behavior.text,
    actualBehavior: extracted.actual_behavior.text,
    evidenceIds,
    confidence,
    safeToAutofix: true,
    inferenceId: response.inference_id,
    modelId: response.model_used,
  });
}

export class PioneerPatchSpecClient {
  readonly #apiKey: string;
  readonly #baseUrl: URL;
  readonly #modelId: string;
  readonly #projectId?: string;
  readonly #timeoutMs?: number;
  readonly #maxResponseBytes?: number;
  readonly #fetchImpl?: ProviderFetch;

  constructor(options: PioneerPatchSpecClientOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new TypeError("Pioneer apiKey cannot be empty");
    this.#apiKey = apiKey;
    this.#baseUrl = officialBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#modelId = pioneerModelIdSchema.parse(
      options.modelId ?? DEFAULT_MODEL_ID,
    );
    this.#projectId = safeProjectId(options.projectId);
    this.#timeoutMs = options.timeoutMs;
    this.#maxResponseBytes = options.maxResponseBytes;
    this.#fetchImpl = options.fetchImpl;
  }

  async compilePatchSpec(
    rawInput: CompilePatchSpecInput,
  ): Promise<PioneerCompileResult> {
    const request = compilePatchSpecInputSchema.parse(rawInput);
    const minimumConfidence =
      request.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;
    const source = compilerText(request);
    const response = await requestPioneerInference({
      url: new URL("/inference", this.#baseUrl),
      apiKey: this.#apiKey,
      body: inferenceBody(
        this.#modelId,
        source,
        minimumConfidence,
        this.#projectId,
      ),
      schema: pioneerInferenceResponseSchema,
      timeoutMs: this.#timeoutMs,
      maxResponseBytes: this.#maxResponseBytes,
      fetchImpl: this.#fetchImpl,
    });
    const receipt = inferenceReceipt(response.data, response.receipt);

    if (
      response.data.model_id !== this.#modelId ||
      response.data.model_used !== this.#modelId
    ) {
      throw new PioneerPatchSpecError("INVALID_MODEL", receipt);
    }

    const classification = compileValidatedClassification({
      request,
      source,
      response: response.data,
      receipt,
      minimumConfidence,
    });
    return Object.freeze({ classification, receipt });
  }
}

export function createPioneerPatchSpecClient(
  options: PioneerPatchSpecClientOptions,
): PioneerPatchSpecClient {
  return new PioneerPatchSpecClient(options);
}
