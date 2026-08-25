import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createFatesClient } from '../../src/fates/client';
import { FakeFatesClient } from '../../src/fates/fake-client';
import { deriveGovernanceView, setPresentationState } from '../../src/governance/view-model';
import { DEMO_DOCUMENT_ID, INSPECT_DOCUMENT_TOOL } from '../../src/webmcp/inspect-document';
import { createWebMcpAdapter } from '../../src/webmcp/adapter';
import type { FatesClient } from '../../src/fates/client';
import type { GovernedRequest } from '../../src/fates/types';
import {
  governInspectDocumentInvocation,
  InspectDocumentService,
} from '../../server/inspect-document';
import { InspectDocumentHttpHandler } from '../../server/http-handler';
import { request, syntheticOutcome, authoritativeAllowedOutcome } from '../helpers';

const canary = 'MC01-PROTECTED-DOCUMENT-CANARY-9f4c2d7a';

const invocation = {
  requestId: 'request-mc01-001',
  toolName: 'inspect_document',
  arguments: { documentId: DEMO_DOCUMENT_ID },
  caller: {
    kind: 'browser' as const,
    id: 'browser-mc01-test',
    sessionId: 'session-mc01-test',
  },
  context: {
    source: 'webmcp' as const,
    workspaceId: 'workspace-mc01-test',
    purpose: 'mc-01-test',
  },
};

