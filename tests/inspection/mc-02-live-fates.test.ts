import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  createFatesClient,
  parseFatesOutcome,
  snapshotGovernedRequest,
} from '../../src/fates/client';
import { FakeFatesClient } from '../../src/fates/fake-client';
import type { FatesTransportBinding } from '../../src/fates/client';
import type { GovernanceOutcome, GovernedRequest } from '../../src/fates/types';
import { createProductionInspectDocumentHttpHandler } from '../../server/http-handler';
import { AnankeFatesTransport } from '../../server/ananke-transport';
import {
  MOIRAE_AUTHORITY_BINDING,
  MOIRAE_FATES_ACTION,
  MOIRAE_FATES_CANONICAL_REQUEST_DIGEST,
  MOIRAE_FATES_EXPECTED_SHA256,
  MOIRAE_FATES_PURPOSE,
} from '../../server/moirae-authority';
import {
  governInspectDocumentInvocation,
  InspectDocumentService,
} from '../../server/inspect-document';
import {
  DEMO_DOCUMENT_ID,
  INSPECT_DOCUMENT_ACTION,
  INSPECT_DOCUMENT_TOOL,
} from '../../src/webmcp/inspect-document';
import { createWebMcpAdapter } from '../../src/webmcp/adapter';
import type { WebMcpInvocation } from '../../src/webmcp/types';

const canary = 'MC01-PROTECTED-DOCUMENT-CANARY-9f4c2d7a';
const fixturePath = join(process.cwd(), 'server', 'fixtures', 'demo-policy-001.txt');
const invocation: WebMcpInvocation = {
  requestId: 'mc02-request-001',
  toolName: INSPECT_DOCUMENT_ACTION,
  arguments: { documentId: DEMO_DOCUMENT_ID },
  caller: { kind: 'browser', id: 'mc02-browser', sessionId: 'mc02-session' },
  context: { source: 'webmcp', purpose: 'browser-controlled-purpose-must-not-authorize' },
};

