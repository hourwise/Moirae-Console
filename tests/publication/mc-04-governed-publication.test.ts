import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GovernanceOutcome, GovernedRequest } from '../../src/fates/types';
import { FixedDemoDocumentSource } from '../../server/document-source';
import {
  AnankePublicationFatesTransport,
  ANANKE_PUBLICATION_EXECUTION_TOKEN_ENV,
} from '../../server/ananke-publication-transport';
import {
  calculateMoiraePublicationAuthorityReceiptDigest,
  calculateMoiraePublicationAuthorityBindingDigest,
  calculateMoiraePublicationRequestDigest,
  MOIRAE_PUBLICATION_AUTHORITY_BINDING,
  MOIRAE_PUBLICATION_DESTINATION_ID,
  MOIRAE_PUBLICATION_FATES_ACTION,
  MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
  MOIRAE_PUBLICATION_FATES_PURPOSE,
} from '../../server/moirae-publication-authority';
import { InMemoryAuthorityConsumptionStore } from '../../server/authority-consumption';
import {
  FixedFilePublicationStore,
  type PublicationStore,
  type PublicationStoreInput,
  type PublicationWriteResult,
} from '../../server/publication-store';
import { PublishDocumentService } from '../../server/publish-document';
import { setNoStoreResponseHeaders } from '../../server/http-response';
import { PUBLISH_DOCUMENT_ACTION, PUBLISH_DOCUMENT_TOOL } from '../../src/webmcp/publish-document';
import { INSPECT_DOCUMENT_TOOL } from '../../src/webmcp/inspect-document';
import { WEBMCP_TOOLS } from '../../src/webmcp/tools';
import { createWebMcpAdapter } from '../../src/webmcp/adapter';
import type { WebMcpInvocation } from '../../src/webmcp/types';

const request: GovernedRequest = {
  requestId: 'mc04-request-001',
  caller: { kind: 'browser', id: 'mc04-browser', sessionId: 'mc04-session' },
  action: PUBLISH_DOCUMENT_ACTION,
  parameters: { documentId: 'demo-policy-001' },
  context: { source: 'webmcp', purpose: 'mc-04-demonstration' },
};

const invocation: WebMcpInvocation = {
  requestId: request.requestId,
  toolName: PUBLISH_DOCUMENT_ACTION,
  arguments: { documentId: 'demo-policy-001' },
  caller: request.caller,
  context: request.context,
};

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

class CountingPublicationStore implements PublicationStore {
  public calls: PublicationStoreInput[] = [];

  public async publish(input: PublicationStoreInput): Promise<PublicationWriteResult> {
    this.calls.push(input);
    return {
      state: 'PUBLISHED',
      documentId: input.documentId,
      destinationId: input.destinationId,
      sha256: sha256(input.bytes),
      publishedAt: new Date(0).toISOString(),
      executorInvocationCount: this.calls.length,
    };
  }

  public async status() {
    return {
      published: this.calls.length > 0,
      documentId: 'demo-policy-001',
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      ...(this.calls[0] ? { sha256: sha256(this.calls[0].bytes) } : {}),
      executorInvocationCount: this.calls.length,
    };
  }
}

