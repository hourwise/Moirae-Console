import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { AnankeFatesTransport } from '../../server/ananke-transport';
import {
  DEFAULT_AUTHORITY_CONSUMPTION_MAX_ENTRIES,
  InMemoryAuthorityConsumptionStore,
} from '../../server/authority-consumption';
import {
  createProductionInspectDocumentHttpHandler,
  InspectDocumentHttpHandler,
} from '../../server/http-handler';
import { InspectDocumentService } from '../../server/inspect-document';
import { setNoStoreResponseHeaders } from '../../server/http-response';
import {
  DEMO_DOCUMENT_ID,
  INSPECT_DOCUMENT_ACTION,
  INSPECT_DOCUMENT_TOOL,
} from '../../src/webmcp/inspect-document';
import { createWebMcpAdapter } from '../../src/webmcp/adapter';
import { snapshotGovernedRequest } from '../../src/fates/client';
import type { GovernanceEvidence, GovernanceOutcome, GovernedRequest } from '../../src/fates/types';
import { syntheticOutcome, authoritativeAllowedOutcome } from '../helpers';

const canary = 'MC01-PROTECTED-DOCUMENT-CANARY-9f4c2d7a';
const fixturePath = join(process.cwd(), 'server', 'fixtures', 'demo-policy-001.txt');

const request = snapshotGovernedRequest({
  requestId: 'mc03-request-001',
  caller: { kind: 'browser', id: 'mc03-browser', sessionId: 'mc03-session' },
  action: INSPECT_DOCUMENT_ACTION,
  parameters: { documentId: DEMO_DOCUMENT_ID },
  context: { source: 'webmcp', purpose: 'mc03-test' },
});

