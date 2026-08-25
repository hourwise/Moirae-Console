import { describe, expect, it, vi } from 'vitest';

import { createWebMcpAdapter } from '../../src/webmcp/adapter';
import type { FatesClient } from '../../src/fates/client';
import { syntheticOutcome, request } from '../helpers';

const tools = [
  {
    name: 'inspect_document',
    description: 'Inspect a document through governed read-only access.',
    inputSchema: { type: 'object' },
  },
];

describe('WebMCP inbound boundary', () => {
  it('MC-00-T01: forwards an invocation to Fates without executing a side effect', async () => {
    const govern = vi.fn<FatesClient['govern']>(async () => syntheticOutcome('DENIED'));
    const client: FatesClient = { govern };
    const sideEffect = vi.fn();
    const adapter = createWebMcpAdapter({ client, tools });

    const outcome = await adapter.invoke({
      requestId: request.requestId,
      toolName: 'inspect_document',
      arguments: request.parameters as Record<string, unknown>,
      caller: request.caller,
      context: request.context,
    });

    expect(outcome.status).toBe('DENIED');
    expect(govern).toHaveBeenCalledOnce();
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('MC-00-T02: discovery does not produce an ALLOW result', () => {
    const govern = vi.fn<FatesClient['govern']>(async () => syntheticOutcome('ALLOWED'));
    const adapter = createWebMcpAdapter({ client: { govern }, tools });

    expect(adapter.discover()).toHaveLength(1);
    expect(govern).not.toHaveBeenCalled();
  });

  it('MC-00-T09: snapshots caller parameters before crossing the boundary', async () => {
    const govern = vi.fn<FatesClient['govern']>(async () => syntheticOutcome('DENIED'));
    const adapter = createWebMcpAdapter({ client: { govern }, tools });
    const argumentsValue = {
      documentId: 'document-test-001',
      options: { includeMetadata: true },
    };

    const result = adapter.invoke({
      requestId: request.requestId,
      toolName: 'inspect_document',
      arguments: argumentsValue,
      caller: request.caller,
      context: request.context,
    });
    argumentsValue.options.includeMetadata = false;

    await result;
    const governedRequest = govern.mock.calls[0]?.[0];
    expect(governedRequest?.parameters).toEqual({
      documentId: 'document-test-001',
      options: { includeMetadata: true },
    });
    expect(Object.isFrozen(governedRequest?.parameters)).toBe(true);
  });
});
