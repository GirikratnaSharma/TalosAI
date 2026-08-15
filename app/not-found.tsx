import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
      <section className="max-w-xl border-l-[6px] border-signal pl-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
          Route outside contract / 404
        </p>
        <h1 className="mt-4 font-[var(--font-display)] text-6xl font-extrabold uppercase leading-[0.9]">
          Outside the repair boundary.
        </h1>
        <p className="mt-6 leading-7 text-ink/70">
          Talos only follows declared routes. This one is not part of the
          authorized journey.
        </p>
        <Link
          className="mt-7 inline-flex border-b border-current pb-1 font-mono text-xs font-semibold uppercase tracking-[0.12em]"
          href="/"
        >
          Return to company ledger
        </Link>
      </section>
    </main>
  );
}
