import { describe, expect, it } from 'vitest';

import { registerWebMcpTools, type BrowserModelContextTool } from '../../src/webmcp/browser';

describe('MC-07 imperative WebMCP registration', () => {
  it('registers exactly the two bounded tools on the supplied model context', async () => {
    const registered: BrowserModelContextTool[] = [];
    const modelContext = {
      registerTool(tool: BrowserModelContextTool) {
        registered.push(tool);
      },
    };

    const result = await registerWebMcpTools(modelContext);

    expect(result).toEqual({
      state: 'REGISTERED',
      toolNames: ['inspect_document', 'publish_document'],
    });
    expect(registered.map((tool) => tool.name)).toEqual(['inspect_document', 'publish_document']);
    expect(registered.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(registered.find((tool) => tool.name === 'inspect_document')?.annotations).toEqual({
      readOnlyHint: true,
    });
  });

  it('fails closed when the current browser has no document model context', async () => {
    const result = await registerWebMcpTools(undefined);

    expect(result.state).toBe('UNAVAILABLE');
    expect(result.toolNames).toEqual([]);
  });
});
