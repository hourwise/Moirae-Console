import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createMoiraeProductionServer } from '../../server/production-host';
import {
  calculateMoiraePublicationAuthorityBindingDigest,
  calculateMoiraePublicationAuthorityReceiptDigest,
  calculateMoiraePublicationRequestDigest,
  MOIRAE_PUBLICATION_AUTHORITY_BINDING,
  MOIRAE_PUBLICATION_DESTINATION_ID,
  MOIRAE_PUBLICATION_FATES_PURPOSE,
  MOIRAE_PUBLICATION_POLICY_VERSION,
} from '../../server/moirae-publication-authority';

const OPERATOR_PROOF = 'mc09-http-test-operator-proof';
const FATES_APPROVAL_ID = '11111111-1111-4111-8111-111111111111';
const TEST_ORIGIN = 'http://127.0.0.1';
const staticRoot = resolve('dist');
const temporaryRoots: string[] = [];

interface UpstreamControl {
  approvalStatus?: number;
  approvalState?: 'APPROVED' | 'REJECTED' | 'EXPIRED';
  approvalDelayMs?: number;
  malformedApprovalBody?: boolean;
  approvalCalls: number;
  executionCalls: number;
}

interface RunningConsole {
  readonly server: ReturnType<typeof createMoiraeProductionServer>;
  readonly port: number;
  readonly control: UpstreamControl;
  readonly close: () => Promise<void>;
}

