import { describe, expect, it } from 'vitest';
import type {
  FatesClient,
  FatesTransportResponse,
} from '../../src/fates/client';
import type { GovernanceOutcome, GovernedRequest } from '../../src/fates/types';
import { calculateMoiraePublicationAuthorityReceiptDigest, calculateMoiraePublicationRequestDigest, MOIRAE_PUBLICATION_AUTHORITY_BINDING, MOIRAE_PUBLICATION_DESTINATION_ID, MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256, MOIRAE_PUBLICATION_FATES_PURPOSE, MOIRAE_PUBLICATION_FATES_ACTION } from '../../server/moirae-publication-authority';
import { PublishDocumentHttpHandler } from '../../server/http-handler';
import type { PublicationStore, PublicationStoreInput, PublicationWriteResult } from '../../server/publication-store';
import type { AnankePublicationApprovalTransport, AnankeApprovalTransition } from '../../server/ananke-publication-transport';

const request: GovernedRequest = {
  requestId: 'mc05-console-request-001',
  caller: { kind: 'browser', id: 'mc05-browser', sessionId: 'mc05-session' },
  action: 'publish_document',
  parameters: { documentId: 'demo-policy-001' },
  context: { source: 'webmcp', purpose: 'mc-05-demonstration' },
};

const pendingOutcome: GovernanceOutcome = {
  requestId: request.requestId,
  outcomeId: 'mc05-pending-outcome-001',
  status: 'REQUIRES_APPROVAL',
  approvalBinding: { bindingId: 'mc05-approval-001', freshnessUntil: '2099-01-01T00:00:30.000Z' },
  evidence: {
    evidenceId: 'mc05-pending-evidence-001',
    source: 'fates',
    authority: 'authoritative',
    canonicalAction: MOIRAE_PUBLICATION_FATES_ACTION,
    documentId: 'demo-policy-001',
    expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
    destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
    purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
    fatesRequestId: request.requestId,
    correlationId: request.requestId,
    canonicalRequestDigest: 'a'.repeat(64),
    authorityBindingDigest: 'b'.repeat(64),
    policyDecision: 'REQUIRE_APPROVAL',
    approvalRequestId: 'mc05-approval-001',
    approvalState: 'WAITING_FOR_APPROVAL',
    issuedAt: '2099-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:30.000Z',
  },
};

class CountingStore implements PublicationStore {
  public calls: PublicationStoreInput[] = [];

  public async publish(input: PublicationStoreInput): Promise<PublicationWriteResult> {
    this.calls.push(input);
    return {
      state: 'PUBLISHED',
      documentId: input.documentId,
      destinationId: input.destinationId,
      sha256: input.expectedSha256,
      publishedAt: new Date(0).toISOString(),
      executorInvocationCount: this.calls.length,
    };
  }

  public async status() {
    return {
      published: this.calls.length > 0,
      documentId: 'demo-policy-001',
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      executorInvocationCount: this.calls.length,
    };
  }
}

class FakeApprovalTransport implements AnankePublicationApprovalTransport {
  public executeRequests: GovernedRequest[] = [];
  public approvalRequests: GovernedRequest[] = [];

  public constructor(private readonly finalResponse: FatesTransportResponse) {}

  public async approve(requestValue: GovernedRequest, approvalRequestId: string): Promise<AnankeApprovalTransition> {
    this.approvalRequests.push(requestValue);
    return {
      approvalRequestId,
      approvalState: 'APPROVED',
      decisionId: 'mc05-approval-decision-001',
      auditId: 'mc05-approval-audit-001',
      operatorId: 'moirae-demo-operator',
    };
  }

  public async reject(requestValue: GovernedRequest, approvalRequestId: string): Promise<AnankeApprovalTransition> {
    this.approvalRequests.push(requestValue);
    return {
      approvalRequestId,
      approvalState: 'REJECTED',
      decisionId: 'mc05-rejection-decision-001',
      auditId: 'mc05-rejection-audit-001',
      operatorId: 'moirae-demo-operator',
    };
  }

  public async executeApproved(requestValue: GovernedRequest): Promise<FatesTransportResponse> {
    this.executeRequests.push(requestValue);
    if (this.executeRequests.length === 1) return this.finalResponse;
    const response = this.finalResponse.response;
    if (typeof response !== 'object' || response === null || Array.isArray(response)) {
      throw new Error('MC05_TEST_RESPONSE_INVALID');
    }
    return {
      ...this.finalResponse,
      response: {
        ...response,
        outcome: { state: 'APPROVAL_INVALIDATED', reasonCode: 'APPROVAL_ALREADY_CONSUMED' },
      },
    };
  }
}

