import Link from "next/link";

import styles from "./proof-screen.module.css";

export const dynamic = "force-dynamic";

/**
 * A single-screen, projector-legible summary of the proof chain.
 *
 * This page exists for one reason: to make the company's central claim
 * readable in five seconds. It states who holds which authority and what
 * each party has actually produced. It renders no live provider calls and
 * therefore cannot imply evidence that does not exist — every figure below
 * is a fact recorded during the build, and the full audited detail lives in
 * the company ledger at `/`.
 */

interface Gate {
  readonly index: string;
  readonly owner: string;
  readonly role: string;
  readonly fact: string;
  readonly state: string;
  readonly tone: "pass" | "wait" | "hold";
  readonly authority?: boolean;
}

const GATES: readonly Gate[] = [
  {
    index: "01",
    owner: "Replay",
    role: "Release authority",
    fact: "Found 9 bugs we did not plant. Root-caused the checkout defect through minified JS. Holds the veto.",
    state: "Independent",
    tone: "pass",
    authority: true,
  },
  {
    index: "02",
    owner: "Pioneer",
    role: "Spec compiler",
    fact: "GLiNER2 turns that report into a hashed repair contract. No valid spec, no sandbox.",
    state: "Live",
    tone: "pass",
  },
  {
    index: "03",
    owner: "Superserve",
    role: "Repair floor",
    fact: "Isolated VM, pinned SHA, zero payment credentials inside. Two attempts, then we walk.",
    state: "Live",
    tone: "pass",
  },
  {
    index: "04",
    owner: "Terac",
    role: "Human witness",
    fact: "Real people tried the broken flow. A fresh, screened cohort is trying the repair.",
    state: "Live",
    tone: "wait",
  },
  {
    index: "05",
    owner: "Stripe",
    role: "Treasurer",
    fact: "Link revealed only after both proofs. Unattributed payment refused. Same event twice, one record.",
    state: "Live",
    tone: "pass",
  },
];

export default function ProofScreen() {
  return (
    <main className={styles.shell}>
      <header className={styles.masthead}>
        <h1 className={styles.wordmark}>
          Talos<span>.</span>
        </h1>
        <p className={styles.kicker}>
          A zero-employee software repair company. It fixes one broken revenue
          flow — and it cannot approve its own work.
        </p>
      </header>

      <p className={styles.thesis}>
        No agent here marks <em>its own homework</em>.
      </p>

      <section className={styles.chain} aria-label="Proof chain">
        {GATES.map((gate) => (
          <article
            key={gate.index}
            className={styles.gate}
            data-authority={gate.authority ? "true" : "false"}
          >
            <div className={styles.gateHead}>
              <span className={styles.gateIndex}>{gate.index}</span>
              <span className={styles.gateState} data-tone={gate.tone}>
                {gate.state}
              </span>
            </div>
            <h2 className={styles.gateOwner}>{gate.owner}</h2>
            <p className={styles.gateRole}>{gate.role}</p>
            <p className={styles.gateFact}>{gate.fact}</p>
          </article>
        ))}
      </section>

      <section className={styles.verdict} aria-label="Company position">
        <div className={styles.verdictMain}>
          <strong>No proof. No payment.</strong>
          <span>Charge-on-verification · enforced in the domain layer</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>9</span>
          <span className={styles.statLabel}>Bugs found by Replay</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>2</span>
          <span className={styles.statLabel}>Human cohorts, disjoint</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>137</span>
          <span className={styles.statLabel}>Invariant tests passing</span>
        </div>
      </section>

      <p className={styles.footnote}>
        Full audited ledger at <Link href="/">talos-ai-ten.vercel.app</Link> · Band and
        Render are typed contracts, deliberately not wired — we claim only what
        runs
      </p>
    </main>
  );
}