describe('MC-02 live authoritative Fates transport', () => {
  it('MC-02-T01: authoritative ALLOW for the exact action/resource/digest permits disclosure', async () => {
    const live = await executeLive();

    expect(live.result.disclosure).toEqual({ state: 'DISCLOSED', evidenceMode: 'AUTHORITATIVE' });
    expect(live.result.document?.content).toContain(canary);
    expect(JSON.parse(String(live.fetch.mock.calls[0]?.[1]?.body))).toEqual({
      toolName: MOIRAE_FATES_ACTION,
      arguments: { documentId: DEMO_DOCUMENT_ID, expectedSha256: MOIRAE_FATES_EXPECTED_SHA256 },
      purpose: MOIRAE_FATES_PURPOSE,
    });
    expect(live.fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer test-ananke-token',
      'X-Ananke-Correlation-Id': invocation.requestId,
    });
  });

  it.each([
    [
      'MC-02-T02',
      {
        outcome: { state: 'DENIED' },
        evidence: { policyDecision: 'DENY', authorizationDecision: 'DENY' },
      },
    ],
    ['MC-02-T03', { outcome: { state: 'WAITING_FOR_APPROVAL' }, approvalGrantId: 'approval-001' }],
  ])('%s: non-allow authority states disclose zero content', async (_testId, responsePatch) => {
    const live = await executeLive(responsePatch);

    expect(live.result.document).toBeUndefined();
    expect(live.result.disclosure.state).toBe('NOT_DISCLOSED');
  });

  it('MC-02-T04: Ananke unavailable discloses zero content', async () => {
    const client = createFatesClient({ environment: 'production' });
    const governed = await governInspectDocumentInvocation(client, invocation);
    const result = await new InspectDocumentService({ mode: 'production' }).disclose(
      governed.request,
      governed.outcome,
    );

    expect(result.document).toBeUndefined();
    expect(result.disclosure.state).toBe('NOT_DISCLOSED');
  });

  it('MC-02-T05: authentication failure discloses zero content', async () => {
    const live = await executeLive(undefined, { status: 401 });

    expect(live.result.document).toBeUndefined();
    expect(live.result.disclosure.state).toBe('NOT_DISCLOSED');
  });

  it('MC-02-T06: transport interruption discloses zero content', async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error('socket closed');
    });
    const client = createFatesClient({
      environment: 'production',
      transport: new AnankeFatesTransport({
        endpoint: 'http://127.0.0.1:3000/api/execute',
        token: 'test-ananke-token',
        fetchImplementation: fetchImplementation as unknown as typeof fetch,
      }),
    });
    const governed = await governInspectDocumentInvocation(client, invocation);
    const result = await new InspectDocumentService({ mode: 'production' }).disclose(
      governed.request,
      governed.outcome,
    );

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T07: malformed response discloses zero content', async () => {
    const live = await executeLive({ malformed: true });

    expect(live.result.document).toBeUndefined();
    expect(live.result.outcome.status).toBe('UNKNOWN');
  });

  it.each([
    ['MC-02-T08', { action: 'fates.slice02.inspect-fixed-fixture.v1' }],
    ['MC-02-T09', { documentId: 'other-document' }],
    ['MC-02-T10', { expectedSha256: 'a'.repeat(64) }],
  ])(
    '%s: wrong canonical action, document, or digest is rejected',
    async (_testId, evidencePatch) => {
      const outcome = outcomeFromResponse(invocation.requestId, evidencePatch);
      const result = await disclose(outcome);

      expect(result.document).toBeUndefined();
      expect(result.disclosure.reasonCode).toBe('UNVERIFIABLE_AUTHORIZATION');
    },
  );

  it('MC-02-T11: wrong purpose is rejected', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, {}, {}, { purpose: 'wrong-purpose' });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T12: a different request identity cannot authorize disclosure', async () => {
    const outcome = outcomeFromResponse(invocation.requestId);
    const result = await disclose(outcome, governedRequest('different-request'));

    expect(result.document).toBeUndefined();
    expect(result.disclosure.reasonCode).toBe('REQUEST_ID_MISMATCH');
  });

  it('MC-02-T13: a different correlation identity cannot authorize disclosure', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, {
      correlationId: 'different-correlation',
    });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T14: a tampered canonical request digest is rejected', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, {
      canonicalRequestDigest: 'a'.repeat(64),
    });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T15: a tampered or missing authority binding digest is rejected', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, {
      authorityBindingDigest: undefined,
    });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T16: missing decision, outcome, or audit evidence is rejected', async () => {
    for (const field of ['decisionId', 'outcomeId', 'auditId'] as const) {
      const outcome = outcomeFromResponse(invocation.requestId, { [field]: undefined });
      const result = await disclose(outcome);
      expect(result.document).toBeUndefined();
    }
  });

  it('MC-02-T17: unexpected effect semantics is rejected', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, {
      effectSemantics: 'DOCUMENT_READ_AND_DISCLOSURE',
    });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T18: a Fates resource-read count greater than zero is rejected', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, { fatesResourceReadAttemptCount: 1 });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T19: Fates claiming document disclosure is rejected', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, { documentDisclosureByFates: true });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T20: changed Console fixture bytes are not disclosed', async () => {
    const outcome = outcomeFromResponse(invocation.requestId);
    const read = vi.fn(async () => ({
      documentId: DEMO_DOCUMENT_ID,
      content: 'changed fixture',
      bytes: new TextEncoder().encode('changed fixture'),
    }));
    const result = await new InspectDocumentService({
      mode: 'production',
      documentSource: { read },
    }).disclose(governedRequest(), outcome);

    expect(read).toHaveBeenCalledOnce();
    expect(result.document).toBeUndefined();
    expect(result.disclosure.reasonCode).toBe('DOCUMENT_DIGEST_MISMATCH');
  });

  it('MC-02-T21: the exact bytes hashed are the exact bytes returned', async () => {
    const outcome = outcomeFromResponse(invocation.requestId);
    const bytes = new Uint8Array(readFileSync(fixturePath));
    const result = await new InspectDocumentService({
      mode: 'production',
      documentSource: {
        read: async () => ({
          documentId: DEMO_DOCUMENT_ID,
          content: 'this text is not used after the byte read',
          bytes,
        }),
      },
    }).disclose(governedRequest(), outcome);

    expect(result.document?.content).toBe(Buffer.from(bytes).toString('utf8'));
  });

  it('MC-02-T22: browser-side mutation after invocation cannot change the governed resource', async () => {
    const argumentsValue = { documentId: DEMO_DOCUMENT_ID };
    const livePromise = executeLive(undefined, undefined, argumentsValue);
    argumentsValue.documentId = 'other-document';
    const live = await livePromise;

    expect(JSON.parse(String(live.fetch.mock.calls[0]?.[1]?.body)).arguments).toEqual({
      documentId: DEMO_DOCUMENT_ID,
      expectedSha256: MOIRAE_FATES_EXPECTED_SHA256,
    });
    expect(live.result.document?.documentId).toBe(DEMO_DOCUMENT_ID);
  });

  it('MC-02-T23: host-side mutation after governance cannot change the governed resource', async () => {
    const argumentsValue = { documentId: DEMO_DOCUMENT_ID };
    const livePromise = executeLive(undefined, undefined, argumentsValue);
    argumentsValue.documentId = '../../server/fixtures/other.txt';
    const live = await livePromise;

    expect(live.result.document?.documentId).toBe(DEMO_DOCUMENT_ID);
    expect(live.result.request.parameters).toEqual({ documentId: DEMO_DOCUMENT_ID });
  });

  it('MC-02-T24: synthetic evidence cannot authorize live disclosure', async () => {
    const fake = new FakeFatesClient(async (request) => ({
      requestId: request.requestId,
      outcomeId: 'synthetic-allow',
      status: 'ALLOWED',
      evidence: { evidenceId: 'synthetic', source: 'synthetic-test', authority: 'synthetic' },
    }));
    const governed = await governInspectDocumentInvocation(fake, invocation);
    const result = await new InspectDocumentService({ mode: 'production' }).disclose(
      governed.request,
      governed.outcome,
    );

    expect(result.document).toBeUndefined();
  });

  it('MC-02-T25: live transport does not silently fall back to synthetic authorization', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const handler = createProductionInspectDocumentHttpHandler({}, fetchImplementation);
    const result = await handler.handle(invocation);

    expect('document' in result ? result.document : undefined).toBeUndefined();
    expect('outcome' in result ? result.outcome.evidence.source : undefined).toBe('console');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('MC-02-T26: discovery performs no Ananke call and no fixture read', () => {
    const govern = vi.fn();
    const read = vi.fn();
    const adapter = createWebMcpAdapter({
      client: { govern },
      tools: [INSPECT_DOCUMENT_TOOL],
    });

    expect(adapter.discover()).toEqual([INSPECT_DOCUMENT_TOOL]);
    expect(govern).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('MC-02-T27: browser-delivered output contains no protected fixture canary', () => {
    const browserSource = collectFiles(join(process.cwd(), 'src'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(browserSource).not.toContain(canary);

    const distRoot = join(process.cwd(), 'dist');
    if (existsSync(distRoot)) {
      const delivered = collectFiles(distRoot)
        .filter((file) => /\.(html|css|js|map)$/.test(file))
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n');
      expect(delivered).not.toContain(canary);
    }
  });

  it('MC-02-T28: browser-delivered output contains no Ananke credential or authority secret', () => {
    const browserSource = collectFiles(join(process.cwd(), 'src'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(browserSource).not.toMatch(
      /ANANKE_MOIRAE_EXECUTION_TOKEN|BEGIN [A-Z ]*PRIVATE KEY|Bearer /i,
    );
  });

  it('MC-02-T29: no direct alternate browser endpoint can bypass the Moirae Fates gate', async () => {
    const browserSource = collectFiles(join(process.cwd(), 'src'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(browserSource).toContain('/api/inspect-document');
    expect(browserSource).not.toContain('/api/execute');

    const handler = new (await import('../../server/http-handler')).InspectDocumentHttpHandler({
      govern: async () => ({
        requestId: invocation.requestId,
        outcomeId: 'unused',
        status: 'DENIED',
        reasonCode: 'unused',
        evidence: { evidenceId: 'unused', source: 'synthetic-test', authority: 'synthetic' },
      }),
    });
    const result = await handler.handle({ path: '/server/fixtures/demo-policy-001.txt' });
    expect(result).toEqual({
      error: 'BAD_REQUEST',
      reasonCode: 'INVALID_INSPECT_DOCUMENT_INVOCATION',
    });
  });

  it('MC-02-T30: historical Slice 02 authority cannot authorize the Moirae document', async () => {
    const outcome = outcomeFromResponse(invocation.requestId, {
      action: 'fates.slice02.inspect-fixed-fixture.v1',
      documentId: 'fates.slice02.fixed-fixture.v1',
    });
    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
  });
});

async function executeLive(
  responsePatch?: Record<string, unknown>,
  options?: { readonly status?: number },
  argumentsValue = { documentId: DEMO_DOCUMENT_ID },
) {
  const evidencePatch = isRecord(responsePatch?.evidence)
    ? responsePatch.evidence
    : (responsePatch ?? {});
  const outcomePatch = isRecord(responsePatch?.outcome) ? responsePatch.outcome : {};
  const payload = responsePatch?.malformed
    ? {}
    : anankeResponse(
        invocation.requestId,
        evidencePatch,
        outcomePatch,
        typeof responsePatch?.approvalGrantId === 'string'
          ? responsePatch.approvalGrantId
          : undefined,
      );
  const fetchImplementation = vi.fn(
    async (...args: Parameters<typeof fetch>): Promise<Response> => {
      void args;
      const status = options?.status ?? 200;
      return jsonResponse(payload, status);
    },
  );
  const client = createFatesClient({
    environment: 'production',
    transport: new AnankeFatesTransport({
      endpoint: 'http://127.0.0.1:3000/api/execute',
      token: 'test-ananke-token',
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    }),
  });
  const governed = await governInspectDocumentInvocation(client, {
    ...invocation,
    arguments: argumentsValue,
  });
  const result = await new InspectDocumentService({ mode: 'production' }).disclose(
    governed.request,
    governed.outcome,
  );
  return { governed, result, fetch: fetchImplementation };
}

async function disclose(outcome: GovernanceOutcome, request: GovernedRequest = governedRequest()) {
  return new InspectDocumentService({
    mode: 'production',
    documentSource: {
      read: async () => ({ documentId: DEMO_DOCUMENT_ID, content: canary }),
    },
  }).disclose(request, outcome);
}

function governedRequest(requestId = invocation.requestId): GovernedRequest {
  return snapshotGovernedRequest({
    ...invocation,
    requestId,
    action: INSPECT_DOCUMENT_ACTION,
    parameters: { documentId: DEMO_DOCUMENT_ID },
  });
}

function outcomeFromResponse(
  requestId: string,
  evidencePatch: Record<string, unknown> = {},
  outcomePatch: Record<string, unknown> = {},
  bindingPatch: Partial<FatesTransportBinding> = {},
): GovernanceOutcome {
  return parseFatesOutcome(
    {
      response: anankeResponse(requestId, evidencePatch, outcomePatch),
      binding: {
        ...MOIRAE_AUTHORITY_BINDING,
        correlationId: requestId,
        ...bindingPatch,
      },
    },
    requestId,
  );
}

function anankeResponse(
  correlationId: string,
  evidencePatch: Record<string, unknown> = {},
  outcomePatch: Record<string, unknown> = {},
  approvalGrantId?: string,
) {
  return {
    ...(approvalGrantId ? { approvalGrantId } : {}),
    outcome: {
      state: 'COMPLETED',
      retryable: false,
      requiresUser: false,
      safeToContinue: true,
      ...outcomePatch,
    },
    evidence: {
      action: MOIRAE_FATES_ACTION,
      documentId: DEMO_DOCUMENT_ID,
      expectedSha256: MOIRAE_FATES_EXPECTED_SHA256,
      canonicalRequestDigest: MOIRAE_FATES_CANONICAL_REQUEST_DIGEST,
      requestSchemaId: 'urn:fates:moirae:inspect-document-request:v1',
      requestSchemaSha256: 'c'.repeat(64),
      effectSemantics: 'AUTHORIZATION_ONLY_NO_RESOURCE_READ',
      fatesResourceReadAttemptCount: 0,
      documentDisclosureByFates: false,
      decisionId: 'decision-mc02-001',
      outcomeId: 'outcome-mc02-001',
      routeState: 'ananke-authority',
      dispatchState: 'authority-granted-no-resource-read',
      requestId: 'ananke-request-mc02-001',
      correlationId,
      policyVersion: 'policy-v1',
      authorityBindingDigest: 'b'.repeat(64),
      authenticatedWorkloadIdentity: {
        authenticatedPrincipalId: 'moirae-console-host',
        authenticatedPrincipalKind: 'service',
        actingPrincipalId: 'moirae-document-inspection-agent',
        actingPrincipalKind: 'agent',
        claim: 'Authenticated Ananke workload identity',
      },
      policyDecision: 'ALLOW',
      authorizationDecision: 'ALLOW',
      auditId: 'audit-mc02-001',
      auditReference: { auditId: 'audit-mc02-001', sourceRuntime: 'ananke' },
      ...evidencePatch,
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
