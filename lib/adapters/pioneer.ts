import {
  assertValidPatchSpec,
  computePatchSpecSha256,
  normalizeRepositoryFilePath,
  type Command,
  type DomainEvent,
  type PatchSpec,
  type PatchSpecChange,
  type SupportedPatchBugClass,
  type UnhashedPatchSpec,
} from "../domain";
import type {
  CompilePatchSpecInput,
  PioneerCompileResult,
  PioneerPatchSpecClient,
  SupportedPatchBugClass as PioneerBugClass,
} from "../providers/pioneer";
import type { AdapterIdentity } from "./contracts";
import {
  liveExecution,
  type ProviderOperationExecution,
} from "./core";
import {
  pioneerReceiptSchema,
  type PioneerReceipt,
} from "./receipts";

export * from "../providers/pioneer";

export const PIONEER_TO_DOMAIN_BUG_CLASS = {
  checkout_button_no_action: "CHECKOUT_INTERACTION",
  form_submission_blocked: "FORM_SUBMISSION",
  checkout_request_not_created: "INTEGRATION_WIRING",
  payment_webhook_broken: "INTEGRATION_WIRING",
  route_transition_broken: "CLIENT_ROUTING",
} as const satisfies Record<PioneerBugClass, SupportedPatchBugClass>;

type CompilePatchSpecCommand = Extract<
  Command,
  { type: "COMPILE_PATCH_SPEC" }
>;
export type PatchSpecCompiledEvent = Extract<
  DomainEvent,
  { type: "PATCH_SPEC_COMPILED" }
>;

export interface RepositoryFileResolutionInput {
  readonly orderId: string;
  readonly attempt: 1 | 2;
  readonly repositoryUrl: string;
  readonly resolvedAtSha: string;
  readonly bugClass: SupportedPatchBugClass;
  readonly route: string;
  readonly selector: string | null;
  readonly evidenceIds: readonly string[];
}

/**
 * Talos owns this resolver and its repository index. Pioneer only selects an
 * evidence-backed bug class/route; it never supplies or expands file scope.
 */
export interface RepositoryAllowedFileResolver {
  readonly id: string;
  readonly repositoryUrl: string;
  readonly resolvedAtSha: string;
  resolveAllowedFiles(
    input: Readonly<RepositoryFileResolutionInput>,
  ): readonly PatchSpecChange[];
}

export interface RepositoryPatchTarget {
  readonly route: string;
  readonly selector: string | null;
  readonly bugClasses: readonly SupportedPatchBugClass[];
  readonly changes: readonly PatchSpecChange[];
}

export interface RepositoryPatchManifest {
  readonly resolverId: string;
  readonly repositoryUrl: string;
  readonly resolvedAtSha: string;
  readonly targets: readonly RepositoryPatchTarget[];
}

export type PioneerBridgeErrorCode =
  | "INVALID_BRIDGE_INPUT"
  | "PROVIDER_IDENTITY_MISMATCH"
  | "REPLAY_EVIDENCE_MISMATCH"
  | "REPOSITORY_SCOPE_MISMATCH"
  | "REPOSITORY_TARGET_AMBIGUOUS"
  | "REPOSITORY_TARGET_NOT_FOUND"
  | "UNSAFE_RESOLVED_CHANGESET";

export class PioneerBridgeError extends Error {
  readonly code: PioneerBridgeErrorCode;

