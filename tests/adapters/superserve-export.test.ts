import { describe, expect, it } from "vitest";

import {
  createSuperserveClientFromEnv,
  SuperserveHttpClient,
} from "../../lib/adapters";
import type {
  SuperserveHttpCommandOutput,
  SuperserveSanitizedReceipt,
} from "../../lib/adapters";

describe("public Superserve adapter exports", () => {
  it("exposes the bounded provider client without implying a configured live run", () => {
    const noReceipt: SuperserveSanitizedReceipt | null = null;
    const noOutput: SuperserveHttpCommandOutput | null = null;

    expect(SuperserveHttpClient).toBeTypeOf("function");
    expect(createSuperserveClientFromEnv({})).toBeNull();
    expect(noReceipt).toBeNull();
    expect(noOutput).toBeNull();
  });
});
