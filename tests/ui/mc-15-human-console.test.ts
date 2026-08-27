import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { InspectionResultView } from '../../src/app/InspectDocumentPanel';
import { PublicationResultView } from '../../src/app/PublishDocumentPanel';
import type { GovernanceEvidence, GovernedRequest } from '../../src/fates/types';
import type { InspectionResult } from '../../src/inspection/types';
import type { PublicationResult } from '../../src/publication/types';
import { WEBMCP_TOOLS } from '../../src/webmcp/tools';

const digest = 'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c';

const inspectionRequest: GovernedRequest = {
  requestId: 'mc15-inspection-request-001',
  caller: { kind: 'agent', id: 'inspection-agent', sessionId: 'inspection-session' },
  action: 'inspect_document',
  parameters: { documentId: 'demo-policy-001' },
  context: { source: 'webmcp', purpose: 'moirae.document-inspection' },
};

const publicationRequest: GovernedRequest = {
  requestId: 'mc15-publication-request-001',
  caller: { kind: 'agent', id: 'publication-agent', sessionId: 'publication-session' },
  action: 'publish_document',
  parameters: { documentId: 'demo-policy-001' },
  context: { source: 'webmcp', purpose: 'moirae.document-publication' },
};

const inspectionEvidence: GovernanceEvidence = {
  evidenceId: 'inspection-evidence-001',
  source: 'fates',
  authority: 'authoritative',
  receiptId: 'inspection-receipt-001',
  decisionDigest: 'inspection-decision-digest',
  decisionId: 'inspection-decision-001',
  outcomeId: 'inspection-outcome-001',
  auditId: 'inspection-audit-001',
  canonicalAction: 'fates.moirae.inspect-document.v1',
  documentId: 'demo-policy-001',
  expectedSha256: digest,
  purpose: 'moirae.document-inspection',
  fatesRequestId: 'fates-inspection-request-001',
  correlationId: inspectionRequest.requestId,
  canonicalRequestDigest: 'a'.repeat(64),
  authorityBindingDigest: 'b'.repeat(64),
  authorityReceiptDigest: 'c'.repeat(64),
  issuedAt: '2026-08-27T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:05.000Z',
  replayState: 'CONSUMED_ONCE',
  effectSemantics: 'AUTHORIZATION_ONLY_NO_RESOURCE_READ',
  fatesResourceReadAttemptCount: 0,
  documentDisclosureByFates: false,
  authenticatedWorkloadIdentity: {
    authenticatedPrincipalId: 'moirae-console-host',
    actingPrincipalId: 'inspection-agent',
  },
  provenance: { authority: 'fates-authoritative', effect: 'host-executed' },
};

const publicationEvidence: GovernanceEvidence = {
  evidenceId: 'publication-evidence-001',
  source: 'fates',
  authority: 'authoritative',
  receiptId: 'publication-receipt-001',
  decisionId: 'publication-decision-001',
  outcomeId: 'publication-outcome-001',
  auditId: 'publication-audit-001',
  canonicalAction: 'fates.moirae.publish-document.v1',
  documentId: 'demo-policy-001',
  expectedSha256: digest,
  destinationId: 'moirae.demo-publication-slot.v1',
  purpose: 'moirae.document-publication',
  fatesRequestId: 'fates-publication-request-001',
  correlationId: publicationRequest.requestId,
  canonicalRequestDigest: 'd'.repeat(64),
  authorityBindingDigest: 'e'.repeat(64),
  authorityReceiptDigest: 'f'.repeat(64),
  issuedAt: '2026-08-27T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:05.000Z',
  replayState: 'CONSUMED_ONCE',
  policyVersion: 'builtin:0.1.0',
  policyDecision: 'ALLOW',
  effectSemantics: 'AUTHORIZATION_ONLY_NO_PUBLICATION',
  fatesResourceReadAttemptCount: 0,
  fatesPublicationAttemptCount: 0,
  documentPublicationByFates: false,
  authenticatedWorkloadIdentity: {
    authenticatedPrincipalId: 'moirae-console-host',
    actingPrincipalId: 'publication-agent',
  },
  provenance: { authority: 'fates-authoritative', effect: 'host-executed' },
};

