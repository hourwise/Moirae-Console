const ANANKE_AUTHORITY_CREDENTIAL_ENV_NAMES = [
  'ANANKE_MOIRAE_EXECUTION_TOKEN',
  'ANANKE_MOIRAE_PUBLISH_TOKEN',
  'ANANKE_MOIRAE_APPROVER_TOKEN',
  'ANANKE_MOIRAE_RESTRICTED_TOKEN',
] as const;

const CONSOLE_CREDENTIAL_ENV_NAMES = [
  ...ANANKE_AUTHORITY_CREDENTIAL_ENV_NAMES,
  'MOIRAE_OPERATOR_STEP_UP_SECRET',
] as const;

/**
 * Fails production composition when two distinct authority boundaries would
 * be represented by the same secret. Only environment variable names are
 * included in diagnostics; secret values never leave this comparison.
 */
export function assertSafeConsoleCredentialComposition(env: NodeJS.ProcessEnv): void {
  const configured = CONSOLE_CREDENTIAL_ENV_NAMES.flatMap((name) => {
    const value = env[name];
    return value === undefined ? [] : [[name, value] as const];
  });

  for (let index = 0; index < configured.length; index += 1) {
    const [leftName, leftValue] = configured[index]!;
    for (let otherIndex = index + 1; otherIndex < configured.length; otherIndex += 1) {
      const [rightName, rightValue] = configured[otherIndex]!;
      if (leftValue === rightValue) {
        throw new Error(
          `MOIRAE_AUTHORITY_CREDENTIAL_REUSE: ${leftName} and ${rightName} must be distinct`,
        );
      }
    }
  }
}