function authoritativeOutcome(
  requestId = request.requestId,
  patch: Record<string, unknown> = {},
): GovernanceOutcome {
  const issuedAt = new Date(Date.now() - 100).toISOString();
  const expiresAt = new Date(Date.now() + 4_900).toISOString();
  const evidence = {
    evidenceId: 'fates-publication-evidence-001',
    source: 'fates' as const,
    authority: 'authoritative' as const,
    canonicalAction: MOIRAE_PUBLICATION_FATES_ACTION,
    documentId: 'demo-policy-001',
    expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
    destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
    purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
    fatesRequestId: requestId,
    correlationId: requestId,
    canonicalRequestDigest: calculateMoiraePublicationRequestDigest({
      documentId: 'demo-policy-001',
      expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
    }),
    authorityBindingDigest: calculateMoiraePublicationAuthorityBindingDigest({
      requestId,
      policyVersion: 'builtin:0.1.0',
    }),
    authorityReceiptDigest: '',
    issuedAt,
    expiresAt,
    receiptId: 'publication-receipt-001',
    nonce: 'publication-nonce-001',
    replayKeyDigest: calculateMoiraePublicationAuthorityBindingDigest({
      requestId,
      policyVersion: 'builtin:0.1.0',
    }),
    replayState: 'CONSUMED_ONCE',
    decisionId: 'publication-decision-001',
    outcomeId: 'publication-outcome-001',
    auditId: 'publication-outcome-001',
    auditReference: { auditId: 'publication-outcome-001', sourceRuntime: 'ananke' },
    outcomeState: 'COMPLETED',
    policyVersion: 'builtin:0.1.0',
    policyDecision: 'ALLOW',
    effectSemantics: 'AUTHORIZATION_ONLY_NO_PUBLICATION',
    fatesResourceReadAttemptCount: 0,
    fatesPublicationAttemptCount: 0,
    documentPublicationByFates: false,
    authenticatedWorkloadIdentity: {
      authenticatedPrincipalId: 'moirae-console-host',
      actingPrincipalId: 'moirae-document-publication-agent',
    },
    transportBinding: {
      ...MOIRAE_PUBLICATION_AUTHORITY_BINDING,
      correlationId: requestId,
    },
  };

  evidence.authorityReceiptDigest = calculateMoiraePublicationAuthorityReceiptDigest({
    documentId: evidence.documentId,
    expectedSha256: evidence.expectedSha256,
    destinationId: evidence.destinationId,
    purpose: evidence.purpose,
    fatesRequestId: evidence.fatesRequestId,
    correlationId: evidence.correlationId,
    canonicalRequestDigest: evidence.canonicalRequestDigest,
    authorityBindingDigest: evidence.authorityBindingDigest,
    policyVersion: evidence.policyVersion,
    decisionId: evidence.decisionId,
    outcomeId: evidence.outcomeId,
    issuedAt,
    expiresAt,
    receiptId: evidence.receiptId,
    nonce: evidence.nonce,
  });

  return {
    requestId,
    outcomeId: evidence.outcomeId,
    status: 'ALLOWED',
    evidence: { ...evidence, ...patch } as GovernanceOutcome['evidence'],
  };
}

function service(options: Partial<ConstructorParameters<typeof PublishDocumentService>[0]> = {}) {
  return new PublishDocumentService({
    mode: 'production',
    documentSource: new FixedDemoDocumentSource(),
    consumptionStore: new InMemoryAuthorityConsumptionStore(),
    publicationStore: new CountingPublicationStore(),
    ...options,
  });
}

