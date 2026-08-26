import { FatesUnavailableError } from './errors';
import type {
  ApprovalRequiredOutcome,
  AllowedOutcome,
  FailedOutcome,
  GovernanceEvidence,
  GovernanceOutcome,
  GovernedRequest,
  UnknownOutcome,
} from './types';

export interface FatesClient {
  govern(request: GovernedRequest): Promise<GovernanceOutcome>;
}

export interface FatesTransportBinding {
  readonly canonicalAction: string;
  readonly documentId: string;
  readonly expectedSha256: string;
  readonly purpose: string;
  readonly correlationId: string;
  readonly destinationId?: string;
}

export interface FatesTransportResponse {
  readonly response: unknown;
  readonly binding: FatesTransportBinding;
}

export interface FatesTransport {
  send(request: GovernedRequest): Promise<unknown>;
}

export type FatesClientConfiguration =
  | {
      readonly environment: 'production';
      readonly transport?: FatesTransport;
    }
  | {
      readonly environment: 'test';
      readonly provider: FatesClient;
    };

export function createFatesClient(configuration: FatesClientConfiguration): FatesClient {
  if (configuration.environment === 'test') {
    return configuration.provider;
  }

  if (!configuration.transport) {
    return new UnavailableFatesClient();
  }

  return new TransportFatesClient(configuration.transport);
}

/**
 * The production branch deliberately has no fake-provider fallback. A missing
 * transport becomes an unavailable boundary and is handled fail-closed by the
 * governance view model.
 */
class UnavailableFatesClient implements FatesClient {
  public async govern(): Promise<GovernanceOutcome> {
    throw new FatesUnavailableError('No production Fates transport is configured.');
  }
}

class TransportFatesClient implements FatesClient {
  public constructor(private readonly transport: FatesTransport) {}

  public async govern(request: GovernedRequest): Promise<GovernanceOutcome> {
    const response = await this.transport.send(snapshotGovernedRequest(request));
    return parseFatesOutcome(response, request.requestId);
  }
}

export function snapshotGovernedRequest(request: GovernedRequest): GovernedRequest {
  const snapshot = structuredClone(request) as GovernedRequest;
  return deepFreeze(snapshot);
}

export function parseFatesOutcome(raw: unknown, requestId: string): GovernanceOutcome {
  const transportResponse = parseTransportResponse(raw);
  if (transportResponse) {
    return parseAnankeOutcome(transportResponse.response, requestId, transportResponse.binding);
  }

  if (!isRecord(raw) || raw.requestId !== requestId || typeof raw.status !== 'string') {
    return unknownOutcome(requestId, 'MALFORMED_FATES_RESPONSE');
  }

  const evidence = parseEvidence(raw.evidence);
  if (!evidence) {
    return unknownOutcome(requestId, 'UNVERIFIABLE_FATES_EVIDENCE');
  }

  const outcomeId = stringValue(raw.outcomeId);
  if (!outcomeId) {
    return unknownOutcome(requestId, 'MALFORMED_FATES_OUTCOME_ID');
  }

  const base = {
    requestId,
    outcomeId,
    evidence,
  };

  switch (raw.status) {
    case 'ALLOWED':
      return { ...base, status: 'ALLOWED' } satisfies AllowedOutcome;
    case 'REQUIRES_APPROVAL': {
      const binding = isRecord(raw.approvalBinding) ? raw.approvalBinding : undefined;
      const bindingId = binding ? stringValue(binding.bindingId) : undefined;
      if (!bindingId) {
        return unknownOutcome(requestId, 'MALFORMED_APPROVAL_BINDING');
      }
      const freshnessUntil = binding ? stringValue(binding.freshnessUntil) : undefined;
      return {
        ...base,
        status: 'REQUIRES_APPROVAL',
        approvalBinding: { bindingId, ...(freshnessUntil ? { freshnessUntil } : {}) },
      } satisfies ApprovalRequiredOutcome;
    }
    case 'DENIED': {
      const reasonCode = stringValue(raw.reasonCode);
      return reasonCode
        ? { ...base, status: 'DENIED', reasonCode }
        : unknownOutcome(requestId, 'MALFORMED_DENIAL');
    }
    case 'QUARANTINED': {
      const reasonCode = stringValue(raw.reasonCode);
      return reasonCode
        ? { ...base, status: 'QUARANTINED', reasonCode }
        : unknownOutcome(requestId, 'MALFORMED_QUARANTINE');
    }
    case 'FAILED': {
      const errorCode = stringValue(raw.errorCode);
      if (typeof raw.retryable !== 'boolean' || !errorCode) {
        return unknownOutcome(requestId, 'MALFORMED_FAILURE');
      }
      return {
        ...base,
        status: 'FAILED',
        errorCode,
        retryable: raw.retryable,
      } satisfies FailedOutcome;
    }
    default:
      return unknownOutcome(requestId, 'UNRECOGNISED_FATES_STATUS');
  }
}

