"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen bg-paper px-6 py-20 text-ink">
      <section className="mx-auto max-w-2xl border-2 border-ink bg-white p-8 shadow-panel">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-signal">
          Company ledger interrupted
        </p>
        <h1 className="mt-4 font-[var(--font-display)] text-5xl font-extrabold uppercase leading-none">
          Talos failed closed.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-ink/70">
          No payment or delivery action was unlocked. Retry the ledger; provider
          state will be re-read before any decision is made.
        </p>
        <button
          className="mt-8 inline-flex items-center gap-2 bg-ink px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-white focus-visible:outline-signal"
          onClick={reset}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} /> Retry ledger
        </button>
        <TriangleAlert className="mt-8 text-signal" aria-hidden="true" size={24} />
      </section>
    </main>
  );
}