describe('MC-04 governed publication', () => {
  it('MC-04-T01 exposes publish_document as the second and only new WebMCP tool', () => {
    expect(WEBMCP_TOOLS.map((tool) => tool.name)).toEqual([
      'inspect_document',
      PUBLISH_DOCUMENT_ACTION,
    ]);
    expect(PUBLISH_DOCUMENT_TOOL.inputSchema).toMatchObject({
      required: ['documentId'],
      additionalProperties: false,
    });
    expect(INSPECT_DOCUMENT_TOOL.name).toBe('inspect_document');
  });

  it('MC-04-T02 discovery is metadata-only and performs no Fates call or mutation', async () => {
    const govern = vi.fn(async () => authoritativeOutcome());
    const adapter = createWebMcpAdapter({ client: { govern }, tools: [PUBLISH_DOCUMENT_TOOL] });
    expect(adapter.discover()).toEqual([PUBLISH_DOCUMENT_TOOL]);
    expect(govern).not.toHaveBeenCalled();
    expect(JSON.stringify(adapter.discover())).not.toContain('f00d46e0');
  });

  it('MC-04-T03 sends the exact host-injected canonical request to Ananke', async () => {
    const fetchImplementation = vi.fn(async (...args: [string, RequestInit]) => {
      void args;
      return new Response(JSON.stringify({ outcome: { state: 'COMPLETED' }, evidence: {} }), {
        status: 200,
      });
    });
    const transport = new AnankePublicationFatesTransport({
      endpoint: 'http://127.0.0.1:3000/api/execute',
      token: 'host-publication-token',
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    await transport.send(request);
    const call = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body).toEqual({
      toolName: MOIRAE_PUBLICATION_FATES_ACTION,
      arguments: {
        documentId: 'demo-policy-001',
        expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      },
      purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
    });
    expect(JSON.stringify(body)).not.toContain('host-publication-token');
  });

  it('MC-04-T04 real-shaped fresh ALLOW permits one bounded publication', async () => {
    const store = new CountingPublicationStore();
    const result = await service({ publicationStore: store }).publish(
      request,
      authoritativeOutcome(),
    );
    expect(result.publication).toMatchObject({
      state: 'PUBLISHED',
      hostPublicationState: 'PUBLISHED',
    });
    expect(store.calls).toHaveLength(1);
  });

  it('MC-04-T05 publishes exactly the bytes that were hashed', async () => {
    const store = new CountingPublicationStore();
    const result = await service({ publicationStore: store }).publish(
      request,
      authoritativeOutcome(),
    );
    const fixture = await new FixedDemoDocumentSource().read('demo-policy-001');
    expect(result.publication.state).toBe('PUBLISHED');
    expect(store.calls[0]?.bytes).toEqual(fixture.bytes);
  });

  it('MC-04-T06 final fixed-store digest equals the authorized SHA-256', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mc04-publication-'));
    tempRoots.push(root);
    const store = new FixedFilePublicationStore({ rootPath: root });
    await service({ publicationStore: store }).publish(request, authoritativeOutcome());
    expect((await store.status()).sha256).toBe(MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256);
  });

  it.each([
    ['MC-04-T07', { status: 'DENIED', reasonCode: 'POLICY_DENIED' }],
    ['MC-04-T08', { status: 'REQUIRES_APPROVAL' }],
    ['MC-04-T09', { status: 'FAILED', errorCode: 'UNKNOWN_FAILURE', retryable: false }],
    ['MC-04-T09-UNKNOWN', { status: 'UNKNOWN', reasonCode: 'MALFORMED_FATES_RESPONSE' }],
  ])('%s non-allow outcome performs zero publication', async (_id, patch) => {
    const store = new CountingPublicationStore();
    const base = authoritativeOutcome();
    const outcome =
      patch.status === 'REQUIRES_APPROVAL'
        ? {
            ...base,
            status: 'REQUIRES_APPROVAL' as const,
            approvalBinding: { bindingId: 'approval-001' },
          }
        : patch.status === 'DENIED'
          ? { ...base, status: 'DENIED' as const, reasonCode: 'POLICY_DENIED' }
          : patch.status === 'FAILED'
            ? { ...base, status: 'FAILED' as const, errorCode: 'UNKNOWN_FAILURE', retryable: false }
            : { ...base, status: 'UNKNOWN' as const, reasonCode: 'MALFORMED_FATES_RESPONSE' };
    const result = await service({ publicationStore: store }).publish(request, outcome);
    expect(result.publication.state).toBe('NOT_PUBLISHED');
    expect(store.calls).toHaveLength(0);
  });

  it('MC-04-T10 stale authority performs zero publication', async () => {
    const store = new CountingPublicationStore();
    const stale = authoritativeOutcome();
    const result = await service({
      publicationStore: store,
      now: () => Date.now() + 20_000,
    }).publish(request, stale);
    expect(result.publication).toMatchObject({
      state: 'NOT_PUBLISHED',
      reasonCode: 'STALE_AUTHORITY',
    });
    expect(store.calls).toHaveLength(0);
  });

  it('MC-04-T11 and T12 replay/consumed receipt prevents the second effect', async () => {
    const store = new CountingPublicationStore();
    const consumptionStore = new InMemoryAuthorityConsumptionStore();
    const first = await service({ publicationStore: store, consumptionStore }).publish(
      request,
      authoritativeOutcome(),
    );
    const replay = await service({ publicationStore: store, consumptionStore }).publish(
      request,
      authoritativeOutcome(),
    );
    expect(first.publication.state).toBe('PUBLISHED');
    expect(replay.publication).toMatchObject({
      state: 'NOT_PUBLISHED',
      reasonCode: 'REPLAY_REJECTED',
    });
    expect(store.calls).toHaveLength(1);
  });

  it.each([
    ['MC-04-T13', { canonicalAction: 'fates.moirae.inspect-document.v1' }],
    ['MC-04-T14', { canonicalAction: 'fates.slice02.inspect-fixed-fixture.v1' }],
    ['MC-04-T16', { expectedSha256: '0'.repeat(64) }],
    ['MC-04-T17', { destinationId: 'other-destination' }],
    ['MC-04-T18', { purpose: 'moirae.document-inspection' }],
    ['MC-04-T26', { source: 'synthetic-test', authority: 'synthetic' }],
  ])('%s rejects substituted or synthetic authority', async (_id, patch) => {
    const store = new CountingPublicationStore();
    const result = await service({ publicationStore: store }).publish(
      request,
      authoritativeOutcome(request.requestId, patch),
    );
    expect(result.publication.state).toBe('NOT_PUBLISHED');
    expect(store.calls).toHaveLength(0);
  });

  it('MC-04-T15 rejects a different source document request', async () => {
    const store = new CountingPublicationStore();
    const result = await service({ publicationStore: store }).publish(
      { ...request, parameters: { documentId: 'other-document' } },
      authoritativeOutcome(),
    );
    expect(result.publication.state).toBe('NOT_PUBLISHED');
    expect(store.calls).toHaveLength(0);
  });

  it('MC-04-T19 changed source bytes fail closed before the mutation', async () => {
    const store = new CountingPublicationStore();
    const result = await service({
      publicationStore: store,
      documentSource: {
        read: async () => ({
          documentId: 'demo-policy-001',
          bytes: new TextEncoder().encode('changed'),
          content: 'changed',
        }),
      },
    }).publish(request, authoritativeOutcome());
    expect(result.publication).toMatchObject({
      state: 'NOT_PUBLISHED',
      reasonCode: 'DOCUMENT_DIGEST_MISMATCH',
    });
    expect(store.calls).toHaveLength(0);
  });

  it('MC-04-T20/T21/T23 browser input cannot choose destination, digest, or purpose', async () => {
    const fetchImplementation = vi.fn(async () => new Response('{}', { status: 200 }));
    const transport = new AnankePublicationFatesTransport({
      endpoint: 'http://127.0.0.1:3000/api/execute',
      token: 'secret-not-browser',
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    await transport.send(request);
    const call = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.arguments.destinationId).toBe(MOIRAE_PUBLICATION_DESTINATION_ID);
    expect(body.arguments.expectedSha256).toBe(MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256);
    expect(body.purpose).toBe(MOIRAE_PUBLICATION_FATES_PURPOSE);
    expect(PUBLISH_DOCUMENT_TOOL.inputSchema).not.toHaveProperty('properties.expectedSha256');
    await expect(
      transport.send({
        ...request,
        parameters: { documentId: 'demo-policy-001', destinationId: 'attacker' },
      }),
    ).rejects.toThrow('MOIRAE_CONSOLE_PUBLICATION_REQUEST_BINDING_MISMATCH');
  });

  it('MC-04-T22 rejects a browser attempt to choose the canonical action', async () => {
    const transport = new AnankePublicationFatesTransport({
      endpoint: 'http://127.0.0.1:3000/api/execute',
      token: 'host-token',
      fetchImplementation: vi.fn() as unknown as typeof fetch,
    });
    await expect(transport.send({ ...request, action: 'other_action' })).rejects.toThrow(
      'MOIRAE_CONSOLE_PUBLICATION_REQUEST_BINDING_MISMATCH',
    );
  });

  it('MC-04-T24 does not expose the publication credential to browser metadata', () => {
    expect(JSON.stringify(PUBLISH_DOCUMENT_TOOL)).not.toContain(
      ANANKE_PUBLICATION_EXECUTION_TOKEN_ENV,
    );
    expect(JSON.stringify(PUBLISH_DOCUMENT_TOOL)).not.toContain('Bearer');
  });

  it('MC-04-T25 has no direct browser publication-store method or arbitrary target input', () => {
    expect(Object.keys(PUBLISH_DOCUMENT_TOOL.inputSchema.properties ?? {})).toEqual(['documentId']);
    expect(JSON.stringify(PUBLISH_DOCUMENT_TOOL)).not.toContain('publicationPath');
    expect(JSON.stringify(PUBLISH_DOCUMENT_TOOL)).not.toContain('destinationId');
  });

  it('MC-04-T27 atomic failure leaves no final partial destination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mc04-atomic-'));
    tempRoots.push(root);
    const fixture = await new FixedDemoDocumentSource().read('demo-policy-001');
    const store = new FixedFilePublicationStore({
      rootPath: root,
      beforeRename: () => {
        throw new Error('INJECTED_BEFORE_RENAME');
      },
    });
    await expect(
      store.publish({
        documentId: 'demo-policy-001',
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
        bytes: fixture.bytes!,
        expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
      }),
    ).rejects.toThrow('INJECTED_BEFORE_RENAME');
    expect((await store.status()).published).toBe(false);
  });

  it('MC-04-T28 safe retry is idempotent for the same document/digest/destination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mc04-retry-'));
    tempRoots.push(root);
    const store = new FixedFilePublicationStore({ rootPath: root });
    const first = await service({ publicationStore: store }).publish(
      request,
      authoritativeOutcome(),
    );
    const second = await service({ publicationStore: store }).publish(
      { ...request, requestId: 'mc04-retry-request-002' },
      authoritativeOutcome('mc04-retry-request-002'),
    );
    expect(first.publication.hostPublicationState).toBe('PUBLISHED');
    expect(second.publication.hostPublicationState).toBe('ALREADY_PUBLISHED');
    expect((await store.status()).sha256).toBe(MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256);
  });

  it('MC-04-T29 crash simulation recovers without inconsistent final bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mc04-crash-'));
    tempRoots.push(root);
    const fixture = await new FixedDemoDocumentSource().read('demo-policy-001');
    const failing = new FixedFilePublicationStore({
      rootPath: root,
      beforeRename: () => {
        throw new Error('CRASH_BEFORE_RENAME');
      },
    });
    await expect(
      failing.publish({
        documentId: 'demo-policy-001',
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
        bytes: fixture.bytes!,
        expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
      }),
    ).rejects.toThrow('CRASH_BEFORE_RENAME');
    const recovered = new FixedFilePublicationStore({ rootPath: root });
    expect((await recovered.status()).published).toBe(false);
  });

  it('MC-04-T30 leaves inspect_document’s descriptor unchanged', () => {
    expect(INSPECT_DOCUMENT_TOOL.inputSchema).toEqual({
      type: 'object',
      properties: { documentId: { type: 'string', const: 'demo-policy-001' } },
      required: ['documentId'],
      additionalProperties: false,
    });
  });

  it('MC-04-T34 governed mutation responses use no-store semantics', () => {
    const headers = new Map<string, string>();
    setNoStoreResponseHeaders({ setHeader: (name, value) => headers.set(name, value) });
    expect(headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(headers.get('Pragma')).toBe('no-cache');
  });

  it('MC-04-T35 does not place authority or credential material in URLs', () => {
    expect(JSON.stringify(PUBLISH_DOCUMENT_TOOL)).not.toContain('receipt');
    expect(JSON.stringify(PUBLISH_DOCUMENT_TOOL)).not.toContain('token');
    expect(JSON.stringify(invocation)).not.toContain('Bearer');
    expect(JSON.stringify(invocation)).not.toContain('f00d46e0');
  });

  it('MC-04 negative control: consumed authority reaches the replay detector and skips the executor', async () => {
    const store = new CountingPublicationStore();
    const consumptionStore = new InMemoryAuthorityConsumptionStore();
    const first = await service({ publicationStore: store, consumptionStore }).publish(
      request,
      authoritativeOutcome(),
    );
    const second = await service({ publicationStore: store, consumptionStore }).publish(
      request,
      authoritativeOutcome(),
    );
    expect(first.publication.state).toBe('PUBLISHED');
    expect(second.publication.reasonCode).toBe('REPLAY_REJECTED');
    expect(store.calls).toHaveLength(1);
  });

  it('MC-04 host mutation snapshot cannot be changed by the caller after admission', async () => {
    const store = new CountingPublicationStore();
    const mutableRequest = { ...request, parameters: { documentId: 'demo-policy-001' } };
    const pending = service({ publicationStore: store }).publish(
      mutableRequest,
      authoritativeOutcome(),
    );
    mutableRequest.parameters.documentId = 'other-document';
    const result = await pending;
    expect(result.publication.state).toBe('PUBLISHED');
    expect(store.calls[0]?.documentId).toBe('demo-policy-001');
  });

  it('MC-04 production mode has no synthetic authorization fallback', async () => {
    const store = new CountingPublicationStore();
    const result = await service({ publicationStore: store }).publish(request, {
      ...authoritativeOutcome(),
      evidence: {
        ...authoritativeOutcome().evidence,
        source: 'synthetic-test',
        authority: 'synthetic',
      },
    });
    expect(result.publication.state).toBe('NOT_PUBLISHED');
    expect(store.calls).toHaveLength(0);
  });

  it.each([
    ['action', { canonicalAction: 'fates.other.action.v1' }],
    ['documentId', { documentId: 'other-document' }],
    ['expectedSha256', { expectedSha256: '0'.repeat(64) }],
    ['destinationId', { destinationId: 'other-destination' }],
    ['purpose', { purpose: 'other-purpose' }],
    ['fatesRequestId', { fatesRequestId: 'other-request' }],
    ['correlationId', { correlationId: 'other-correlation' }],
    ['canonicalRequestDigest', { canonicalRequestDigest: '0'.repeat(64) }],
    ['authorityBindingDigest', { authorityBindingDigest: '0'.repeat(64) }],
    ['decisionId', { decisionId: 'other-decision' }],
    ['outcomeId', { outcomeId: 'other-outcome' }],
    ['auditId', { auditId: 'other-audit' }],
  ])('MC-09 F-04 authoritative %s substitution fails closed', async (_field, patch) => {
    const store = new CountingPublicationStore();
    const result = await service({ publicationStore: store }).publish(
      request,
      authoritativeOutcome(request.requestId, patch),
    );
    expect(result.publication.state).toBe('NOT_PUBLISHED');
    expect(store.calls).toHaveLength(0);
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
