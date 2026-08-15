"use client";

import { FormEvent, useState } from "react";

import type { FixturePaymentIntentResult } from "@/lib/fixtures/payment-intent";

import styles from "./fixture-checkout.module.css";

interface FixtureCheckoutProps {
  variant: "baseline" | "candidate";
  buildSha: string;
}

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "complete"; result: FixturePaymentIntentResult };

function createFixtureIntentId(): string {
  return `pi_fixture_${crypto.randomUUID()}`;
}

export function FixtureCheckout({
  variant,
  buildSha,
}: FixtureCheckoutProps) {
  const [email, setEmail] = useState("judge@example.com");
  const [pendingIntentId, setPendingIntentId] = useState("");
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmission({ status: "submitting" });

    const createdIntentId = createFixtureIntentId();
    setPendingIntentId(createdIntentId);

    // This is the seeded defect Replay is expected to catch. The baseline
    // reads stale React state; the repaired candidate uses the value created
    // in this exact submission. This endpoint never touches real payments.
    const submittedIntentId =
      variant === "baseline" ? pendingIntentId : createdIntentId;

    const response = await fetch("/api/fixtures/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, intentId: submittedIntentId }),
    });
    const result = (await response.json()) as FixturePaymentIntentResult;
    setSubmission({ status: "complete", result });
  }

  const result = submission.status === "complete" ? submission.result : null;

  return (
    <main className={styles.shell}>
      <section
        className={styles.card}
        data-fixture-variant={variant}
        data-build-sha={buildSha}
      >
        <div className={styles.product}>
          <div>
            <p className={styles.eyebrow}>Talos controlled target 01</p>
            <h1 className={styles.title}>Launch Atlas</h1>
            <p className={styles.description}>
              A deterministic checkout-flow fixture built for Replay to
              reproduce, root-cause, and independently retest.
            </p>
          </div>
          <span className={styles.mode}>
            {variant === "baseline" ? "Seeded defect" : "Candidate repair"} ·
            no real charge
          </span>
        </div>

        <div className={styles.checkout}>
          <p className={styles.label}>Critical journey</p>
          <h2>Reserve launch access</h2>
          <p className={styles.price}>$149 · fixture transaction</p>

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.label} htmlFor="fixture-email">
              Receipt email
            </label>
            <input
              className={styles.input}
              id="fixture-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
            <button
              className={styles.button}
              type="submit"
              disabled={submission.status === "submitting"}
              data-replay-target="submit-checkout"
            >
              {submission.status === "submitting"
                ? "Creating intent…"
                : "Create payment intent"}
            </button>
          </form>

          {result ? (
            <div
              className={styles.result}
              data-status={result.ok ? "success" : "failure"}
              role="status"
              aria-live="polite"
            >
              <strong>{result.ok ? "Intent created" : "Checkout blocked"}</strong>
              <p>
                {result.ok
                  ? `Fixture receipt ${result.intentId}`
                  : `${result.code}: the request did not create a payment intent.`}
              </p>
              <button
                className={styles.reset}
                type="button"
                onClick={() => {
                  setPendingIntentId("");
                  setSubmission({ status: "idle" });
                }}
              >
                Reset fixture
              </button>
            </div>
          ) : null}

          <p className={styles.build}>
            mode=FIXTURE · variant={variant} · build={buildSha}
          </p>
        </div>
      </section>
    </main>
  );
}
