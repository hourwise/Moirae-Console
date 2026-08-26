import { syntheticEvidence } from '../src/fates/fake-client';
import type { GovernanceOutcome, GovernanceStatus, GovernedRequest } from '../src/fates/types';
import {
  MOIRAE_AUTHORITY_BINDING,
  MOIRAE_FATES_CANONICAL_REQUEST_DIGEST,
  MOIRAE_FATES_EXPECTED_SHA256,
  MOIRAE_FATES_PURPOSE,
} from '../server/moirae-authority';

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
      canonicalAction: MOIRAE_AUTHORITY_BINDING.canonicalAction,
      documentId: MOIRAE_AUTHORITY_BINDING.documentId,
      expectedSha256: MOIRAE_FATES_EXPECTED_SHA256,
      purpose: MOIRAE_FATES_PURPOSE,
      fatesRequestId: 'ananke-request-test-001',
      correlationId: requestId,
      canonicalRequestDigest: MOIRAE_FATES_CANONICAL_REQUEST_DIGEST,
      authorityBindingDigest: 'b'.repeat(64),
      decisionId: 'decision-test-001',
      outcomeId: 'fates-outcome-test-001',
      auditId: 'audit-test-001',
      outcomeState: 'COMPLETED',
      policyDecision: 'ALLOW',
      effectSemantics: 'AUTHORIZATION_ONLY_NO_RESOURCE_READ',
      fatesResourceReadAttemptCount: 0,
      documentDisclosureByFates: false,
      authenticatedWorkloadIdentity: {
        authenticatedPrincipalId: 'moirae-console-host',
        actingPrincipalId: 'moirae-document-inspection-agent',
      },
      transportBinding: {
        ...MOIRAE_AUTHORITY_BINDING,
        correlationId: requestId,
      },
    },
  };
}