interface HttpJson {
  readonly approval: {
    readonly approvalHandle: string;
    readonly approvalRequestId?: string;
    readonly state?: string;
  };
  readonly publication: { readonly state: string };
  readonly outcome: { readonly status: string };
  readonly reasonCode?: string;
  readonly [key: string]: unknown;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function pendingBody(requestId: string): Record<string, unknown> {
  const issuedAt = new Date(Date.now() - 100).toISOString();
  const expiresAt = new Date(Date.now() + 30_000).toISOString();
  return {
    outcome: { state: 'WAITING_FOR_APPROVAL', reasonCode: 'APPROVAL_REQUIRED' },
    approvalGrantId: FATES_APPROVAL_ID,
    evidence: {
      action: MOIRAE_PUBLICATION_AUTHORITY_BINDING.canonicalAction,
      documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
      expectedSha256: MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256,
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
      requestId,
      correlationId: requestId,
      canonicalRequestDigest: calculateMoiraePublicationRequestDigest({
        documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
        expectedSha256: MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256,
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      }),
      authorityBindingDigest: calculateMoiraePublicationAuthorityBindingDigest({
        requestId,
        policyVersion: MOIRAE_PUBLICATION_POLICY_VERSION,
      }),
      issuedAt,
      expiresAt,
      decisionId: '22222222-2222-4222-8222-222222222222',
      outcomeId: '33333333-3333-4333-8333-333333333333',
      auditId: '33333333-3333-4333-8333-333333333333',
      policyVersion: MOIRAE_PUBLICATION_POLICY_VERSION,
      policyDecision: 'REQUIRE_APPROVAL',
      approvalRequestId: FATES_APPROVAL_ID,
      approvalState: 'WAITING_FOR_APPROVAL',
      effectSemantics: 'AUTHORIZATION_ONLY_NO_PUBLICATION',
      fatesResourceReadAttemptCount: 0,
      fatesPublicationAttemptCount: 0,
      documentPublicationByFates: false,
      authenticatedWorkloadIdentity: {
        authenticatedPrincipalId: 'moirae-console-host',
        actingPrincipalId: 'moirae-document-publication-agent',
      },
    },
  };
}

function approvedBody(requestId: string): Record<string, unknown> {
  const issuedAt = new Date(Date.now() - 100).toISOString();
  const expiresAt = new Date(Date.now() + 4_900).toISOString();
  const canonicalRequestDigest = calculateMoiraePublicationRequestDigest({
    documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
    expectedSha256: MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256,
    destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
  });
  const authorityBindingDigest = calculateMoiraePublicationAuthorityBindingDigest({
    requestId,
    policyVersion: MOIRAE_PUBLICATION_POLICY_VERSION,
  });
  const decisionId = '44444444-4444-4444-8444-444444444444';
  const outcomeId = '55555555-5555-4555-8555-555555555555';
  const receiptId = '66666666-6666-4666-8666-666666666666';
  const nonce = '77777777-7777-4777-8777-777777777777';
  const authorityReceiptDigest = calculateMoiraePublicationAuthorityReceiptDigest({
    documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
    expectedSha256: MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256,
    destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
    purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
    fatesRequestId: requestId,
    correlationId: requestId,
    canonicalRequestDigest,
    authorityBindingDigest,
    policyVersion: MOIRAE_PUBLICATION_POLICY_VERSION,
    decisionId,
    outcomeId,
    issuedAt,
    expiresAt,
    receiptId,
    nonce,
  });
  return {
    outcome: { state: 'COMPLETED' },
    evidence: {
      action: MOIRAE_PUBLICATION_AUTHORITY_BINDING.canonicalAction,
      documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
      expectedSha256: MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256,
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
      requestId,
      correlationId: requestId,
      canonicalRequestDigest,
      authorityBindingDigest,
      authorityReceiptDigest,
      issuedAt,
      expiresAt,
      receiptId,
      nonce,
      replayKeyDigest: authorityBindingDigest,
      replayState: 'CONSUMED_ONCE',
      decisionId,
      outcomeId,
      auditId: outcomeId,
      auditReference: { auditId: outcomeId, sourceRuntime: 'ananke' },
      policyVersion: MOIRAE_PUBLICATION_POLICY_VERSION,
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
  };
}

function deniedBody(requestId: string): Record<string, unknown> {
  return {
    outcome: { state: 'DENIED', reasonCode: 'POLICY_DENIED' },
    evidence: {
      outcomeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      decisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      auditId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      action: MOIRAE_PUBLICATION_AUTHORITY_BINDING.canonicalAction,
      documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
      expectedSha256: MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256,
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
      requestId,
      correlationId: requestId,
      canonicalRequestDigest: calculateMoiraePublicationRequestDigest({
        documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
        expectedSha256: MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256,
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      }),
      authorityBindingDigest: calculateMoiraePublicationAuthorityBindingDigest({
        requestId,
        policyVersion: MOIRAE_PUBLICATION_POLICY_VERSION,
      }),
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
  };
}

function createFetch(control: UpstreamControl): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.includes('/api/approvals/')) {
      control.approvalCalls += 1;
      if (control.approvalDelayMs) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, control.approvalDelayMs));
      }
      if (control.malformedApprovalBody) {
        return new Response(JSON.stringify({ approvalState: 'APPROVED' }), { status: 200 });
      }
      const state = url.endsWith('/reject') ? 'REJECTED' : (control.approvalState ?? 'APPROVED');
      return new Response(
        JSON.stringify({
          approvalRequestId: FATES_APPROVAL_ID,
          approvalState: state,
          transition: {
            decisionId: '88888888-8888-4888-8888-888888888888',
            auditId: '99999999-9999-4999-8999-999999999999',
            operatorId: 'moirae-demo-operator',
          },
        }),
        { status: control.approvalStatus ?? 200 },
      );
    }

    control.executionCalls += 1;
    const requestId = headers.get('X-Ananke-Request-Id') ?? 'mc09-http-request-missing';
    if (headers.get('Authorization') === 'Bearer test-restricted-token') {
      return new Response(JSON.stringify(deniedBody(requestId)), { status: 200 });
    }
    const approvalId = JSON.parse(String(init?.body ?? '{}')).approvalId;
    return new Response(
      JSON.stringify(approvalId ? approvedBody(requestId) : pendingBody(requestId)),
      { status: 200 },
    );
  };
}

