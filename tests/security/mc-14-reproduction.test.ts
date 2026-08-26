import { createMoiraeProductionServer } from '../../server/production-host';
import { describe, expect, it } from 'vitest';

const pairs = [
  ['ANANKE_MOIRAE_EXECUTION_TOKEN', 'ANANKE_MOIRAE_PUBLISH_TOKEN'],
  ['ANANKE_MOIRAE_EXECUTION_TOKEN', 'ANANKE_MOIRAE_APPROVER_TOKEN'],
  ['ANANKE_MOIRAE_EXECUTION_TOKEN', 'ANANKE_MOIRAE_RESTRICTED_TOKEN'],
  ['ANANKE_MOIRAE_PUBLISH_TOKEN', 'ANANKE_MOIRAE_APPROVER_TOKEN'],
  ['ANANKE_MOIRAE_PUBLISH_TOKEN', 'ANANKE_MOIRAE_RESTRICTED_TOKEN'],
  ['ANANKE_MOIRAE_APPROVER_TOKEN', 'ANANKE_MOIRAE_RESTRICTED_TOKEN'],
  ['MOIRAE_OPERATOR_STEP_UP_SECRET', 'ANANKE_MOIRAE_EXECUTION_TOKEN'],
  ['MOIRAE_OPERATOR_STEP_UP_SECRET', 'ANANKE_MOIRAE_PUBLISH_TOKEN'],
  ['MOIRAE_OPERATOR_STEP_UP_SECRET', 'ANANKE_MOIRAE_APPROVER_TOKEN'],
  ['MOIRAE_OPERATOR_STEP_UP_SECRET', 'ANANKE_MOIRAE_RESTRICTED_TOKEN'],
] as const;

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    MOIRAE_ALLOWED_ORIGIN: 'https://console.example.test',
    MOIRAE_OPERATOR_STEP_UP_SECRET: 'mc14-operator-placeholder',
    ANANKE_MOIRAE_EXECUTION_TOKEN: 'mc14-inspection-placeholder',
    ANANKE_MOIRAE_PUBLISH_TOKEN: 'mc14-publication-placeholder',
    ANANKE_MOIRAE_APPROVER_TOKEN: 'mc14-approver-placeholder',
    ANANKE_MOIRAE_RESTRICTED_TOKEN: 'mc14-restricted-placeholder',
    ANANKE_MOIRAE_EXECUTION_URL: 'http://127.0.0.1:3000/api/execute',
  };
}

describe('MC-14 Console credential-composition controls', () => {
  it.each(pairs)('rejects %s and %s sharing a secret', (left, right) => {
    const env = baseEnvironment();
    env[right] = env[left];
    let error: unknown;
    try {
      createMoiraeProductionServer({ env });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('MOIRAE_AUTHORITY_CREDENTIAL_REUSE');
    expect((error as Error).message).toContain(left);
    expect((error as Error).message).toContain(right);
    expect((error as Error).message).not.toContain('placeholder');
  });

  it('accepts distinct service and operator secrets', () => {
    expect(() => createMoiraeProductionServer({ env: baseEnvironment() })).not.toThrow();
  });
});
