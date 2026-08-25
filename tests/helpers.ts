import { syntheticEvidence } from '../src/fates/fake-client';
import type { GovernanceOutcome, GovernanceStatus, GovernedRequest } from '../src/fates/types';

export const request: GovernedRequest = {
  requestId: 'request-test-001',
  caller: {
    kind: 'agent',
    id: 'agent-test-001',
    sessionId: 'session-test-001',
  },
  action: 'inspect_document',
  parameters: {
    documentId: 'document-test-001',
    options: { includeMetadata: true },
  },
  context: {
    source: 'webmcp',
    tenantId: 'tenant-test-001',
    workspaceId: 'workspace-test-001',
    purpose: 'mc-00-test',
  },
};

export function syntheticOutcome(
  status: GovernanceStatus,
  requestId = request.requestId,
): GovernanceOutcome {
  const base = {
    requestId,
    outcomeId: `synthetic-outcome-${status.toLowerCase()}`,
    evidence: syntheticEvidence(status.toLowerCase()),
  };

  switch (status) {
    case 'ALLOWED':
      return { ...base, status };
    case 'REQUIRES_APPROVAL':
      return {
        ...base,
        status,
        approvalBinding: { bindingId: 'synthetic-approval-binding-001' },
      };
    case 'DENIED':
      return { ...base, status, reasonCode: 'SYNTHETIC_DENIAL' };
    case 'QUARANTINED':
      return { ...base, status, reasonCode: 'SYNTHETIC_QUARANTINE' };
    case 'FAILED':
      return { ...base, status, errorCode: 'SYNTHETIC_FAILURE', retryable: false };
    case 'UNKNOWN':
      return { ...base, status, reasonCode: 'SYNTHETIC_UNKNOWN' };
  }
}

export function authoritativeAllowedOutcome(requestId = request.requestId): GovernanceOutcome {
  return {
    requestId,
    outcomeId: 'fates-outcome-test-001',
    status: 'ALLOWED',
    evidence: {
      evidenceId: 'fates-evidence-test-001',
      source: 'fates',
      authority: 'authoritative',
      receiptId: 'fates-receipt-test-001',
      decisionDigest: 'fates-digest-test-001',
    },
  };
}
