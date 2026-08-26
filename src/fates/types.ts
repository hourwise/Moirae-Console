export type CallerKind = 'agent' | 'browser' | 'human' | 'service';

export interface CallerIdentity {
  readonly kind: CallerKind;
  readonly id: string;
  readonly sessionId?: string;
}

export type RequestSource = 'webmcp' | 'ui' | 'internal';

export interface RequestContext {
  readonly source: RequestSource;
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly purpose?: string;
}

export interface GovernedRequest {
  readonly requestId: string;
  readonly caller: CallerIdentity;
  readonly action: string;
  readonly parameters: unknown;
  readonly context: RequestContext;
}

export type GovernanceStatus =
  'ALLOWED' | 'REQUIRES_APPROVAL' | 'DENIED' | 'QUARANTINED' | 'FAILED' | 'UNKNOWN';

export type EvidenceSource = 'fates' | 'synthetic-test' | 'console';
export type EvidenceAuthority = 'authoritative' | 'synthetic' | 'unverified';

export interface GovernanceEvidence {
  readonly evidenceId: string;
  readonly source: EvidenceSource;
  readonly authority: EvidenceAuthority;
  readonly receiptId?: string;
  readonly decisionDigest?: string;
  readonly provenance?: Readonly<Record<string, string>>;
  readonly canonicalAction?: string;
  readonly documentId?: string;
  readonly expectedSha256?: string;
  readonly purpose?: string;
  readonly fatesRequestId?: string;
  readonly correlationId?: string;
  readonly canonicalRequestDigest?: string;
  readonly authorityBindingDigest?: string;
  readonly decisionId?: string;
  readonly outcomeId?: string;
  readonly auditId?: string;
  readonly outcomeState?: string;
  readonly policyDecision?: string;
  readonly effectSemantics?: string;
  readonly fatesResourceReadAttemptCount?: number;
  readonly documentDisclosureByFates?: boolean;
  readonly authenticatedWorkloadIdentity?: Readonly<Record<string, string>>;
  readonly transportBinding?: Readonly<{
    readonly canonicalAction: string;
    readonly documentId: string;
    readonly expectedSha256: string;
    readonly purpose: string;
    readonly correlationId: string;
  }>;
}

interface GovernanceOutcomeBase {
  readonly requestId: string;
  readonly outcomeId: string;
  readonly status: GovernanceStatus;
  readonly evidence: GovernanceEvidence;
}

export interface AllowedOutcome extends GovernanceOutcomeBase {
  readonly status: 'ALLOWED';
}

export interface ApprovalRequiredOutcome extends GovernanceOutcomeBase {
  readonly status: 'REQUIRES_APPROVAL';
  readonly approvalBinding: Readonly<{
    readonly bindingId: string;
    readonly freshnessUntil?: string;
  }>;
}

export interface DeniedOutcome extends GovernanceOutcomeBase {
  readonly status: 'DENIED';
  readonly reasonCode: string;
}

export interface QuarantinedOutcome extends GovernanceOutcomeBase {
  readonly status: 'QUARANTINED';
  readonly reasonCode: string;
}

export interface FailedOutcome extends GovernanceOutcomeBase {
  readonly status: 'FAILED';
  readonly errorCode: string;
  readonly retryable: boolean;
}

export interface UnknownOutcome extends GovernanceOutcomeBase {
  readonly status: 'UNKNOWN';
  readonly reasonCode: string;
}

export type GovernanceOutcome =
  | AllowedOutcome
  | ApprovalRequiredOutcome
  | DeniedOutcome
  | QuarantinedOutcome
  | FailedOutcome
  | UnknownOutcome;
