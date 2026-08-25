import { failedOutcome, isAuthoritativeAllow, snapshotGovernedRequest } from '../fates/client';
import type { FatesClient } from '../fates/client';
import type { GovernanceOutcome, GovernedRequest } from '../fates/types';

export type GovernanceDisplayState =
  'IDLE' | 'ALLOWED' | 'REQUIRES_APPROVAL' | 'DENIED' | 'QUARANTINED' | 'ERROR';

export interface GovernanceView {
  readonly displayState: GovernanceDisplayState;
  readonly outcome: GovernanceOutcome | null;
  readonly evidenceLabel: 'AUTHORITATIVE' | 'SYNTHETIC_TEST_ONLY' | 'UNVERIFIED' | 'NONE';
  readonly executionState: 'NOT_IMPLEMENTED';
  readonly presentationState: 'default' | 'expanded';
}

export interface GovernanceAttempt {
  readonly request: GovernedRequest;
  readonly outcome: GovernanceOutcome;
  readonly view: GovernanceView;
}

export async function requestGovernance(
  client: FatesClient,
  request: GovernedRequest,
): Promise<GovernanceAttempt> {
  const snapshot = snapshotGovernedRequest(request);
  let outcome: GovernanceOutcome;

  try {
    outcome = await client.govern(snapshot);
  } catch (error) {
    outcome = failedOutcome(snapshot.requestId, error);
  }

  return {
    request: snapshot,
    outcome,
    view: deriveGovernanceView(outcome),
  };
}

export function deriveGovernanceView(outcome: GovernanceOutcome): GovernanceView {
  const evidenceLabel = evidenceLabelFor(outcome);

  switch (outcome.status) {
    case 'ALLOWED':
      return {
        displayState: 'ALLOWED',
        outcome,
        evidenceLabel,
        executionState: 'NOT_IMPLEMENTED',
        presentationState: 'default',
      };
    case 'REQUIRES_APPROVAL':
      return {
        displayState: 'REQUIRES_APPROVAL',
        outcome,
        evidenceLabel,
        executionState: 'NOT_IMPLEMENTED',
        presentationState: 'default',
      };
    case 'DENIED':
      return {
        displayState: 'DENIED',
        outcome,
        evidenceLabel,
        executionState: 'NOT_IMPLEMENTED',
        presentationState: 'default',
      };
    case 'QUARANTINED':
      return {
        displayState: 'QUARANTINED',
        outcome,
        evidenceLabel,
        executionState: 'NOT_IMPLEMENTED',
        presentationState: 'default',
      };
    case 'FAILED':
    case 'UNKNOWN':
      return {
        displayState: 'ERROR',
        outcome,
        evidenceLabel,
        executionState: 'NOT_IMPLEMENTED',
        presentationState: 'default',
      };
  }
}

/** Local presentation can change layout, never authority or the stored outcome. */
export function setPresentationState(
  view: GovernanceView,
  presentationState: GovernanceView['presentationState'],
): GovernanceView {
  return { ...view, presentationState };
}

/**
 * MC-00 intentionally exposes no effect executor. This predicate is for a
 * future bounded server/runtime adapter and is not a permission granted by UI
 * state or WebMCP discovery.
 */
export function isReadyForFutureGovernedExecution(outcome: GovernanceOutcome): boolean {
  return isAuthoritativeAllow(outcome);
}

function evidenceLabelFor(outcome: GovernanceOutcome): GovernanceView['evidenceLabel'] {
  if (outcome.evidence.authority === 'authoritative' && outcome.evidence.source === 'fates') {
    return 'AUTHORITATIVE';
  }
  if (outcome.evidence.authority === 'synthetic') {
    return 'SYNTHETIC_TEST_ONLY';
  }
  return 'UNVERIFIED';
}
