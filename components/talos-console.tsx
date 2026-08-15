"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CircleOff,
  Code2,
  ExternalLink,
  FileCheck2,
  FileJson2,
  FlaskConical,
  Landmark,
  Link2,
  LockKeyhole,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
  X,
} from "lucide-react";

import {
  companyRoster,
  demoOrder,
  ledgerEvents,
  providerStates,
  type LedgerEvent,
  type LedgerStatus,
} from "@/lib/ui/demo-case";

const roleIcons: LucideIcon[] = [Bot, FileJson2, Code2, UserRoundCheck, WalletCards];

const statusIcons: Record<LedgerStatus, LucideIcon> = {
  complete: Check,
  blocked: X,
  verified: BadgeCheck,
  released: CircleDollarSign,
};

function DemoPill({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "demo-pill demo-pill--compact" : "demo-pill"}>
      Demo
    </span>
  );
}

function OrderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="order-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Roster() {
  return (
    <aside className="roster-panel" aria-labelledby="roster-title">
      <div className="panel-heading">
        <div>
          <p className="micro-label">Company / 05 roles</p>
          <h2 id="roster-title">Operating roster</h2>
        </div>
        <Building2 size={20} aria-hidden="true" />
      </div>

      <div className="roster-list">
        {companyRoster.map((role, index) => {
          const RoleIcon = roleIcons[index] ?? Bot;

          return (
            <article className="role-card" key={role.title}>
              <span className="role-avatar" aria-hidden="true">
                <RoleIcon size={16} strokeWidth={1.8} />
              </span>
              <div>
                <div className="role-title-row">
                  <h3>{role.title}</h3>
                  <span>Active</span>
                </div>
                <p className="role-owner">{role.owner}</p>
                <p>{role.mandate}</p>
              </div>
            </article>
          );
        })}
      </div>

      <article className="external-authority-card">
        <div className="authority-seal" aria-hidden="true">
          R
        </div>
        <div>
          <p className="micro-label">Outside the org chart</p>
          <h3>Replay authority</h3>
          <p>
            Independent machine witness. It can veto release; Talos cannot edit
            or dismiss its verdict.
          </p>
        </div>
        <span className="veto-power">
          <ShieldAlert size={13} aria-hidden="true" /> Veto power
        </span>
      </article>
    </aside>
  );
}

