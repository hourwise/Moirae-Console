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
    outcome.evidence.source === 'fates' &&
    outcome.evidence.authority === 'authoritative' &&
    Boolean(outcome.evidence.receiptId && outcome.evidence.decisionDigest)
  );
}
