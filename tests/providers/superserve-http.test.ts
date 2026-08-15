import { describe, expect, it, vi } from "vitest";

import {
  createSuperserveClientFromEnv,
  sanitizeSuperserveReceipt,
  SuperserveHttpClient,
  SuperserveProviderError,
} from "../../lib/providers/superserve";

const apiKey = "ss_live_unit_test_key";
const sandboxId = "1b4e28ba-2fa1-4f31-b96c-0f84ed1d8123";
const accessToken = "sandbox-access-token-secret";
const fixedNow = new Date("2026-08-15T20:00:00.000Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch, monotonicNow?: () => number) {
  let requestSequence = 0;
  return new SuperserveHttpClient({
    apiKey,
    fetchImpl,
    now: () => fixedNow,
    monotonicNow,
    requestId: () => `superserve-request-${++requestSequence}`,
    sleep: async () => undefined,
    random: () => 0,
  });
}

describe("Superserve HTTP provider", () => {
  it("creates a locked-down disposable sandbox without putting secrets in the VM", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          id: sandboxId,
          name: "talos-order-42",
          status: "active",
          access_token: accessToken,
          provider_internal: "not-receipt-data",
        },
        201,
      ),
    );
    const client = clientWith(fetchImpl);

    const execution = await client.createSandbox({
      name: "talos-order-42",
      metadata: { order: "TAL-42" },
      allowedHosts: ["github.com"],
    });

    expect(execution.data).toEqual({
      id: sandboxId,
      name: "talos-order-42",
      status: "active",
    });
    expect(execution.receipt).toMatchObject({
      provider: "superserve",
      operation: "create_sandbox",
      outcome: "created",
      networkPolicy: "deny_by_default",
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url.toString()).toBe("https://api.superserve.ai/sandboxes");
    expect(init.headers).toMatchObject({ "X-API-Key": apiKey });
    expect(body).toMatchObject({
      timeout_seconds: 600,
      auto_delete_seconds: 3600,
      preview_access: "private",
      metadata: { order: "TAL-42", "talos.disposable": "true" },
      network: {
        allow_out: ["*.superserve.ai", "github.com"],
        deny_out: ["0.0.0.0/0"],
      },
    });
    expect(body).not.toHaveProperty("env_vars");
    expect(body).not.toHaveProperty("secrets");
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(JSON.stringify(execution.receipt)).not.toContain(apiKey);
    expect(JSON.stringify(execution.receipt)).not.toContain(accessToken);
  });

  it("activates idempotently, executes without a shell, and bounds returned output", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ id: sandboxId, status: "active", access_token: accessToken }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          stdout: "a".repeat(1_800),
          stderr: "b".repeat(800),
          exit_code: 0,
          truncated: false,
        }),
      );
    const ticks = [100, 128];
    const client = clientWith(fetchImpl, () => ticks.shift() ?? 128);

    const execution = await client.runCommand({
      sandboxId,
      executable: "npm",
      args: ["test", "--", "--runInBand"],
      workingDirectory: "/workspace",
      timeoutMs: 5_000,
      maxOutputBytes: 1_024,
    });

    expect(execution.data.exitCode).toBe(0);
    expect(execution.data.outputTruncated).toBe(true);
    expect(
      Buffer.byteLength(execution.data.stdout) +
        Buffer.byteLength(execution.data.stderr),
    ).toBeLessThanOrEqual(1_024);
    expect(execution.receipt).toMatchObject({
      operation: "run_command",
      outcome: "succeeded",
      durationMs: 28,
      timeoutMs: 5_000,
      outputTruncated: true,
    });

    const [activateUrl, activateInit] = fetchImpl.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(activateUrl.pathname).toBe(`/sandboxes/${sandboxId}/activate`);
    expect(activateInit.headers).toMatchObject({ "X-API-Key": apiKey });

    const [execUrl, execInit] = fetchImpl.mock.calls[1] as unknown as [
      URL,
      RequestInit,
    ];
    expect(execUrl.toString()).toBe("https://sandbox.superserve.ai/exec");
    expect(execInit.headers).toMatchObject({
      "X-Access-Token": accessToken,
      "X-Superserve-Sandbox-Id": sandboxId,
    });
    expect(JSON.parse(String(execInit.body))).toEqual({
      command: "npm",
      args: ["test", "--", "--runInBand"],
      working_dir: "/workspace",
      timeout_s: 5,
    });
    expect(JSON.stringify(execution.receipt)).not.toContain("npm");
    expect(JSON.stringify(execution.receipt)).not.toContain(accessToken);
    expect(JSON.stringify(execution.receipt)).not.toContain("aaaa");
  });

  it("pauses safely, resumes through documented idempotent activation, and destroys idempotently", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ id: sandboxId, name: "box", status: "active" }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        jsonResponse({ id: sandboxId, status: "active", access_token: accessToken }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: { code: "not_found" } }, 404));
    const client = clientWith(fetchImpl);

    const paused = await client.pauseSandbox(sandboxId);
    const resumed = await client.resumeSandbox(sandboxId);
    const destroyed = await client.destroySandbox(sandboxId);

    expect(paused.receipt.outcome).toBe("paused");
    expect(resumed.receipt.outcome).toBe("active");
    expect(destroyed).toMatchObject({
      data: { destroyed: true },
      receipt: { outcome: "already_deleted" },
    });
    expect((fetchImpl.mock.calls[3]?.[1] as RequestInit).method).toBe("DELETE");
  });

  it("fails closed on malformed responses and never retries command execution", async () => {
    const malformedCreate = vi.fn(async () =>
      jsonResponse({ id: sandboxId, name: "box", status: "active" }, 201),
    );
    await expect(
      clientWith(malformedCreate).createSandbox({ name: "box" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const commandFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ id: sandboxId, status: "active", access_token: accessToken }),
      )
      .mockRejectedValueOnce(new Error("connection lost"));
    await expect(
      clientWith(commandFetch).runCommand({
        sandboxId,
        executable: "npm",
        args: ["test"],
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(commandFetch).toHaveBeenCalledTimes(2);
  });

  it("requires a real live-key configuration and strips unknown receipt fields", () => {
    expect(createSuperserveClientFromEnv({})).toBeNull();
    expect(
      () => new SuperserveHttpClient({ apiKey: "placeholder" }),
    ).toThrow(SuperserveProviderError);

    const receipt = sanitizeSuperserveReceipt({
      schemaVersion: 1,
      provider: "superserve",
      operation: "destroy_sandbox",
      requestId: "request-1",
      recordedAt: fixedNow.toISOString(),
      sandboxId,
      outcome: "deleted",
      apiKey,
      accessToken,
      rawPayload: { secret: apiKey },
    });
    expect(receipt).toEqual({
      schemaVersion: 1,
      provider: "superserve",
      operation: "destroy_sandbox",
      requestId: "request-1",
      recordedAt: fixedNow.toISOString(),
      sandboxId,
      outcome: "deleted",
    });
  });
});