const inspectionResult: InspectionResult = {
  request: inspectionRequest,
  outcome: {
    requestId: inspectionRequest.requestId,
    outcomeId: 'inspection-outcome-001',
    status: 'ALLOWED',
    evidence: inspectionEvidence,
  },
  phases: [
    { name: 'REQUESTED', source: 'local-observed' },
    { name: 'ADMITTED', source: 'fates-authoritative' },
    { name: 'EXECUTED', source: 'host-executed' },
  ],
  hostDocumentReadCount: 1,
  disclosure: { state: 'DISCLOSED', evidenceMode: 'AUTHORITATIVE' },
  document: { documentId: 'demo-policy-001', content: 'bounded demonstration content' },
};

describe('MC-15 human governance presentation', () => {
  it('keeps exactly the two frozen WebMCP tools', () => {
    expect(WEBMCP_TOOLS.map((tool) => tool.name)).toEqual(['inspect_document', 'publish_document']);
  });

  it('renders the inspection decision and host result before collapsed evidence', () => {
    const html = renderToStaticMarkup(
      createElement(InspectionResultView, { result: inspectionResult }),
    );

    expect(html).toContain('ALLOWED');
    expect(html).toContain('DISCLOSED');
    expect(html).toContain('The document was disclosed only after authoritative Fates approval.');
    expect(html).toContain('<details class="technical-evidence">');
    expect(html).toContain('View technical evidence');
    expect(html).toContain('bounded demonstration content');
  });

  it('renders approval required, no effect, and the operator proof control', () => {
    const html = renderPublication(approvalRequiredResult());

    expect(html).toContain('APPROVAL REQUIRED');
    expect(html).toContain('NOT PUBLISHED');
    expect(html).toContain('Human approval required');
    expect(html).toContain('aria-label="Operator step-up proof"');
    expect(html).not.toContain('opaque-display-handle-001');
  });

  it('renders DENY as successful policy enforcement with zero host effect', () => {
    const html = renderPublication(deniedResult());

    expect(html).toContain('DENIED');
    expect(html).toContain('NOT EXECUTED');
    expect(html).toContain('Policy enforcement succeeded');
    expect(html).toContain('The host performed no publication effect.');
  });

  it('explains ALREADY_PUBLISHED without changing the raw evidence value', () => {
    const html = renderPublication(alreadyPublishedResult());

    expect(html).toContain('No new write was required');
    expect(html).toContain('already present at the destination with the same expected digest');
    expect(html).toContain('ALREADY_PUBLISHED');
  });

  it('retains the forensic evidence fields behind the expandable view', () => {
    const inspectionHtml = renderToStaticMarkup(
      createElement(InspectionResultView, { result: inspectionResult }),
    );
    const publicationHtml = renderPublication(alreadyPublishedResult());

    for (const label of [
      'Request ID',
      'Action',
      'Evidence ID',
      'Receipt ID',
      'Decision ID',
      'Outcome ID',
      'Audit ID',
      'Canonical request digest',
      'Authority binding digest',
      'Authority receipt digest',
      'Authority lifetime',
      'Replay state',
      'Fates action',
      'Fates request / correlation',
      'Authenticated workload identity',
      'Effect semantics',
      'Fates resource reads',
      'Fates disclosure',
      'Host document reads',
      'Provenance',
    ]) {
      expect(inspectionHtml).toContain(label);
    }

    for (const label of [
      'Destination',
      'Source digest',
      'Fates publication attempts',
      'Fates publication',
      'Host execution',
      'Host executor calls',
      'Approval decision / audit',
      'Approval operator',
    ]) {
      expect(publicationHtml).toContain(label);
    }
  });
});

