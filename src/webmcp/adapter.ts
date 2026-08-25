import { snapshotGovernedRequest, unknownOutcome } from '../fates/client';
import type { FatesClient } from '../fates/client';
import type { GovernedRequest } from '../fates/types';
import type { WebMcpAdapter, WebMcpInvocation, WebMcpToolDescriptor } from './types';

export interface WebMcpAdapterConfiguration {
  readonly client: FatesClient;
  readonly tools: readonly WebMcpToolDescriptor[];
}

/**
 * Inbound-only WebMCP adapter. It discovers metadata and forwards validated
 * proposals to the Console Fates boundary. It has no side-effect callback.
 */
export function createWebMcpAdapter(configuration: WebMcpAdapterConfiguration): WebMcpAdapter {
  const descriptors = configuration.tools.map((tool) => Object.freeze({ ...tool }));

  return {
    discover(): readonly WebMcpToolDescriptor[] {
      return descriptors;
    },

    async invoke(invocation: WebMcpInvocation) {
      const descriptor = descriptors.find((tool) => tool.name === invocation.toolName);
      if (!descriptor) {
        return unknownOutcome(invocation.requestId, 'WEBMCP_TOOL_NOT_REGISTERED');
      }

      const request: GovernedRequest = snapshotGovernedRequest({
        requestId: invocation.requestId,
        caller: invocation.caller,
        action: descriptor.name,
        parameters: invocation.arguments,
        context: invocation.context,
      });

      return configuration.client.govern(request);
    },
  };
}
