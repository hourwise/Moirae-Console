import type { GovernanceOutcome, GovernedRequest } from '../fates/types';

export type PublicationLifecyclePhaseName =
  'REQUESTED' | 'IDENTIFIED' | 'FATES GOVERNANCE' | 'ALLOWED' | 'HOST EXECUTION' | 'PUBLISHED';

export type PublicationLifecyclePhaseSource =
  'local-observed' | 'fates-authoritative' | 'host-executed' | 'synthetic-test-only';

export interface PublicationLifecyclePhase {
  readonly name: PublicationLifecyclePhaseName;
  readonly source: PublicationLifecyclePhaseSource;
  readonly evidenceId?: string;
}

export interface PublicationResult {
  readonly request: GovernedRequest;
  readonly outcome: GovernanceOutcome;
  readonly phases: readonly PublicationLifecyclePhase[];
  readonly publication: {
    readonly state: 'PUBLISHED' | 'NOT_PUBLISHED';
    readonly evidenceMode: 'AUTHORITATIVE' | 'SYNTHETIC_TEST_ONLY' | 'UNVERIFIED';
    readonly reasonCode?: string;
    readonly destinationId: string;
    readonly hostPublicationState?: 'PUBLISHED' | 'ALREADY_PUBLISHED';
    readonly hostPublicationExecutorInvocationCount?: number;
  };
}

export interface InvalidPublicationRequest {
  readonly error: 'BAD_REQUEST';
  readonly reasonCode: string;
}

export interface PublicationStatusSnapshot {
  readonly published: boolean;
  readonly documentId: string;
  readonly destinationId: string;
  readonly sha256?: string;
  readonly publishedAt?: string;
  readonly executorInvocationCount: number;
}