function renderPublication(result: PublicationResult): string {
  return renderToStaticMarkup(
    createElement(PublicationResultView, {
      result,
      approvalBusy: false,
      operatorProof: '',
      onOperatorProofChange: vi.fn(),
      onApprovalDecision: vi.fn(),
    }),
  );
}

function approvalRequiredResult(): PublicationResult {
  return {
    request: publicationRequest,
    outcome: {
      requestId: publicationRequest.requestId,
      outcomeId: 'publication-pending-outcome-001',
      status: 'REQUIRES_APPROVAL',
      approvalBinding: { bindingId: 'pending-binding-001' },
      evidence: {
        ...publicationEvidence,
        policyDecision: 'REQUIRE_APPROVAL',
        replayState: 'NOT_ISSUED',
      },
    },
    phases: [
      { name: 'REQUESTED', source: 'local-observed' },
      { name: 'FATES GOVERNANCE', source: 'fates-authoritative' },
      { name: 'APPROVAL REQUIRED', source: 'fates-authoritative' },
    ],
    approval: {
      approvalHandle: 'opaque-display-handle-001',
      state: 'WAITING_FOR_APPROVAL',
      expiresAt: '2026-08-27T00:00:30.000Z',
    },
    publication: {
      state: 'NOT_PUBLISHED',
      evidenceMode: 'AUTHORITATIVE',
      reasonCode: 'APPROVAL_REQUIRED',
      destinationId: 'moirae.demo-publication-slot.v1',
    },
  };
}

function deniedResult(): PublicationResult {
  return {
    request: { ...publicationRequest, caller: { kind: 'agent', id: 'restricted-agent' } },
    outcome: {
      requestId: publicationRequest.requestId,
      outcomeId: 'publication-denied-outcome-001',
      status: 'DENIED',
      reasonCode: 'POLICY_DENIED',
      evidence: {
        ...publicationEvidence,
        policyDecision: 'DENY',
        policyReason: 'Restricted caller lacks publication scope',
        authenticatedWorkloadIdentity: {
          authenticatedPrincipalId: 'moirae-console-host',
          actingPrincipalId: 'restricted-agent',
        },
      },
    },
    phases: [
      { name: 'REQUESTED', source: 'local-observed' },
      { name: 'DENIED', source: 'fates-authoritative' },
      { name: 'NOT EXECUTED', source: 'host-executed' },
    ],
    publication: {
      state: 'NOT_PUBLISHED',
      evidenceMode: 'AUTHORITATIVE',
      reasonCode: 'POLICY_DENIED',
      destinationId: 'moirae.demo-publication-slot.v1',
      hostPublicationExecutorInvocationCount: 0,
    },
  };
}

function alreadyPublishedResult(): PublicationResult {
  return {
    request: publicationRequest,
    outcome: {
      requestId: publicationRequest.requestId,
      outcomeId: 'publication-outcome-001',
      status: 'ALLOWED',
      evidence: publicationEvidence,
    },
    phases: [
      { name: 'REQUESTED', source: 'local-observed' },
      { name: 'APPROVED', source: 'fates-authoritative' },
      { name: 'ALLOWED', source: 'fates-authoritative' },
      { name: 'HOST EXECUTION', source: 'host-executed' },
      { name: 'PUBLISHED', source: 'host-executed' },
    ],
    approval: {
      approvalHandle: 'terminal-display-handle-001',
      state: 'APPROVED',
      decisionId: 'approval-decision-001',
      auditId: 'approval-audit-001',
      operatorId: 'demo-operator',
    },
    publication: {
      state: 'PUBLISHED',
      evidenceMode: 'AUTHORITATIVE',
      destinationId: 'moirae.demo-publication-slot.v1',
      hostPublicationState: 'ALREADY_PUBLISHED',
      hostPublicationExecutorInvocationCount: 1,
    },
  };
}