async function startConsole(
  overrides: Partial<UpstreamControl> = {},
  withCredentials = true,
): Promise<RunningConsole> {
  const root = await mkdtemp(join(tmpdir(), 'moirae-mc09-http-'));
  temporaryRoots.push(root);
  const control: UpstreamControl = {
    approvalCalls: 0,
    executionCalls: 0,
    ...overrides,
  };
  const env: NodeJS.ProcessEnv = {
    MOIRAE_PUBLICATION_STORE_ROOT: root,
    MOIRAE_OPERATOR_STEP_UP_SECRET: OPERATOR_PROOF,
    ...(withCredentials
      ? {
          ANANKE_MOIRAE_EXECUTION_TOKEN: 'test-execution-token',
          ANANKE_MOIRAE_PUBLISH_TOKEN: 'test-publish-token',
          ANANKE_MOIRAE_APPROVER_TOKEN: 'test-approver-token',
          ANANKE_MOIRAE_RESTRICTED_TOKEN: 'test-restricted-token',
          ANANKE_MOIRAE_EXECUTION_URL: 'http://127.0.0.1:3000/api/execute',
        }
      : {}),
  };
  const server = createMoiraeProductionServer({
    env,
    staticRoot,
    fetchImplementation: createFetch(control),
    allowHostDerivedOrigin: true,
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('MC09_TEST_SERVER_ADDRESS_MISSING');
  const port = address.port;
  return {
    server,
    port,
    control,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}

async function request(
  running: RunningConsole,
  pathname: string,
  body: unknown,
  options: { readonly origin?: string; readonly contentType?: string } = {},
): Promise<{ readonly status: number; readonly json: HttpJson }> {
  const response = await fetch(`http://127.0.0.1:${running.port}${pathname}`, {
    method: 'POST',
    headers: {
      Origin: options.origin ?? `${TEST_ORIGIN}:${running.port}`,
      'Content-Type': options.contentType ?? 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as HttpJson };
}

function publishPayload(requestId: string): Record<string, unknown> {
  return {
    requestId,
    toolName: 'publish_document',
    arguments: { documentId: 'demo-policy-001' },
    caller: { kind: 'browser', id: 'mc09-test-agent', sessionId: 'mc09-test-session' },
    context: { source: 'webmcp', purpose: 'mc-09-http-test' },
  };
}

describe('MC-09 real HTTP approval boundary', () => {
  it('rejects agent self-approval without spending the host approver credential', async () => {
    const running = await startConsole();
    try {
      const pending = await request(
        running,
        '/api/publish-document',
        publishPayload('mc09-http-self-approval'),
      );
      expect(pending.status).toBe(200);
      expect(pending.json.approval.approvalHandle).toMatch(/^moirae_/);
      expect(pending.json.approval.approvalRequestId).toBeUndefined();
      expect(JSON.stringify(pending.json)).not.toContain(FATES_APPROVAL_ID);

      const attempted = await request(running, '/api/publish-document/approval', {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'APPROVE',
      });
      expect(attempted.status).toBe(400);
      expect(attempted.json.reasonCode).toBe('INVALID_APPROVAL_DECISION');
      expect(running.control.approvalCalls).toBe(0);
      expect(running.control.executionCalls).toBe(1);
    } finally {
      await running.close();
    }
  });

  it('requires trusted origin and application/json on the approval boundary', async () => {
    const running = await startConsole();
    try {
      const pending = await request(
        running,
        '/api/publish-document',
        publishPayload('mc09-http-origin'),
      );
      const approval = {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'APPROVE',
        operatorProof: OPERATOR_PROOF,
      };
      const crossOrigin = await request(running, '/api/publish-document/approval', approval, {
        origin: 'https://evil.example',
      });
      expect(crossOrigin.status).toBe(403);
      expect(crossOrigin.json.reasonCode).toBe('UNTRUSTED_ORIGIN');

      const wrongType = await request(
        running,
        '/api/publish-document/approval',
        JSON.stringify(approval),
        {
          contentType: 'text/plain',
        },
      );
      expect(wrongType.status).toBe(415);
      expect(wrongType.json.reasonCode).toBe('JSON_REQUIRED');
      expect(running.control.approvalCalls).toBe(0);
    } finally {
      await running.close();
    }
  });

  it('rejects an incorrect operator proof before the privileged approval call', async () => {
    const running = await startConsole();
    try {
      const pending = await request(
        running,
        '/api/publish-document',
        publishPayload('mc09-http-wrong-proof'),
      );
      const attempted = await request(running, '/api/publish-document/approval', {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'APPROVE',
        operatorProof: 'wrong-proof',
      });
      expect(attempted.status).toBe(403);
      expect(attempted.json.reasonCode).toBe('INVALID_OPERATOR_STEP_UP');
      expect(running.control.approvalCalls).toBe(0);
      expect(running.control.executionCalls).toBe(1);
    } finally {
      await running.close();
    }
  });

  it('allows exactly one legitimate step-up approval and host publication', async () => {
    const running = await startConsole();
    try {
      const pending = await request(
        running,
        '/api/publish-document',
        publishPayload('mc09-http-human'),
      );
      const approved = await request(running, '/api/publish-document/approval', {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'APPROVE',
        operatorProof: OPERATOR_PROOF,
      });
      expect(approved.status).toBe(200);
      expect(approved.json.approval.state).toBe('APPROVED');
      expect(approved.json.publication.state).toBe('PUBLISHED');
      expect(running.control.approvalCalls).toBe(1);
      expect(running.control.executionCalls).toBe(2);
      expect(JSON.stringify(approved.json)).not.toContain(FATES_APPROVAL_ID);
    } finally {
      await running.close();
    }
  });

  it('rejects a repeated approval after the first host effect', async () => {
    const running = await startConsole();
    try {
      const pending = await request(
        running,
        '/api/publish-document',
        publishPayload('mc09-http-repeated-approval'),
      );
      const approval = {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'APPROVE',
        operatorProof: OPERATOR_PROOF,
      };
      const first = await request(running, '/api/publish-document/approval', approval);
      const second = await request(running, '/api/publish-document/approval', approval);
      expect(first.status).toBe(200);
      expect(first.json.publication.state).toBe('PUBLISHED');
      expect(second.status).toBe(409);
      expect(second.json.reasonCode).toBe('APPROVAL_TERMINAL');
      expect(running.control.approvalCalls).toBe(1);
      expect(running.control.executionCalls).toBe(2);
    } finally {
      await running.close();
    }
  });

  it('admits one of ten parallel approvals and rejects all other host claims locally', async () => {
    const running = await startConsole({ approvalDelayMs: 25 });
    try {
      const pending = await request(
        running,
        '/api/publish-document',
        publishPayload('mc09-http-race'),
      );
      const attempts = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(running, '/api/publish-document/approval', {
            approvalHandle: pending.json.approval.approvalHandle,
            decision: 'APPROVE',
            operatorProof: OPERATOR_PROOF,
          }),
        ),
      );
      expect(attempts.filter((item) => item.status === 200)).toHaveLength(1);
      expect(attempts.filter((item) => item.status === 409)).toHaveLength(9);
      expect(running.control.approvalCalls).toBe(1);
      expect(running.control.executionCalls).toBe(2);
    } finally {
      await running.close();
    }
  });

  it('rejects approve-after-reject without a second privileged call', async () => {
    const running = await startConsole({ approvalState: 'REJECTED' });
    try {
      const pending = await request(
        running,
        '/api/publish-document',
        publishPayload('mc09-http-reject'),
      );
      const rejected = await request(running, '/api/publish-document/approval', {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'REJECT',
        operatorProof: OPERATOR_PROOF,
      });
      expect(rejected.status).toBe(200);
      expect(rejected.json.approval.state).toBe('REJECTED');
      const replay = await request(running, '/api/publish-document/approval', {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'APPROVE',
        operatorProof: OPERATOR_PROOF,
      });
      expect(replay.status).toBe(409);
      expect(replay.json.reasonCode).toBe('APPROVAL_TERMINAL');
      expect(running.control.approvalCalls).toBe(1);
      expect(running.control.executionCalls).toBe(1);
    } finally {
      await running.close();
    }
  });

  it.each([403, 401, 500])(
    'never accepts a valid-looking APPROVED body at HTTP %s',
    async (status) => {
      const running = await startConsole({ approvalStatus: status });
      try {
        const pending = await request(
          running,
          '/api/publish-document',
          publishPayload(`mc09-http-status-${status}`),
        );
        const attempted = await request(running, '/api/publish-document/approval', {
          approvalHandle: pending.json.approval.approvalHandle,
          decision: 'APPROVE',
          operatorProof: OPERATOR_PROOF,
        });
        expect(attempted.status).toBe(200);
        expect(attempted.json.publication.state).toBe('NOT_PUBLISHED');
        expect(attempted.json.approval).toBeUndefined();
        expect(running.control.approvalCalls).toBe(1);
        expect(running.control.executionCalls).toBe(1);
      } finally {
        await running.close();
      }
    },
  );

  it('rejects malformed approval transport, direct fixture/store access, and missing credentials', async () => {
    const malformed = await startConsole({ malformedApprovalBody: true });
    try {
      const pending = await request(
        malformed,
        '/api/publish-document',
        publishPayload('mc09-http-malformed'),
      );
      const attempted = await request(malformed, '/api/publish-document/approval', {
        approvalHandle: pending.json.approval.approvalHandle,
        decision: 'APPROVE',
        operatorProof: OPERATOR_PROOF,
      });
      expect(attempted.json.publication.state).toBe('NOT_PUBLISHED');
    } finally {
      await malformed.close();
    }

    const missing = await startConsole({}, false);
    try {
      const failed = await request(
        missing,
        '/api/publish-document',
        publishPayload('mc09-http-no-credentials'),
      );
      expect(failed.json.outcome.status).toBe('FAILED');
      expect(failed.json.publication.state).toBe('NOT_PUBLISHED');
      const fixture = await fetch(
        `http://127.0.0.1:${missing.port}/server/fixtures/demo-policy-001.txt`,
      );
      const store = await fetch(`http://127.0.0.1:${missing.port}/publication/demo-policy-001`);
      expect(fixture.status).toBe(404);
      expect(store.status).toBe(404);
    } finally {
      await missing.close();
    }
  });

  it('does not create an approval or effect after the authoritative deny demo', async () => {
    const running = await startConsole();
    try {
      const denied = await request(running, '/api/publish-document/deny-demo', {});
      expect(denied.status).toBe(200);
      expect(denied.json.outcome.status).toBe('DENIED');
      expect(denied.json.publication.state).toBe('NOT_PUBLISHED');
      expect(denied.json.approval).toBeUndefined();

      const attemptedUpgrade = await request(running, '/api/publish-document/approval', {
        approvalHandle: `moirae_${crypto.randomUUID()}`,
        decision: 'APPROVE',
        operatorProof: OPERATOR_PROOF,
      });
      expect(attemptedUpgrade.status).toBe(400);
      expect(attemptedUpgrade.json.reasonCode).toBe('APPROVAL_NOT_FOUND_OR_EXPIRED');
      expect(running.control.approvalCalls).toBe(0);
      expect(running.control.executionCalls).toBe(1);
      const status = await fetch(`http://127.0.0.1:${running.port}/api/publish-document/status`, {
        headers: { Origin: `${TEST_ORIGIN}:${running.port}` },
      }).then((response) => response.json() as Promise<HttpJson>);
      expect(status.sourceReadCount).toBe(0);
      expect(status.executorInvocationCount).toBe(0);
    } finally {
      await running.close();
    }
  });
});
