import type {
  Command,
  DomainEvent,
  TalosOrder,
  HumanStudyResult,
  PaymentEvidence,
  ReleaseCertificateRef,
  ReplayBugEvidence,
  ReplaySnapshot,
} from "./types";

export interface OrderRepository {
  get(orderId: string): Promise<TalosOrder | null>;
  save(input: {
    order: TalosOrder;
    expectedVersion: number;
    events: DomainEvent[];
    commands: Command[];
  }): Promise<void>;
}

export interface CommandOutbox {
  claimNext(): Promise<{ id: string; command: Command } | null>;
  complete(commandId: string, providerReceipt?: string): Promise<void>;
  retry(commandId: string, errorCode: string): Promise<void>;
  fail(commandId: string, errorCode: string): Promise<void>;
}

export interface ReplayPort {
  createProject(input: {
    orderId: string;
    targetUrl: string;
    criticalJourney: string;
    bugWebhookUrl: string;
    finishedWebhookUrl: string;
  }): Promise<{ projectId: string; projectUrl: string }>;
  getSnapshot(input: {
    projectId: string;
    expectedTargetUrl: string;
    buildIdentityUrl: string;
  }): Promise<ReplaySnapshot>;
  getBug(bugId: string): Promise<ReplayBugEvidence>;
  markFixed(bugId: string): Promise<void>;
}

export interface HumanVerificationPort {
  startStudy(input: {
    orderId: string;
    phase: "BASELINE" | "HOLDOUT";
    targetUrl: string;
    criticalJourney: string;
    participantCount: number;
    excludeCohortFingerprint?: string;
  }): Promise<{ studyId: string }>;
  getStudyResult(studyId: string): Promise<HumanStudyResult>;
}

export interface PaymentLinkPort {
  getOrganizerPaymentLink(input: {
    orderId: string;
    amountCents: number;
    currency: "usd";
  }): Promise<{ url: string }>;
  parseConfirmation(input: {
    rawBody: Uint8Array;
    signature: string;
  }): Promise<PaymentEvidence>;
}

export interface CertificatePort {
  issue(order: TalosOrder): Promise<ReleaseCertificateRef>;
  deliver(input: {
    certificate: ReleaseCertificateRef;
    destination: string;
    idempotencyKey: string;
  }): Promise<{ receiptId: string }>;
}
