import { snapshotGovernedRequest } from './client';
import type { FatesClient } from './client';
import type { GovernanceOutcome, GovernedRequest } from './types';

/**
 * Deterministic test-only governance provider. Its evidence is intentionally
 * synthetic and must never be treated as a real Fates receipt.
 */
export class FakeFatesClient implements FatesClient {
  public readonly requests: GovernedRequest[] = [];

  public constructor(
    private readonly decide: (
      request: GovernedRequest,
    ) => GovernanceOutcome | Promise<GovernanceOutcome>,
  ) {}

  public async govern(request: GovernedRequest): Promise<GovernanceOutcome> {
    const snapshot = snapshotGovernedRequest(request);
    this.requests.push(snapshot);
    return this.decide(snapshot);
  }
}

export function syntheticEvidence(label: string) {
  return {
    evidenceId: `synthetic-evidence-${label}`,
    source: 'synthetic-test' as const,
    authority: 'synthetic' as const,
  };
}
