export type LedgerStatus = "complete" | "blocked" | "verified" | "released";

export type EvidenceDatum = {
  label: string;
  value: string;
  emphasis?: "danger" | "proof" | "money";
};

export type LedgerEvent = {
  id: string;
  sequence: string;
  time: string;
  actor: string;
  department: string;
  title: string;
  summary: string;
  status: LedgerStatus;
  statusLabel: string;
  evidenceType: string;
  evidenceId: string;
  evidence: EvidenceDatum[];
  note: string;
  attempt?: 1 | 2;
  isVeto?: boolean;
};

export const providerStates = [
  { name: "Replay", role: "External release authority", state: "Disconnected" },
  { name: "Superserve", role: "Isolated repair runtime", state: "Disconnected" },
  { name: "Terac", role: "Fresh human outcome study", state: "Disconnected" },
  { name: "Stripe", role: "Proof-gated payment link", state: "Disconnected" },
] as const;

export const companyRoster = [
  {
    initials: "GM",
    title: "General Manager",
    owner: "Talos policy agent",
    mandate: "Accepts bounded jobs and enforces the commercial contract.",
  },
  {
    initials: "RE",
    title: "Repair Engineer",
    owner: "Talos · Superserve",
    mandate: "Authors candidates in an isolated sandbox. Cannot approve its work.",
  },
  {
    initials: "RO",
    title: "Research Ops",
    owner: "Talos · Terac",
    mandate: "Runs disjoint baseline and holdout cohorts against the declared task.",
  },
  {
    initials: "TR",
    title: "Treasurer",
    owner: "Talos · Stripe",
    mandate: "Withholds the payment link until both proof keys are valid.",
  },
] as const;