  constructor(code: PioneerBridgeErrorCode) {
    super(`Pioneer bridge rejected (${code})`);
    this.name = "PioneerBridgeError";
    this.code = code;
  }
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function canonicalChanges(
  changes: readonly PatchSpecChange[],
): PatchSpecChange[] {
  if (changes.length < 1 || changes.length > 12) {
    throw new PioneerBridgeError("UNSAFE_RESOLVED_CHANGESET");
  }
  let canonical: PatchSpecChange[];
  try {
    canonical = changes.map((change) => ({
      filePath: normalizeRepositoryFilePath(change.filePath),
      intent: change.intent.trim(),
    }));
  } catch {
    throw new PioneerBridgeError("UNSAFE_RESOLVED_CHANGESET");
  }
  if (
    canonical.some(
      (change) => change.intent.length < 1 || change.intent.length > 2_000,
    ) ||
    new Set(canonical.map((change) => change.filePath)).size !==
      canonical.length
  ) {
    throw new PioneerBridgeError("UNSAFE_RESOLVED_CHANGESET");
  }
  return canonical.sort(
    (left, right) =>
      (left.filePath < right.filePath
        ? -1
        : left.filePath > right.filePath
          ? 1
          : 0) ||
      (left.intent < right.intent
        ? -1
        : left.intent > right.intent
          ? 1
          : 0),
  );
}

export function createManifestAllowedFileResolver(
  manifest: RepositoryPatchManifest,
): RepositoryAllowedFileResolver {
  const targets = manifest.targets.map((target) => ({
    route: target.route,
    selector: target.selector,
    bugClasses: Object.freeze([...target.bugClasses]),
    changes: Object.freeze(target.changes.map((change) => ({ ...change }))),
  }));
  return Object.freeze({
    id: manifest.resolverId,
    repositoryUrl: manifest.repositoryUrl,
    resolvedAtSha: manifest.resolvedAtSha,
    resolveAllowedFiles(input: Readonly<RepositoryFileResolutionInput>) {
      const matches = targets.filter(
        (target) =>
          target.route === input.route &&
          target.selector === input.selector &&
          target.bugClasses.includes(input.bugClass),
      );
      if (matches.length === 0) {
        throw new PioneerBridgeError("REPOSITORY_TARGET_NOT_FOUND");
      }
      if (matches.length !== 1) {
        throw new PioneerBridgeError("REPOSITORY_TARGET_AMBIGUOUS");
      }
      return matches[0]?.changes ?? [];
    },
  });
}

export interface BridgePioneerPatchSpecInput {
  readonly command: CompilePatchSpecCommand;
  readonly providerResult: PioneerCompileResult;
  readonly repositoryUrl: string;
  readonly resolver: RepositoryAllowedFileResolver;
  readonly eventId: string;
  readonly compiledAt: string;
}

export function bridgePioneerPatchSpec(
  input: BridgePioneerPatchSpecInput,
): PatchSpecCompiledEvent {
  const { command, providerResult, resolver } = input;
  const classification = providerResult.classification;
  if (
    classification.inferenceId !== providerResult.receipt.inferenceId ||
    classification.modelId !== providerResult.receipt.modelId
  ) {
    throw new PioneerBridgeError("PROVIDER_IDENTITY_MISMATCH");
  }
  if (
    !sameStringSet(
      classification.evidenceIds,
      command.evidence.replayBugIds,
    )
  ) {
    throw new PioneerBridgeError("REPLAY_EVIDENCE_MISMATCH");
  }
  if (
    resolver.repositoryUrl !== input.repositoryUrl ||
    resolver.resolvedAtSha !== command.evidence.replayObservedBuildSha
  ) {
    throw new PioneerBridgeError("REPOSITORY_SCOPE_MISMATCH");
  }
  if (
    !input.eventId.trim() ||
    input.eventId.length > 256 ||
    !Number.isFinite(Date.parse(input.compiledAt))
  ) {
    throw new PioneerBridgeError("INVALID_BRIDGE_INPUT");
  }

  const bugClass = PIONEER_TO_DOMAIN_BUG_CLASS[classification.bugClass];
  const resolutionInput = Object.freeze({
    orderId: command.orderId,
    attempt: command.attempt,
    repositoryUrl: input.repositoryUrl,
    resolvedAtSha: command.evidence.replayObservedBuildSha,
    bugClass,
    route: classification.route,
    selector: classification.selector,
    evidenceIds: Object.freeze([...classification.evidenceIds].sort()),
  });
  const changes = canonicalChanges(
    resolver.resolveAllowedFiles(resolutionInput),
  );
  const unhashed: UnhashedPatchSpec = {
    specId: `pioneer:${classification.inferenceId}`,
    compilerProvider: "PIONEER",
    modelKind: "OPEN_WEIGHT",
    modelId: classification.modelId,
    attempt: command.attempt,
    trigger: command.trigger,
    bugClass,
    confidence: classification.confidence,
    evidence: {
      ...command.evidence,
      replayBugIds: [...command.evidence.replayBugIds].sort(),
    },
    scope: {
      resolverId: resolver.id,
      repositoryUrl: input.repositoryUrl,
      resolvedAtSha: resolver.resolvedAtSha,
    },
    changes,
    compiledAt: input.compiledAt,
  };
  const spec: PatchSpec = {
    ...unhashed,
    specSha256: computePatchSpecSha256(unhashed),
  };

  // Pioneer's safe-to-autofix classification is never a safety authority.
  // Repository scope and domain policy independently constrain the event.
  assertValidPatchSpec(spec, {
    attempt: command.attempt,
    trigger: command.trigger,
    evidence: command.evidence,
    repositoryUrl: input.repositoryUrl,
  });
  return Object.freeze({
    id: input.eventId,
    at: input.compiledAt,
    type: "PATCH_SPEC_COMPILED",
    spec,
  });
}

export interface PioneerAdapter extends AdapterIdentity<"pioneer"> {
  compilePatchSpec(
    input: PioneerAdapterCompileInput,
  ): Promise<
    ProviderOperationExecution<
      PatchSpecCompiledEvent,
      PioneerReceipt,
      "compile_patch_spec"
    >
  >;
}

export interface PioneerAdapterCompileInput {
  readonly providerInput: CompilePatchSpecInput;
  readonly command: CompilePatchSpecCommand;
  readonly repositoryUrl: string;
  readonly resolver: RepositoryAllowedFileResolver;
  readonly eventId: string;
  readonly compiledAt: string;
}

export function createLivePioneerAdapter(input: {
  readonly client: Pick<PioneerPatchSpecClient, "compilePatchSpec">;
}): PioneerAdapter {
  return Object.freeze({
    provider: "pioneer" as const,
    mode: "live" as const,
    async compilePatchSpec(request: PioneerAdapterCompileInput) {
      if (
        request.providerInput.orderId !== request.command.orderId ||
        !sameStringSet(
          request.providerInput.evidence.map((item) => item.evidenceId),
          request.command.evidence.replayBugIds,
        )
      ) {
        throw new PioneerBridgeError("REPLAY_EVIDENCE_MISMATCH");
      }
      const providerResult = await input.client.compilePatchSpec(
        request.providerInput,
      );
      const event = bridgePioneerPatchSpec({
        command: request.command,
        providerResult,
        repositoryUrl: request.repositoryUrl,
        resolver: request.resolver,
        eventId: request.eventId,
        compiledAt: request.compiledAt,
      });
      const receipt = pioneerReceiptSchema.parse({
        schemaVersion: 1,
        provider: "pioneer",
        operation: "compile_patch_spec",
        mode: "live",
        evidenceSource: "provider",
        receiptId: `pioneer:${providerResult.receipt.inferenceId}`,
        requestId: providerResult.receipt.inferenceId,
        recordedAt: providerResult.receipt.observedAt,
        artifacts: [
          {
            kind: "patch_spec",
            id: event.spec.specId,
            sha256: event.spec.specSha256,
          },
        ],
      });
      if (receipt.mode !== "live") {
        throw new PioneerBridgeError("INVALID_BRIDGE_INPUT");
      }
      return liveExecution(event, receipt);
    },
  });
}
