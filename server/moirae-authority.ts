import { createHash } from 'node:crypto';

import { DEMO_DOCUMENT_ID } from '../src/webmcp/inspect-document';

export const MOIRAE_FATES_ACTION = 'fates.moirae.inspect-document.v1';
export const MOIRAE_FATES_EXPECTED_SHA256 =
  'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c';
/** Pin the canonical digest returned by Ananke for the fixed argument object. */
export const MOIRAE_FATES_CANONICAL_REQUEST_DIGEST =
  '2d02cda936b415d60f700ef3b2ac1d44c8df8a5a90e229be1cc5b32c02fe3ab0';
export const MOIRAE_FATES_PURPOSE = 'moirae.document-inspection';
export const MOIRAE_AUTHORITY_TTL_MS = 5_000;
export const MOIRAE_AUTHORITY_MAX_LIFETIME_MS = 10_000;

export const MOIRAE_AUTHORITY_BINDING = Object.freeze({
  canonicalAction: MOIRAE_FATES_ACTION,
  documentId: DEMO_DOCUMENT_ID,
  expectedSha256: MOIRAE_FATES_EXPECTED_SHA256,
  purpose: MOIRAE_FATES_PURPOSE,
});

export interface MoiraeAuthorityReceiptDigestInput {
  readonly documentId: string;
  readonly expectedSha256: string;
  readonly purpose: string;
  readonly fatesRequestId: string;
  readonly correlationId: string;
  readonly canonicalRequestDigest: string;
  readonly authorityBindingDigest: string;
  readonly policyVersion: string;
  readonly decisionId: string;
  readonly outcomeId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly receiptId: string;
  readonly nonce: string;
}

/**
 * Canonical cross-field integrity digest for the authority-only receipt.
 * This is not a signature; the current guarantee remains authenticated,
 * transport-bound authority as documented in FATES_BOUNDARY.md.
 */
export function calculateMoiraeAuthorityReceiptDigest(
  input: MoiraeAuthorityReceiptDigestInput,
): string {
  return createHash('sha256')
    .update(canonicalJson({ action: MOIRAE_FATES_ACTION, ...input }))
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new TypeError('Unsupported receipt digest value');
}