function allowedResponse(): FatesTransportResponse {
  const issuedAt = new Date(Date.now() - 100).toISOString();
  const expiresAt = new Date(Date.now() + 4_900).toISOString();
  const authorityBindingDigest = 'b'.repeat(64);
  const canonicalRequestDigest = calculateMoiraePublicationRequestDigest({
    documentId: 'demo-policy-001',
    expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
    destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
  });
  const authorityReceiptDigest = calculateMoiraePublicationAuthorityReceiptDigest({
    documentId: 'demo-policy-001',
    expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
    destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
    purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
    fatesRequestId: request.requestId,
    correlationId: request.requestId,
    canonicalRequestDigest,
    authorityBindingDigest,
    policyVersion: 'builtin:0.1.0',
    decisionId: 'mc05-decision-001',
    outcomeId: 'mc05-outcome-001',
    issuedAt,
    expiresAt,
    receiptId: 'mc05-receipt-001',
    nonce: 'mc05-nonce-001',
  });
  return {
    response: {
      outcome: { state: 'COMPLETED' },
      evidence: {
        action: MOIRAE_PUBLICATION_FATES_ACTION,
        documentId: 'demo-policy-001',
        expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
        purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
        requestId: request.requestId,
        correlationId: request.requestId,
        canonicalRequestDigest,
        authorityBindingDigest,
        authorityReceiptDigest,
        issuedAt,
        expiresAt,
        receiptId: 'mc05-receipt-001',
        nonce: 'mc05-nonce-001',
        replayKeyDigest: authorityBindingDigest,
        replayState: 'CONSUMED_ONCE',
        decisionId: 'mc05-decision-001',
        outcomeId: 'mc05-outcome-001',
        auditId: 'mc05-audit-001',
        policyVersion: 'builtin:0.1.0',
        policyDecision: 'ALLOW',
        authorizationDecision: 'ALLOW',
        effectSemantics: 'AUTHORIZATION_ONLY_NO_PUBLICATION',
        fatesResourceReadAttemptCount: 0,
        fatesPublicationAttemptCount: 0,
        documentPublicationByFates: false,
        authenticatedWorkloadIdentity: {
          authenticatedPrincipalId: 'moirae-console-host',
          actingPrincipalId: 'moirae-document-publication-agent',
        },
      },
    },
    binding: {
      ...MOIRAE_PUBLICATION_AUTHORITY_BINDING,
      correlationId: request.requestId,
    },
  };
}

function handler(transport: FakeApprovalTransport, store: CountingStore) {
  const client: FatesClient = { govern: async () => pendingOutcome };
  return new PublishDocumentHttpHandler(client, store, transport);
}

describe('MC-05 Console human approval boundary', () => {
  it('MC-05-T01/T02/T05 keeps REQUIRES_APPROVAL authoritative and performs no local upgrade', async () => {
    const store = new CountingStore();
    const transport = new FakeApprovalTransport(allowedResponse());
    const service = handler(transport, store);
    const result = await service.handle({
      requestId: request.requestId,
      toolName: request.action,
      arguments: request.parameters,
      caller: request.caller,
      context: request.context,
    });

    expect(result).toMatchObject({
      outcome: { status: 'REQUIRES_APPROVAL' },
      approval: { approvalRequestId: 'mc05-approval-001', state: 'WAITING_FOR_APPROVAL' },
      publication: { state: 'NOT_PUBLISHED' },
    });
    expect(store.calls).toHaveLength(0);
    expect(transport.executeRequests).toHaveLength(0);
  });

  it('MC-05-T04/T17 rejects browser parameter or expiry injection in the approval body', async () => {
    const store = new CountingStore();
    const transport = new FakeApprovalTransport(allowedResponse());
    const service = handler(transport, store);
    await service.handle({
      requestId: request.requestId,
      toolName: request.action,
      arguments: request.parameters,
      caller: request.caller,
      context: request.context,
    });

    const malformed = await service.decideApproval({
      approvalRequestId: 'mc05-approval-001',
      decision: 'APPROVE',
      documentId: 'other-document',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    expect(malformed).toEqual({ error: 'BAD_REQUEST', reasonCode: 'INVALID_APPROVAL_DECISION' });
    expect(transport.approvalRequests).toHaveLength(0);
    expect(store.calls).toHaveLength(0);
  });

  it('MC-05-T08/T10/T26 uses the same governed request and the replay detector blocks a second effect', async () => {
    const store = new CountingStore();
    const transport = new FakeApprovalTransport(allowedResponse());
    const service = handler(transport, store);
    await service.handle({
      requestId: request.requestId,
      toolName: request.action,
      arguments: request.parameters,
      caller: request.caller,
      context: request.context,
    });
    const published = await service.decideApproval({
      approvalRequestId: 'mc05-approval-001',
      decision: 'APPROVE',
    });

    expect(published).toMatchObject({
      approval: { state: 'APPROVED', operatorId: 'moirae-demo-operator' },
      publication: { state: 'PUBLISHED' },
    });
    expect(transport.approvalRequests[0]).toEqual(request);
    expect(transport.executeRequests[0]).toEqual(request);
    expect(store.calls).toHaveLength(1);

    const replay = await service.decideApproval({
      approvalRequestId: 'mc05-approval-001',
      decision: 'APPROVE',
    });
    expect(replay).toMatchObject({
      approval: { state: 'APPROVED' },
      publication: { state: 'NOT_PUBLISHED', reasonCode: 'REPLAY_REJECTED' },
    });
    expect(transport.executeRequests).toHaveLength(2);
    expect(store.calls).toHaveLength(1);
  });

  it('MC-05-T12/T13 creates no publication for an authoritative rejection', async () => {
    const store = new CountingStore();
    const transport = new FakeApprovalTransport(allowedResponse());
    const service = handler(transport, store);
    await service.handle({
      requestId: request.requestId,
      toolName: request.action,
      arguments: request.parameters,
      caller: request.caller,
      context: request.context,
    });
    const rejected = await service.decideApproval({
      approvalRequestId: 'mc05-approval-001',
      decision: 'REJECT',
    });

    expect(rejected).toMatchObject({
      approval: { state: 'REJECTED' },
      publication: { state: 'NOT_PUBLISHED' },
    });
    expect(store.calls).toHaveLength(0);
    expect(transport.executeRequests).toHaveLength(0);
  });
});
