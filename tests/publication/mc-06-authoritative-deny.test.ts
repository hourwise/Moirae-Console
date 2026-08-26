import { describe, expect, it, vi } from 'vitest';

import type { FatesClient, FatesTransportResponse } from '../../src/fates/client';
import type { GovernedRequest } from '../../src/fates/types';
import { WEBMCP_TOOLS } from '../../src/webmcp/tools';
import { PublishDocumentHttpHandler } from '../../server/http-handler';
import type { HostDocumentSource } from '../../server/document-source';
import type {
  PublicationStore,
  PublicationStatus,
  PublicationWriteResult,
} from '../../server/publication-store';

const ARGUMENTS = {
  documentId: 'demo-policy-001',
};

class CountingPublicationStore implements PublicationStore {
  public publishCount = 0;
  public published = false;

  public async publish(
    input: Parameters<PublicationStore['publish']>[0],
  ): Promise<PublicationWriteResult> {
    void input;
    this.publishCount += 1;
    this.published = true;
    return {
      state: 'PUBLISHED',
      documentId: 'demo-policy-001',
      destinationId: 'moirae.demo-publication-slot.v1',
      sha256: 'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c',
      publishedAt: new Date(0).toISOString(),
      executorInvocationCount: this.publishCount,
    };
  }

  public async status(): Promise<PublicationStatus> {
    return {
      published: this.published,
      documentId: 'demo-policy-001',
      destinationId: 'moirae.demo-publication-slot.v1',
      executorInvocationCount: this.publishCount,
    };
  }
}

function deniedTransport(calls: GovernedRequest[]): {
  sendRestricted(request: GovernedRequest): Promise<FatesTransportResponse>;
} {
  return {
    async sendRestricted(request) {
      calls.push(request);
      return {
        response: {
          outcome: {
            state: 'DENIED',
            reasonCode: 'POLICY_DENIED',
          },
          evidence: {
            outcomeId: 'mc06-deny-outcome-001',
            decisionId: 'mc06-deny-decision-001',
            auditId: 'mc06-deny-audit-001',
            action: 'fates.moirae.publish-document.v1',
            documentId: 'demo-policy-001',
            expectedSha256: 'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c',
            destinationId: 'moirae.demo-publication-slot.v1',
            purpose: 'moirae.document-publication',
            requestId: request.requestId,
            correlationId: request.requestId,
            canonicalRequestDigest: 'a'.repeat(64),
            authorityBindingDigest: 'b'.repeat(64),
            policyDecision: 'DENY',
            policyReasonCode: 'INSUFFICIENT_PUBLICATION_SCOPE',
            policyReason: 'The restricted demonstration agent has no publication scope.',
            effectSemantics: 'AUTHORIZATION_ONLY_NO_PUBLICATION',
            fatesResourceReadAttemptCount: 0,
            fatesPublicationAttemptCount: 0,
            documentPublicationByFates: false,
            authenticatedWorkloadIdentity: {
              authenticatedPrincipalId: 'moirae-restricted-host',
              actingPrincipalId: 'moirae-restricted-agent',
            },
          },
        },
        binding: {
          canonicalAction: 'fates.moirae.publish-document.v1',
          documentId: 'demo-policy-001',
          expectedSha256: 'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c',
          destinationId: 'moirae.demo-publication-slot.v1',
          purpose: 'moirae.document-publication',
          correlationId: request.requestId,
        },
      };
    },
  };
}

describe('MC-06 Console authoritative denial boundary', () => {
  it('MC-06-T01 keeps exactly the two existing WebMCP tools', () => {
    expect(WEBMCP_TOOLS.map((tool) => tool.name)).toEqual(['inspect_document', 'publish_document']);
    expect(WEBMCP_TOOLS.some((tool) => tool.name.includes('approve'))).toBe(false);
  });

  it('MC-06-T02/T03/T04/T05/T06/T07/T08 produces authoritative DENY with zero host effect', async () => {
    const calls: GovernedRequest[] = [];
    const store = new CountingPublicationStore();
    const sourceRead = vi.fn<HostDocumentSource['read']>();
    const client: FatesClient = { govern: vi.fn() };
    const handler = new PublishDocumentHttpHandler(
      client,
      store,
      undefined,
      deniedTransport(calls),
      { read: sourceRead },
    );

    const result = await handler.denyDemo();
    if ('error' in result) throw new Error(result.reasonCode);
    if (result.outcome.status !== 'DENIED') throw new Error('Expected authoritative DENY');

    expect(result.outcome.status).toBe('DENIED');
    expect(result.outcome.reasonCode).toBe('POLICY_DENIED');
    expect(result.outcome.evidence).toMatchObject({
      source: 'fates',
      authority: 'authoritative',
      canonicalAction: 'fates.moirae.publish-document.v1',
      documentId: 'demo-policy-001',
      expectedSha256: 'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c',
      destinationId: 'moirae.demo-publication-slot.v1',
      purpose: 'moirae.document-publication',
      policyDecision: 'DENY',
      policyReasonCode: 'INSUFFICIENT_PUBLICATION_SCOPE',
      effectSemantics: 'AUTHORIZATION_ONLY_NO_PUBLICATION',
      fatesResourceReadAttemptCount: 0,
      fatesPublicationAttemptCount: 0,
      documentPublicationByFates: false,
    });
    expect(result.phases.map((phase) => phase.name)).toContain('DENIED');
    expect(result.phases.map((phase) => phase.name)).toContain('NOT EXECUTED');
    expect(result.publication).toMatchObject({
      state: 'NOT_PUBLISHED',
      evidenceMode: 'AUTHORITATIVE',
      reasonCode: 'DENIED',
    });
    expect(result.approval).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      action: 'publish_document',
      parameters: ARGUMENTS,
      caller: {
        kind: 'agent',
        id: 'moirae-restricted-agent',
      },
      context: {
        source: 'webmcp',
        purpose: 'moirae.document-publication',
      },
    });
    expect(sourceRead).not.toHaveBeenCalled();
    expect(store.publishCount).toBe(0);
    expect(store.published).toBe(false);
    expect(JSON.stringify(result)).not.toContain('MC01-PROTECTED-DOCUMENT-CANARY-9f4c2d7a');
  });

  it('MC-06-T09/T10/T11/T12 rejects a local approval attempt after DENY', async () => {
    const store = new CountingPublicationStore();
    const handler = new PublishDocumentHttpHandler(
      { govern: vi.fn() },
      store,
      undefined,
      deniedTransport([]),
      undefined,
      'mc06-test-operator-proof',
    );

    const denied = await handler.denyDemo();
    if ('error' in denied) throw new Error(denied.reasonCode);
    const attemptedUpgrade = await handler.decideApproval({
      approvalHandle: `moirae_${crypto.randomUUID()}`,
      decision: 'APPROVE',
      operatorProof: 'mc06-test-operator-proof',
    });

    expect(attemptedUpgrade).toEqual({
      error: 'BAD_REQUEST',
      reasonCode: 'APPROVAL_NOT_FOUND_OR_EXPIRED',
    });
    expect(store.publishCount).toBe(0);
  });
});
