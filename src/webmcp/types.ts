import type { CallerIdentity, GovernanceOutcome, RequestContext } from '../fates/types';

export interface WebMcpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface WebMcpInvocation {
  readonly requestId: string;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly caller: CallerIdentity;
  readonly context: RequestContext;
}

export interface WebMcpAdapter {
  discover(): readonly WebMcpToolDescriptor[];
  invoke(invocation: WebMcpInvocation): Promise<GovernanceOutcome>;
}
