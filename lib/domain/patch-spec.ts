import { createHash } from "node:crypto";

import type { PatchSpec } from "./types";

export type UnhashedPatchSpec = Omit<PatchSpec, "specSha256">;

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical patch specs require finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new TypeError("Patch spec contains a non-canonical value");
}

export function canonicalPatchSpecJson(
  spec: PatchSpec | UnhashedPatchSpec,
): string {
  const { specSha256: _excludedDigest, ...payload } = spec as PatchSpec;
  void _excludedDigest;
  const canonicalPayload: UnhashedPatchSpec = {
    ...payload,
    evidence: {
      ...payload.evidence,
      replayBugIds: [...payload.evidence.replayBugIds].sort(),
    },
    changes: [...payload.changes]
      .map((change) => ({ ...change }))
      .sort(
        (left, right) =>
          compareCanonicalStrings(left.filePath, right.filePath) ||
          compareCanonicalStrings(left.intent, right.intent),
      ),
  };
  return canonicalJson(canonicalPayload);
}

export function computePatchSpecSha256(
  spec: PatchSpec | UnhashedPatchSpec,
): string {
  return createHash("sha256")
    .update(canonicalPatchSpecJson(spec), "utf8")
    .digest("hex");
}

export function normalizeRepositoryFilePath(filePath: string): string {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("Repository file path cannot be empty");
  }
  if (filePath !== filePath.trim() || /[\0-\x1f\x7f]/.test(filePath)) {
    throw new TypeError("Repository file path contains unsafe characters");
  }

  const normalized = filePath.replaceAll("\\", "/").normalize("NFC");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.endsWith("/")
  ) {
    throw new TypeError("Repository file path must be relative");
  }

  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new TypeError("Repository file path contains an ambiguous segment");
  }
  return segments.join("/");
}