function parseTransportResponse(value: unknown): FatesTransportResponse | undefined {
  if (!isRecord(value) || !isRecord(value.binding) || !('response' in value)) {
    return undefined;
  }

  const binding = value.binding;
  const canonicalAction = stringValue(binding.canonicalAction);
  const documentId = stringValue(binding.documentId);
  const expectedSha256 = stringValue(binding.expectedSha256);
  const purpose = stringValue(binding.purpose);
  const correlationId = stringValue(binding.correlationId);
  if (!canonicalAction || !documentId || !expectedSha256 || !purpose || !correlationId) {
    return undefined;
  }

  return {
    response: value.response,
    binding: {
      canonicalAction,
      documentId,
      expectedSha256,
      purpose,
      correlationId,
      ...(stringValue(binding.destinationId)
        ? { destinationId: stringValue(binding.destinationId) }
        : {}),
    },
  };
}

function parseAnankeOutcome(
  raw: unknown,
  requestId: string,
  transportBinding?: FatesTransportBinding,
): GovernanceOutcome {
  if (!isRecord(raw) || !isRecord(raw.outcome) || !isRecord(raw.evidence)) {
    return unknownOutcome(requestId, 'MALFORMED_FATES_RESPONSE');
  }

  const outcomeState = stringValue(raw.outcome.state);
  const evidence = parseAnankeEvidence(raw.evidence, outcomeState, transportBinding);
  if (!outcomeState || !evidence) {
    return unknownOutcome(requestId, 'UNVERIFIABLE_FATES_EVIDENCE');
  }

  const outcomeId = evidence.outcomeId ?? evidence.evidenceId;
  if (!outcomeId) {
    return unknownOutcome(requestId, 'MALFORMED_FATES_OUTCOME_ID');
  }

  const base = { requestId, outcomeId, evidence };
  switch (outcomeState) {
    case 'COMPLETED':
      return raw.evidence.authorizationDecision === 'ALLOW' && evidence.policyDecision === 'ALLOW'
        ? { ...base, status: 'ALLOWED' }
        : unknownOutcome(requestId, 'UNVERIFIABLE_FATES_DECISION');
    case 'DENIED':
      return {
        ...base,
        status: 'DENIED',
        reasonCode: stringValue(raw.outcome.reasonCode) ?? 'FATES_DENIED',
      };
    case 'WAITING_FOR_APPROVAL': {
      const bindingId = stringValue(raw.approvalGrantId);
      return bindingId
        ? {
            ...base,
            status: 'REQUIRES_APPROVAL',
            approvalBinding: {
              bindingId,
              ...(evidence.expiresAt ? { freshnessUntil: evidence.expiresAt } : {}),
            },
          }
        : unknownOutcome(requestId, 'MALFORMED_APPROVAL_BINDING');
    }
    case 'FAILED':
    case 'TIMED_OUT':
    case 'STALE_STATE':
    case 'APPROVAL_INVALIDATED':
    case 'PARTIAL_SUCCESS':
      return {
        ...base,
        status: 'FAILED',
        errorCode: stringValue(raw.outcome.reasonCode) ?? 'FATES_EXECUTION_FAILED',
        retryable: raw.outcome.retryable === true,
      };
    default:
      return unknownOutcome(requestId, 'UNRECOGNISED_FATES_STATUS');
  }
}