export const ledgerEvents: LedgerEvent[] = [
  {
    id: "job-accepted",
    sequence: "01",
    time: "11:04:12",
    actor: "General Manager",
    department: "Talos",
    title: "Order accepted under a bounded contract",
    summary: "One repository, one checkout journey, two repair attempts maximum.",
    status: "complete",
    statusLabel: "Recorded",
    evidenceType: "Signed job policy",
    evidenceId: "policy_tal_0042_v1",
    evidence: [
      { label: "Authorized target", value: "acme-demo / checkout" },
      { label: "Attempt ceiling", value: "2 candidates" },
      { label: "Production writes", value: "Prohibited" },
    ],
    note: "The synthetic order is preloaded for the judge walkthrough. No repository was contacted.",
  },
  {
    id: "baseline",
    sequence: "02",
    time: "11:07:40",
    actor: "Research Ops",
    department: "Terac",
    title: "Baseline cohort establishes the failure",
    summary: "Fresh testers attempt the predeclared checkout task before repair.",
    status: "complete",
    statusLabel: "Baseline sealed",
    evidenceType: "General-population study",
    evidenceId: "terac_baseline_demo_18",
    evidence: [
      { label: "Cohort", value: "25 fresh testers" },
      { label: "Task completion", value: "12% · 3 / 25", emphasis: "danger" },
      { label: "Primary blocker", value: "Checkout never advances" },
    ],
    note: "Baseline and holdout identities are disjoint in the operating policy.",
  },
  {
    id: "replay-finding",
    sequence: "03",
    time: "11:10:03",
    actor: "External Authority",
    department: "Replay",
    title: "Replay isolates the blocking failure",
    summary: "The selected plan node detaches after hydration; submit creates no network call.",
    status: "blocked",
    statusLabel: "Release blocked",
    evidenceType: "Replay recording + finding",
    evidenceId: "replay_demo_7f31 · finding_03",
    evidence: [
      { label: "Failed check", value: "checkout_submit_no_network_call", emphasis: "danger" },
      { label: "Console evidence", value: "selectedNode.isConnected = false" },
      { label: "Open blockers", value: "1", emphasis: "danger" },
    ],
    note: "Replay is outside the Talos org chart. The repair agent cannot dismiss this finding.",
  },
  {
    id: "attempt-one",
    sequence: "04",
    time: "11:13:26",
    actor: "Repair Engineer",
    department: "Superserve",
    title: "Candidate 1 patches the visible symptom",
    summary: "The sandboxed engineer re-enables submit without repairing the stale selection state.",
    status: "complete",
    statusLabel: "Sent to QA",
    evidenceType: "Sandbox candidate",
    evidenceId: "sha_demo_91ac2f",
    evidence: [
      { label: "Attempt", value: "1 / 2" },
      { label: "Files changed", value: "2" },
      { label: "Environment", value: "Disposable Superserve sandbox" },
    ],
    note: "Candidate code never reaches production. Replay receives only the preview URL and declared journey.",
    attempt: 1,
  },
  {
    id: "replay-veto",
    sequence: "05",
    time: "11:15:51",
    actor: "External Authority",
    department: "Replay",
    title: "RELEASE VETO — candidate 1 rejected",
    summary: "The button responds, but the Payment Intent is still never created. Settlement remains locked.",
    status: "blocked",
    statusLabel: "Hard veto",
    evidenceType: "Replay blocking verdict",
    evidenceId: "verdict_demo_b19e",
    evidence: [
      { label: "Verdict", value: "RELEASE_BLOCKED", emphasis: "danger" },
      { label: "Failed check", value: "payment_intent_created = false", emphasis: "danger" },
      { label: "Financial effect", value: "$149 payment link withheld" },
    ],
    note: "This verdict sends work back to Engineering. No Talos role has authority to override it.",
    attempt: 1,
    isVeto: true,
  },
  {
    id: "attempt-two",
    sequence: "06",
    time: "11:19:08",
    actor: "Repair Engineer",
    department: "Superserve",
    title: "Candidate 2 repairs the underlying state",
    summary: "The engineer re-resolves the plan by stable ID and waits for confirmed pricing state.",
    status: "complete",
    statusLabel: "Sent to QA",
    evidenceType: "Sandbox candidate",
    evidenceId: "sha_demo_d4c881",
    evidence: [
      { label: "Attempt", value: "2 / 2" },
      { label: "Regression tests", value: "8 / 8 passed" },
      { label: "Protected areas", value: "Auth, migrations, payment code untouched" },
    ],
    note: "The retry is causally linked to the Replay veto and preserves the original failure evidence.",
    attempt: 2,
  },
  {
    id: "replay-clean",
    sequence: "07",
    time: "11:22:44",
    actor: "External Authority",
    department: "Replay",
    title: "Fresh Replay run returns clean",
    summary: "The same journey completes in a new session with no finding suppressed or dismissed.",
    status: "verified",
    statusLabel: "Proof key 1 / 2",
    evidenceType: "Replay clean report",
    evidenceId: "replay_demo_9aa2 · report_clean",
    evidence: [
      { label: "Journey steps", value: "12 / 12 clean", emphasis: "proof" },
      { label: "Open blockers", value: "0", emphasis: "proof" },
      { label: "Dismissed findings", value: "0" },
    ],
    note: "Machine correctness is necessary but not sufficient: payment stays locked pending human outcome proof.",
    attempt: 2,
  },
  {
    id: "holdout",
    sequence: "08",
    time: "11:29:17",
    actor: "Research Ops",
    department: "Terac",
    title: "Fresh holdout proves the human outcome",
    summary: "A disjoint cohort repeats the same task after repair and clears the predeclared lift threshold.",
    status: "verified",
    statusLabel: "Proof key 2 / 2",
    evidenceType: "General-population holdout",
    evidenceId: "terac_holdout_demo_27",
    evidence: [
      { label: "Baseline", value: "12% · 3 / 25" },
      { label: "Holdout", value: "84% · 21 / 25", emphasis: "proof" },
      { label: "Measured lift", value: "+72 percentage points", emphasis: "proof" },
    ],
    note: "The product claim is outcome-backed: the software works for fresh people, not only for the test runner.",
  },
  {
    id: "payment-released",
    sequence: "09",
    time: "11:29:18",
    actor: "Treasurer",
    department: "Stripe",
    title: "Payment link released after both proofs",
    summary: "The customer may now pay the fixed repair fee. No clean report or no lift would keep it hidden.",
    status: "released",
    statusLabel: "Link unlocked",
    evidenceType: "Settlement authorization",
    evidenceId: "stripe_link_demo_plink_42",
    evidence: [
      { label: "Replay proof", value: "Verified", emphasis: "proof" },
      { label: "Terac proof", value: "Verified", emphasis: "proof" },
      { label: "Eligible amount", value: "$149", emphasis: "money" },
    ],
    note: "Demo only: no live Payment Link, charge, customer, or revenue exists on this screen.",
  },
];

export const demoOrder = {
  id: "TAL–0042",
  state: "PROOF VERIFIED",
  product: "Checkout recovery",
  customer: "Synthetic storefront",
  price: "$149",
  margin: "63% projected",
  paymentState: "Link unlocked",
} as const;
