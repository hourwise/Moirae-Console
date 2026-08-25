import { describe, expect, it, vi } from 'vitest';

import { createFatesClient, parseFatesOutcome } from '../../src/fates/client';
import { FakeFatesClient } from '../../src/fates/fake-client';
import {
  deriveGovernanceView,
  isReadyForFutureGovernedExecution,
  requestGovernance,
  setPresentationState,
} from '../../src/governance/view-model';
import { authoritativeAllowedOutcome, request, syntheticOutcome } from '../helpers';

describe('fail-closed governance view model', () => {
  it('MC-00-T03: displays ALLOWED only from the returned governance outcome', () => {
    const outcome = authoritativeAllowedOutcome();
    const view = deriveGovernanceView(outcome);

    expect(view.displayState).toBe('ALLOWED');
    expect(view.outcome).toBe(outcome);
    expect(view.evidenceLabel).toBe('AUTHORITATIVE');
  });

  it('MC-00-T04: DENY is displayed and cannot execute', async () => {
    const sideEffect = vi.fn();
    const client = new FakeFatesClient(async () => syntheticOutcome('DENIED'));
    const attempt = await requestGovernance(client, request);

    expect(attempt.view.displayState).toBe('DENIED');
    expect(attempt.view.executionState).toBe('NOT_IMPLEMENTED');
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('MC-00-T05: QUARANTINED is displayed and cannot execute', async () => {
    const sideEffect = vi.fn();
    const client = new FakeFatesClient(async () => syntheticOutcome('QUARANTINED'));
    const attempt = await requestGovernance(client, request);

    expect(attempt.view.displayState).toBe('QUARANTINED');
    expect(attempt.view.executionState).toBe('NOT_IMPLEMENTED');
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('MC-00-T06: maps malformed or unrecognised responses to UNKNOWN/ERROR', async () => {
    const parsed = parseFatesOutcome(
      {
        requestId: request.requestId,
        outcomeId: 'fates-outcome-malformed-test',
        status: 'SOMETHING_NEW',
        evidence: {
          evidenceId: 'fates-evidence-malformed-test',
          receiptId: 'fates-receipt-malformed-test',
          decisionDigest: 'fates-digest-malformed-test',
        },
      },
      request.requestId,
    );
    const attempt = await requestGovernance({ govern: async () => parsed }, request);

    expect(parsed.status).toBe('UNKNOWN');
    expect(attempt.view.displayState).toBe('ERROR');
    expect(attempt.view.executionState).toBe('NOT_IMPLEMENTED');
  });

  it('MC-00-T07: Fates unavailability becomes an error with no effect', async () => {
    const client = createFatesClient({ environment: 'production' });
    const attempt = await requestGovernance(client, request);

    expect(attempt.outcome.status).toBe('FAILED');
    expect(attempt.view.displayState).toBe('ERROR');
    expect(attempt.view.evidenceLabel).toBe('UNVERIFIED');
  });

  it('MC-00-T08: production configuration never falls back to the fake provider', async () => {
    const fake = new FakeFatesClient(async () => syntheticOutcome('ALLOWED'));
    const production = createFatesClient({ environment: 'production' });
    const attempt = await requestGovernance(production, request);

    expect(attempt.outcome.status).toBe('FAILED');
    expect(attempt.view.evidenceLabel).not.toBe('SYNTHETIC_TEST_ONLY');
    expect(fake.requests).toHaveLength(0);
  });

  it('MC-00-T10: presentation state cannot change the authoritative decision', () => {
    const view = deriveGovernanceView({
      ...authoritativeAllowedOutcome(),
      requestId: request.requestId,
    });
    const expanded = setPresentationState(view, 'expanded');

    expect(expanded.presentationState).toBe('expanded');
    expect(expanded.displayState).toBe('ALLOWED');
    expect(expanded.outcome).toBe(view.outcome);
  });

  it('MC-00-T11: synthetic evidence is visibly test-only and not executable authority', () => {
    const outcome = syntheticOutcome('ALLOWED');
    const view = deriveGovernanceView(outcome);

    expect(view.evidenceLabel).toBe('SYNTHETIC_TEST_ONLY');
    expect(isReadyForFutureGovernedExecution(outcome)).toBe(false);
  });
});