function parseAnankeEvidence(
  value: Record<string, unknown>,
  outcomeState: string | undefined,
  transportBinding: FatesTransportBinding | undefined,
): GovernanceEvidence | undefined {
  const outcomeId = stringValue(value.outcomeId);
  const decisionId = stringValue(value.decisionId);
  const evidenceId = outcomeId ?? decisionId;
  if (!evidenceId) {
    return undefined;
  }

  const canonicalRequestDigest = stringValue(value.canonicalRequestDigest);
  const authorityBindingDigest = stringValue(value.authorityBindingDigest);
  const authenticatedWorkloadIdentity = stringRecord(value.authenticatedWorkloadIdentity);
  const provenance: Record<string, string> = { runtime: 'ananke' };
  for (const key of ['routeState', 'dispatchState', 'policyVersion']) {
    const item = stringValue(value[key]);
    if (item) provenance[key] = item;
  }

  return {
    evidenceId,
    source: 'fates',
    authority: 'authoritative',
    canonicalAction: stringValue(value.action),
    documentId: stringValue(value.documentId),
    expectedSha256: stringValue(value.expectedSha256),
    destinationId: stringValue(value.destinationId),
    purpose: transportBinding?.purpose ?? stringValue(value.purpose),
    fatesRequestId: stringValue(value.requestId),
    correlationId: stringValue(value.correlationId),
    canonicalRequestDigest,
    authorityBindingDigest,
    authorityReceiptDigest: stringValue(value.authorityReceiptDigest),
    issuedAt: stringValue(value.issuedAt),
    expiresAt: stringValue(value.expiresAt),
    receiptId: stringValue(value.receiptId),
    nonce: stringValue(value.nonce),
    replayKeyDigest: stringValue(value.replayKeyDigest),
    replayState: stringValue(value.replayState),
    decisionId,
    outcomeId,
    auditId: stringValue(value.auditId),
    outcomeState,
    policyDecision: stringValue(value.policyDecision),
    policyReasonCode: stringValue(value.policyReasonCode),
    policyReason: stringValue(value.policyReason),
    approvalRequestId: stringValue(value.approvalRequestId),
    approvalState: stringValue(value.approvalState),
    approvalActionHash: stringValue(value.approvalActionHash),
    approvalOperatorId: stringValue(value.approvalOperatorId),
    approvalOperatorSessionId: stringValue(value.approvalOperatorSessionId),
    approvalDecision: stringValue(value.approvalDecision),
    requestedAt: stringValue(value.requestedAt),
    policyVersion: stringValue(value.policyVersion),
    effectSemantics: stringValue(value.effectSemantics),
    fatesResourceReadAttemptCount:
      typeof value.fatesResourceReadAttemptCount === 'number'
        ? value.fatesResourceReadAttemptCount
        : undefined,
    fatesPublicationAttemptCount:
      typeof value.fatesPublicationAttemptCount === 'number'
        ? value.fatesPublicationAttemptCount
        : undefined,
    documentDisclosureByFates:
      typeof value.documentDisclosureByFates === 'boolean'
        ? value.documentDisclosureByFates
        : undefined,
    documentPublicationByFates:
      typeof value.documentPublicationByFates === 'boolean'
        ? value.documentPublicationByFates
        : undefined,
    authenticatedWorkloadIdentity,
    provenance,
    ...(transportBinding ? { transportBinding } : {}),
  };
}

function parseEvidence(value: unknown): GovernanceEvidence | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const evidenceId = stringValue(value.evidenceId);
  const receiptId = stringValue(value.receiptId);
  const decisionDigest = stringValue(value.decisionDigest);
  if (!evidenceId || !receiptId || !decisionDigest) {
    return undefined;
  }

  return {
    evidenceId,
    source: 'fates',
    authority: 'authoritative',
    receiptId,
    decisionDigest,
  };
}

export function failedOutcome(requestId: string, error: unknown): FailedOutcome {
  return {
    requestId,
    outcomeId: `console-failure-${requestId}`,
    status: 'FAILED',
    errorCode: error instanceof Error ? error.name : 'FATES_BOUNDARY_ERROR',
    retryable: true,
    evidence: {
      evidenceId: `console-evidence-${requestId}`,
      source: 'console',
      authority: 'unverified',
    },
  };
}

export function unknownOutcome(requestId: string, reasonCode: string): UnknownOutcome {
  return {
    requestId,
    outcomeId: `console-unknown-${requestId}`,
    status: 'UNKNOWN',
    reasonCode,
    evidence: {
      evidenceId: `console-evidence-${requestId}`,
      source: 'console',
      authority: 'unverified',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== 'string')) {
    return undefined;
  }
  return Object.fromEntries(entries) as Readonly<Record<string, string>>;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }

  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

export function isAuthoritativeAllow(outcome: GovernanceOutcome): outcome is AllowedOutcome {
  return (
    outcome.status === 'ALLOWED' &&
    Boolean(outcome.outcomeId) &&
    outcome.evidence.source === 'fates' &&
    outcome.evidence.authority === 'authoritative' &&
    Boolean(
      outcome.evidence.evidenceId && outcome.evidence.receiptId && outcome.evidence.decisionDigest,
    )
  );
}