describe('MC-01 governed inspect_document disclosure', () => {
  it('MC-01-T01: discovery does not retrieve the document', () => {
    const read = vi.fn(async () => ({ documentId: DEMO_DOCUMENT_ID, content: canary }));
    const adapter = createWebMcpAdapter({
      client: { govern: async () => syntheticOutcome('DENIED', invocation.requestId) },
      tools: [INSPECT_DOCUMENT_TOOL],
    });

    expect(adapter.discover()).toEqual([INSPECT_DOCUMENT_TOOL]);
    expect(read).not.toHaveBeenCalled();
  });

  it('MC-01-T02: invocation creates the expected immutable governed request', async () => {
    let governedRequest: GovernedRequest | undefined;
    const adapter = createWebMcpAdapter({
      client: {
        govern: async (requestValue) => {
          governedRequest = requestValue;
          return syntheticOutcome('DENIED', requestValue.requestId);
        },
      },
      tools: [INSPECT_DOCUMENT_TOOL],
    });
    const argumentsValue = { documentId: DEMO_DOCUMENT_ID };
    const result = adapter.invokeGoverned({ ...invocation, arguments: argumentsValue });
    argumentsValue.documentId = 'different-document';
    await result;

    expect(governedRequest?.requestId).toBe(invocation.requestId);
    expect(governedRequest?.action).toBe('inspect_document');
    expect(governedRequest?.parameters).toEqual({ documentId: DEMO_DOCUMENT_ID });
    expect(governedRequest?.context).toEqual(invocation.context);
    expect(Object.isFrozen(governedRequest?.parameters)).toBe(true);
  });

  it('MC-01-T03: the protected canary is not in browser source or an existing client build', () => {
    const browserSource = collectFiles(join(process.cwd(), 'src', 'app'))
      .concat(collectFiles(join(process.cwd(), 'src', 'inspection')))
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

  it('MC-01-T04: an authoritative ALLOWED outcome discloses exactly the governed document', async () => {
    const read = vi.fn(async (documentId: string) => ({ documentId, content: canary }));
    const client: FatesClient = {
      govern: async (requestValue) => authoritativeAllowedOutcome(requestValue.requestId),
    };
    const governed = await governInspectDocumentInvocation(client, invocation);
    const result = await new InspectDocumentService({
      mode: 'production',
      documentSource: { read },
    }).disclose(governed.request, governed.outcome);

    expect(read).toHaveBeenCalledWith(DEMO_DOCUMENT_ID);
    expect(result.disclosure).toEqual({ state: 'DISCLOSED', evidenceMode: 'AUTHORITATIVE' });
    expect(result.document).toEqual({ documentId: DEMO_DOCUMENT_ID, content: canary });
    expect(result.phases.map((phase) => phase.name)).toEqual([
      'REQUESTED',
      'IDENTIFIED',
      'PREFLIGHT',
      'ADMITTED',
      'EXECUTED',
    ]);
  });

  it.each([
    ['MC-01-T05', 'DENIED' as const],
    ['MC-01-T06', 'REQUIRES_APPROVAL' as const],
    ['MC-01-T07', 'QUARANTINED' as const],
    ['MC-01-T08-failed', 'FAILED' as const],
    ['MC-01-T08-unknown', 'UNKNOWN' as const],
  ])('%s: %s discloses zero protected content', async (_testId, status) => {
    const read = vi.fn(async () => ({ documentId: DEMO_DOCUMENT_ID, content: canary }));
    const client: FatesClient = {
      govern: async (requestValue) => syntheticOutcome(status, requestValue.requestId),
    };
    const governed = await governInspectDocumentInvocation(client, invocation);
    const result = await new InspectDocumentService({
      mode: 'production',
      documentSource: { read },
    }).disclose(governed.request, governed.outcome);

    expect(result.document).toBeUndefined();
    expect(result.disclosure.state).toBe('NOT_DISCLOSED');
    expect(read).not.toHaveBeenCalled();
  });

  it('MC-01-T09: Fates unavailable discloses zero protected content', async () => {
    const client = createFatesClient({ environment: 'production' });
    const governed = await governInspectDocumentInvocation(client, invocation);
    const result = await new InspectDocumentService({ mode: 'production' }).disclose(
      governed.request,
      governed.outcome,
    );

    expect(governed.outcome.status).toBe('FAILED');
    expect(result.document).toBeUndefined();
    expect(result.disclosure.state).toBe('NOT_DISCLOSED');
  });

  it('MC-01-T10: malformed or unverifiable outcomes disclose zero protected content', async () => {
    const client = createFatesClient({
      environment: 'production',
      transport: {
        send: async () => ({ requestId: invocation.requestId, status: 'ALLOWED' }),
      },
    });
    const governed = await governInspectDocumentInvocation(client, invocation);
    const result = await new InspectDocumentService({ mode: 'production' }).disclose(
      governed.request,
      governed.outcome,
    );

    expect(governed.outcome.status).toBe('UNKNOWN');
    expect(result.document).toBeUndefined();
    expect(result.disclosure.state).toBe('NOT_DISCLOSED');
  });

  it('MC-01-T11: caller parameter mutation cannot change the governed document ID', async () => {
    const argumentsValue = { documentId: DEMO_DOCUMENT_ID };
    const client: FatesClient = {
      govern: async (requestValue) => authoritativeAllowedOutcome(requestValue.requestId),
    };
    const promise = governInspectDocumentInvocation(client, {
      ...invocation,
      arguments: argumentsValue,
    });
    argumentsValue.documentId = '../../server/fixtures/other.txt';
    const governed = await promise;
    const read = vi.fn(async (documentId: string) => ({ documentId, content: canary }));
    const result = await new InspectDocumentService({
      mode: 'production',
      documentSource: { read },
    }).disclose(governed.request, governed.outcome);

    expect(governed.request.parameters).toEqual({ documentId: DEMO_DOCUMENT_ID });
    expect(result.document?.documentId).toBe(DEMO_DOCUMENT_ID);
    expect(read).toHaveBeenCalledWith(DEMO_DOCUMENT_ID);
  });

  it('MC-01-T12: a different document ID or request ID cannot be substituted after governance', async () => {
    const read = vi.fn(async () => ({ documentId: DEMO_DOCUMENT_ID, content: canary }));
    const service = new InspectDocumentService({ mode: 'production', documentSource: { read } });
    const differentDocument = await service.disclose(
      {
        ...request,
        requestId: invocation.requestId,
        action: 'inspect_document',
        parameters: { documentId: 'different-document' },
      },
      authoritativeAllowedOutcome(invocation.requestId),
    );
    const differentRequest = await service.disclose(
      {
        ...request,
        requestId: 'request-other',
        action: 'inspect_document',
        parameters: { documentId: DEMO_DOCUMENT_ID },
      },
      authoritativeAllowedOutcome(invocation.requestId),
    );

    expect(differentDocument.document).toBeUndefined();
    expect(differentRequest.document).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it('MC-01-T13: arbitrary path and traversal input is rejected before document retrieval', async () => {
    const read = vi.fn(async () => ({ documentId: DEMO_DOCUMENT_ID, content: canary }));
    const client: FatesClient = {
      govern: async (requestValue) => authoritativeAllowedOutcome(requestValue.requestId),
    };
    const governed = await governInspectDocumentInvocation(client, {
      ...invocation,
      arguments: { documentId: '../../server/fixtures/demo-policy-001.txt' },
    });
    const result = await new InspectDocumentService({
      mode: 'production',
      documentSource: { read },
    }).disclose(governed.request, governed.outcome);

    expect(result.document).toBeUndefined();
    expect(result.disclosure.reasonCode).toBe('DOCUMENT_REQUEST_INVALID');
    expect(read).not.toHaveBeenCalled();
  });

  it('MC-01-T14: the host handler exposes no direct fixture route', async () => {
    const handler = new InspectDocumentHttpHandler({
      govern: async (requestValue) => authoritativeAllowedOutcome(requestValue.requestId),
    });
    const result = await handler.handle({ path: '/server/fixtures/demo-policy-001.txt' });

    expect(result).toEqual({
      error: 'BAD_REQUEST',
      reasonCode: 'INVALID_INSPECT_DOCUMENT_INVOCATION',
    });
  });

  it('MC-01-T15: synthetic evidence cannot authorize production disclosure', async () => {
    const fake = new FakeFatesClient(async (requestValue) =>
      syntheticOutcome('ALLOWED', requestValue.requestId),
    );
    const governed = await governInspectDocumentInvocation(fake, invocation);
    const productionResult = await new InspectDocumentService({ mode: 'production' }).disclose(
      governed.request,
      governed.outcome,
    );
    const demoResult = await new InspectDocumentService({ mode: 'synthetic-demo' }).disclose(
      governed.request,
      governed.outcome,
    );

    expect(productionResult.document).toBeUndefined();
    expect(productionResult.disclosure.evidenceMode).toBe('SYNTHETIC_TEST_ONLY');
    expect(demoResult.disclosure.state).toBe('DISCLOSED');
    expect(demoResult.disclosure.evidenceMode).toBe('SYNTHETIC_TEST_ONLY');
  });

  it('MC-01-T16: local UI state cannot upgrade DENIED to disclosure', async () => {
    const client: FatesClient = {
      govern: async (requestValue) => syntheticOutcome('DENIED', requestValue.requestId),
    };
    const governed = await governInspectDocumentInvocation(client, invocation);
    const result = await new InspectDocumentService({ mode: 'production' }).disclose(
      governed.request,
      governed.outcome,
    );
    const view = setPresentationState(deriveGovernanceView(result.outcome), 'expanded');

    expect(view.displayState).toBe('DENIED');
    expect(result.document).toBeUndefined();
  });

  it('MC-01-T17: browser code contains no authority secrets', () => {
    const browserFiles = collectFiles(join(process.cwd(), 'src', 'app')).concat(
      collectFiles(join(process.cwd(), 'src', 'inspection')),
    );
    const browserSource = browserFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

    expect(browserSource).not.toMatch(/PRIVATE KEY|SIGNING_KEY|AUTHORITY_SECRET|BEARER/i);
  });

  it('MC-01-T18: browser routes only to the governed host endpoint', () => {
    const browserFiles = collectFiles(join(process.cwd(), 'src', 'app')).concat(
      collectFiles(join(process.cwd(), 'src', 'inspection')),
    );
    const browserSource = browserFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

    expect(browserSource).toContain('/api/inspect-document');
    expect(browserSource).not.toContain('server/fixtures');
    expect(browserSource).not.toContain('demo-policy-001.txt');
  });
});

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}