describe('MC-03 fresh replay-safe authority', () => {
  it('MC-03-T01: fresh authoritative result succeeds within its validity window', async () => {
    const result = await disclose(freshOutcome());

    expect(result.disclosure).toEqual({ state: 'DISCLOSED', evidenceMode: 'AUTHORITATIVE' });
    expect(result.document?.content).toContain(canary);
  });

  it('MC-03-T02: expired authority discloses zero content', async () => {
    const outcome = tamper({
      issuedAt: new Date(Date.now() - 20_000).toISOString(),
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
    });

    const result = await disclose(outcome);

    expect(result.document).toBeUndefined();
    expect(result.disclosure.reasonCode).toBe('STALE_AUTHORITY');
  });

  it('MC-03-T03: future or impossible issue timestamp fails closed', async () => {
    const result = await disclose(
      tamper({ issuedAt: new Date(Date.now() + 10_000).toISOString() }),
    );

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T04: expiry preceding issue time fails closed', async () => {
    const issuedAt = new Date(Date.now() + 1_000).toISOString();
    const result = await disclose(
      tamper({ issuedAt, expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    );

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T05: authority lifetime exceeding the maximum fails closed', async () => {
    const issuedAt = new Date(Date.now() - 100).toISOString();
    const result = await disclose(
      tamper({ issuedAt, expiresAt: new Date(Date.now() + 20_000).toISOString() }),
    );

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T06: replaying a consumed authority is rejected by the active detector', async () => {
    const outcome = freshOutcome();
    const service = new InspectDocumentService({ mode: 'production' });

    const first = await service.disclose(request, outcome);
    const replay = await service.disclose(request, outcome);

    expect(first.disclosure.state).toBe('DISCLOSED');
    expect(replay.disclosure).toEqual({
      state: 'NOT_DISCLOSED',
      evidenceMode: 'AUTHORITATIVE',
      reasonCode: 'REPLAY_REJECTED',
    });
    expect(replay.document).toBeUndefined();
  });

  it('MC-03-T07: replay under a new request ID is rejected', async () => {
    const result = await disclose(freshOutcome(), {
      ...request,
      requestId: 'mc03-request-002',
    });

    expect(result.document).toBeUndefined();
    expect(result.disclosure.reasonCode).toBe('REQUEST_ID_MISMATCH');
  });

  it('MC-03-T08: replay under a new correlation identity is rejected', async () => {
    const result = await disclose(tamper({ correlationId: 'different-correlation' }));

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T09: replay for another resource is rejected', async () => {
    const result = await disclose(freshOutcome(), {
      ...request,
      parameters: { documentId: 'another-document' },
    });

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T10: replay for another action is rejected', async () => {
    const result = await disclose(freshOutcome(), {
      ...request,
      action: 'publish_document',
    });

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T11: replay for modified document bytes is rejected', async () => {
    const result = await disclose(freshOutcome(), request, {
      mode: 'production',
      documentSource: {
        read: async () => ({
          documentId: DEMO_DOCUMENT_ID,
          content: 'modified document bytes',
          bytes: new TextEncoder().encode('modified document bytes'),
        }),
      },
    });

    expect(result.document).toBeUndefined();
    expect(result.disclosure.reasonCode).toBe('DOCUMENT_DIGEST_MISMATCH');
  });

  it('MC-03-T12: changing freshness fields invalidates receipt integrity', async () => {
    const result = await disclose(tamper({ issuedAt: new Date(Date.now() - 200).toISOString() }));

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T13: changing nonce invalidates the authority receipt binding', async () => {
    const result = await disclose(tamper({ nonce: 'tampered-nonce' }));

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T14: missing freshness evidence fails closed', async () => {
    const result = await disclose(tamper({ issuedAt: undefined, expiresAt: undefined }));

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T15: missing replay identity fails closed', async () => {
    const result = await disclose(
      tamper({ receiptId: undefined, nonce: undefined, replayKeyDigest: undefined }),
    );

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T16: malformed freshness evidence fails closed', async () => {
    const result = await disclose(tamper({ issuedAt: 'not-a-timestamp' }));

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T17: synthetic evidence cannot manufacture fresh authority', async () => {
    const result = await disclose(syntheticOutcome('ALLOWED', request.requestId));

    expect(result.document).toBeUndefined();
  });

  it.each([
    ['MC-03-T18', { expiresAt: new Date(Date.now() + 60_000).toISOString() }],
    ['MC-03-T19', { nonce: 'browser-selected-nonce' }],
    ['MC-03-T20', { consumed: true }],
  ])('%s: browser input cannot control authority state', async (_id, extra) => {
    const handler = new InspectDocumentHttpHandler({
      govern: async (governedRequest) => syntheticOutcome('DENIED', governedRequest.requestId),
    });
    const result = await handler.handle({
      requestId: request.requestId,
      toolName: INSPECT_DOCUMENT_ACTION,
      arguments: { documentId: DEMO_DOCUMENT_ID, ...extra },
      caller: request.caller,
      context: request.context,
    });

    expect(result).toEqual({
      error: 'BAD_REQUEST',
      reasonCode: 'INVALID_INSPECT_DOCUMENT_INVOCATION',
    });
  });

  it('MC-03-T21: failed live transport cannot obtain a synthetic replacement authority', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const handler = createProductionInspectDocumentHttpHandler({}, fetchImplementation);
    const result = await handler.handle({
      requestId: request.requestId,
      toolName: INSPECT_DOCUMENT_ACTION,
      arguments: request.parameters,
      caller: request.caller,
      context: request.context,
    });

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect('document' in result ? result.document : undefined).toBeUndefined();
  });

  it('MC-03-T22: restart persistence is explicitly outside the bounded in-memory store', () => {
    const expiresAtMs = Date.now() + 4_000;
    const first = new InMemoryAuthorityConsumptionStore();
    const restarted = new InMemoryAuthorityConsumptionStore();

    expect(first.claim('receipt-restart-limitation', expiresAtMs, Date.now()).accepted).toBe(true);
    expect(restarted.claim('receipt-restart-limitation', expiresAtMs, Date.now()).accepted).toBe(
      true,
    );
    expect(DEFAULT_AUTHORITY_CONSUMPTION_MAX_ENTRIES).toBe(1_024);
  });

  it('MC-03-T23: governed HTTP responses carry no-store cache semantics', () => {
    const headers = new Map<string, string>();
    setNoStoreResponseHeaders({
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    });

    expect(Object.fromEntries(headers)).toEqual({
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('MC-03-T24: denied responses contain no protected content', async () => {
    const read = vi.fn(async () => ({ documentId: DEMO_DOCUMENT_ID, content: canary }));
    const result = await new InspectDocumentService({
      mode: 'production',
      documentSource: { read },
    }).disclose(request, syntheticOutcome('DENIED', request.requestId));

    expect(result.document).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it('MC-03-T25: credentials and receipt material are absent from request URLs', async () => {
    const fetchImplementation = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });
    const transport = new AnankeFatesTransport({
      endpoint: 'http://127.0.0.1:3000/api/execute',
      token: 'test-secret',
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    await transport.send(request);

    const [url] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://127.0.0.1:3000/api/execute');
    expect(String(url)).not.toContain('?');
  });

  it('MC-03-T26: browser bundle/source still contains no fixture canary', () => {
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

  it('MC-03-T27: browser bundle/source still contains no Ananke credential', () => {
    const browserSource = collectFiles(join(process.cwd(), 'src'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(browserSource).not.toMatch(/ANANKE_MOIRAE_EXECUTION_TOKEN|Bearer |PRIVATE KEY/i);
  });

  it('MC-03-T28: historical Slice 02 authority remains unusable', async () => {
    const result = await disclose(
      tamper({
        canonicalAction: 'fates.slice02.inspect-fixed-fixture.v1',
        documentId: 'fates.slice02.fixed-fixture.v1',
      }),
    );

    expect(result.document).toBeUndefined();
  });

  it('MC-03-T29: the exact bytes hashed are the exact bytes returned', async () => {
    const bytes = new Uint8Array(readFileSync(fixturePath));
    const result = await disclose(freshOutcome(), request, {
      mode: 'production',
      documentSource: {
        read: async () => ({ documentId: DEMO_DOCUMENT_ID, content: 'ignored', bytes }),
      },
    });

    expect(result.hostDocumentReadCount).toBe(1);
    expect(result.document?.content).toBe(new TextDecoder().decode(bytes));
  });

  it('MC-03-T30: WebMCP discovery performs no authority issuance or resource read', () => {
    const govern = vi.fn();
    const adapter = createWebMcpAdapter({
      client: { govern },
      tools: [INSPECT_DOCUMENT_TOOL],
    });

    expect(adapter.discover()).toEqual([INSPECT_DOCUMENT_TOOL]);
    expect(govern).not.toHaveBeenCalled();
  });
});

function freshOutcome(): GovernanceOutcome {
  return authoritativeAllowedOutcome(request.requestId);
}

function tamper(patch: Partial<GovernanceEvidence>): GovernanceOutcome {
  const outcome = structuredClone(freshOutcome());
  return {
    ...outcome,
    evidence: { ...outcome.evidence, ...patch },
  };
}

async function disclose(
  outcome: GovernanceOutcome,
  governedRequest: GovernedRequest = request,
  options: ConstructorParameters<typeof InspectDocumentService>[0] = { mode: 'production' },
) {
  return new InspectDocumentService(options).disclose(governedRequest, outcome);
}

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}
