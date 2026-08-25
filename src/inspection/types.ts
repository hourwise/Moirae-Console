import type { GovernanceOutcome, GovernedRequest } from '../fates/types';

export type LifecyclePhaseName = 'REQUESTED' | 'IDENTIFIED' | 'PREFLIGHT' | 'ADMITTED' | 'EXECUTED';

export type LifecyclePhaseSource =
  'local-observed' | 'fates-authoritative' | 'synthetic-test-only' | 'host-executed';

export interface LifecyclePhase {
  readonly name: LifecyclePhaseName;
  readonly source: LifecyclePhaseSource;
  readonly evidenceId?: string;
}

export interface DisclosedDocument {
  readonly documentId: string;
  readonly content: string;
}

export interface InspectionResult {
  readonly request: GovernedRequest;
  readonly outcome: GovernanceOutcome;
  readonly phases: readonly LifecyclePhase[];
  readonly disclosure: {
    readonly state: 'DISCLOSED' | 'NOT_DISCLOSED';
    readonly evidenceMode: 'AUTHORITATIVE' | 'SYNTHETIC_TEST_ONLY' | 'UNVERIFIED';
    readonly reasonCode?: string;
  };
  readonly document?: DisclosedDocument;
}

export interface InvalidInspectionRequest {
  readonly error: 'BAD_REQUEST';
  readonly reasonCode: string;
}