function LedgerRow({
  event,
  selected,
  onSelect,
}: {
  event: LedgerEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  const StatusIcon = statusIcons[event.status];

  return (
    <li
      className={`ledger-row ledger-row--${event.status}${
        event.isVeto ? " ledger-row--veto" : ""
      }${event.isCompilerGate ? " ledger-row--compiler" : ""}${
        event.attempt ? ` ledger-row--attempt-${event.attempt}` : ""
      }`}
    >
      {event.id === "pioneer-spec-retry" ? (
        <span className="retry-connector" aria-hidden="true">
          <RefreshCcw size={13} /> recompile after veto
        </span>
      ) : null}
      <button
        className="ledger-row-button"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Inspect evidence for ${event.title}`}
      >
        <span className="ledger-sequence">{event.sequence}</span>
        <span className="ledger-time">{event.time}</span>
        <span className="ledger-copy">
          <span className="ledger-actor">
            {event.department} <span>/ {event.actor}</span>
          </span>
          <strong>{event.title}</strong>
          <span className="ledger-summary">{event.summary}</span>
        </span>
        <span className="ledger-state">
          <StatusIcon size={14} aria-hidden="true" />
          {event.statusLabel}
        </span>
        <ArrowDownRight className="inspect-arrow" size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function EvidenceInspector({ event }: { event: LedgerEvent }) {
  return (
    <aside className="inspector-panel" aria-labelledby="inspector-title">
      <div className="panel-heading inspector-heading">
        <div>
          <p className="micro-label">Selected record / {event.sequence}</p>
          <h2 id="inspector-title">Evidence inspector</h2>
        </div>
        <FileCheck2 size={20} aria-hidden="true" />
      </div>

      <div className="inspector-truth">
        <CircleOff size={15} aria-hidden="true" />
        <span>
          <strong>Fixture evidence</strong>
          No provider request was made
        </span>
      </div>

      <div className="evidence-document">
        <div className="document-topline">
          <span>{event.evidenceType}</span>
          <DemoPill compact />
        </div>
        <h3>{event.title}</h3>
        <code>{event.evidenceId}</code>

        <dl>
          {event.evidence.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd className={item.emphasis ? `datum--${item.emphasis}` : undefined}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="evidence-note">{event.note}</p>
      </div>

      <div className="integrity-box">
        <LockKeyhole size={16} aria-hidden="true" />
        <div>
          <strong>Append-only decision record</strong>
          <p>
            In live mode, every verdict points to the source recording, Pioneer
            extraction, Talos policy record, candidate commit, study result, and
            order state transition.
          </p>
        </div>
      </div>
    </aside>
  );
}

function ProofInterlock() {
  return (
    <section className="proof-interlock" aria-labelledby="interlock-title">
      <div className="interlock-heading">
        <p className="micro-label">Commercial control</p>
        <h2 id="interlock-title">Two proofs turn the key.</h2>
        <p>
          Replay proves the software. Terac proves the outcome. Only then can the
          Treasurer expose Stripe&apos;s payment link.
        </p>
      </div>

      <div className="interlock-assembly">
        <article className="proof-key">
          <span className="proof-icon" aria-hidden="true">
            <ShieldCheck size={21} />
          </span>
          <div>
            <span>Key 01 · Replay</span>
            <strong>12 / 12 clean</strong>
            <small>Independent machine proof</small>
          </div>
          <CheckCircle2 size={18} aria-label="Verified" />
        </article>

        <span className="interlock-plus" aria-hidden="true">
          +
        </span>

        <article className="proof-key">
          <span className="proof-icon" aria-hidden="true">
            <FlaskConical size={21} />
          </span>
          <div>
            <span>Key 02 · Terac</span>
            <strong>12% → 84%</strong>
            <small>Fresh human outcome proof</small>
          </div>
          <CheckCircle2 size={18} aria-label="Verified" />
        </article>

        <ArrowRight className="interlock-arrow" size={23} aria-hidden="true" />

        <article className="payment-release">
          <span className="release-icon" aria-hidden="true">
            <Link2 size={22} />
          </span>
          <div>
            <span>Stripe payment link</span>
            <strong>Unlocked · $149</strong>
            <small>Demo eligibility; no live charge</small>
          </div>
          <DemoPill compact />
        </article>
      </div>
    </section>
  );
}

export function TalosConsole() {
  const [selectedEventId, setSelectedEventId] = useState("replay-veto");
  const selectedEvent =
    ledgerEvents.find((event) => event.id === selectedEventId) ?? ledgerEvents[0];

  return (
    <main id="top">
      <div className="app-shell">
        <header className="masthead" aria-label="Talos application header">
          <a className="talos-wordmark" href="#top" aria-label="Talos home">
            <span className="talos-mark" aria-hidden="true">
              T
            </span>
            <span>
              TALOS
              <small>Autonomous repair company</small>
            </span>
          </a>

          <div className="header-state" role="status">
            <span className="state-light" aria-hidden="true" />
            Company operating
            <span className="header-divider" aria-hidden="true" />
            Providers disconnected
          </div>

          <a className="header-link" href="#proof-interlock">
            View payment gate <ArrowRight size={14} aria-hidden="true" />
          </a>
        </header>

        <section className="demo-disclosure" aria-label="Demo disclosure">
          <DemoPill />
          <p>
            Synthetic judge walkthrough. No live customer, repository, provider
            call, Payment Link, charge, or revenue is represented here.
          </p>
        </section>

        <section className="company-intro" aria-labelledby="company-title">
          <div>
            <p className="intro-kicker">The company ledger / running autonomously</p>
            <h1 id="company-title">
              The agent repairs it.
              <span>Proof earns the right to charge.</span>
            </h1>
          </div>
          <p className="intro-copy">
            Talos sells outcome-backed repairs to broken revenue flows. Pioneer
            extracts root cause and risk from Replay evidence; deterministic Talos
            policy intersects that result with the repository&apos;s predeclared file
            allowlist before Engineering can start. Replay and a fresh Terac holdout
            decide whether Stripe ever unlocks payment.
          </p>
        </section>

        <section className="order-console" aria-labelledby="ledger-title">
          <header className="order-header">
            <div className="order-title">
              <span className="order-number">ORDER {demoOrder.id}</span>
              <div>
                <p className="micro-label">Autonomous company record</p>
                <h2 id="ledger-title">Company ledger</h2>
              </div>
            </div>

            <div className="order-status">
              <BadgeCheck size={18} aria-hidden="true" />
              <span>
                <small>Order state</small>
                {demoOrder.state}
              </span>
            </div>
          </header>

          <div className="order-facts" aria-label="Order facts">
            <OrderFact label="Customer" value={demoOrder.customer} />
            <OrderFact label="Product" value={demoOrder.product} />
            <OrderFact label="Contract price" value={demoOrder.price} />
            <OrderFact label="Projected margin" value={demoOrder.margin} />
            <div className="order-fact order-fact--payment">
              <span>Settlement</span>
              <strong>
                <Link2 size={14} aria-hidden="true" /> {demoOrder.paymentState}
              </strong>
            </div>
          </div>

          <div className="company-workspace">
            <Roster />

            <section className="ledger-panel" aria-labelledby="timeline-title">
              <div className="panel-heading ledger-heading">
                <div>
                  <p className="micro-label">Chronology / append-only</p>
                  <h2 id="timeline-title">Decision record</h2>
                </div>
                <span>Click any record to inspect</span>
              </div>

              <div className="compiler-rule" role="note">
                <FileJson2 size={15} aria-hidden="true" />
                <span>
                  <strong>Pioneer evidence + Talos policy gate</strong>
                  Stale evidence or empty allowlist intersection → Superserve VM never starts
                </span>
              </div>

              <ol className="ledger-list">
                {ledgerEvents.map((event) => (
                  <LedgerRow
                    event={event}
                    key={event.id}
                    selected={event.id === selectedEvent.id}
                    onSelect={() => setSelectedEventId(event.id)}
                  />
                ))}
              </ol>
            </section>

            <EvidenceInspector event={selectedEvent} />
          </div>

          <footer className="provider-footer" aria-label="Provider connection state">
            {providerStates.map((provider) => (
              <div key={provider.name}>
                <span className="provider-dot" aria-hidden="true" />
                <strong>{provider.name}</strong>
                <span>{provider.role}</span>
                <small>{provider.state}</small>
              </div>
            ))}
          </footer>
        </section>

        <div id="proof-interlock">
          <ProofInterlock />
        </div>

        <section className="operating-contract" aria-labelledby="contract-title">
          <div>
            <p className="intro-kicker">Separation of powers</p>
            <h2 id="contract-title">The repair agent cannot grade its own work.</h2>
          </div>
          <div className="contract-rules">
            <span>
              <LockKeyhole size={17} aria-hidden="true" /> No production writes
            </span>
            <span>
              <ShieldAlert size={17} aria-hidden="true" /> No Replay override
            </span>
            <span>
              <FlaskConical size={17} aria-hidden="true" /> No reused Terac cohort
            </span>
            <span>
              <Landmark size={17} aria-hidden="true" /> No proof, no payment link
            </span>
          </div>
        </section>

        <footer className="site-footer">
          <span>TALOS / outcome-backed autonomous repair</span>
          <span>
            Replay proves the software. Fresh people prove the outcome. Stripe
            proves somebody paid.
          </span>
          <a href="#top">
            Back to top <ExternalLink size={13} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}
