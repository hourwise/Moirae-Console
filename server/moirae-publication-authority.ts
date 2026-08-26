import { createHash } from 'node:crypto';

import { DEMO_DOCUMENT_ID } from '../src/webmcp/inspect-document';

export const MOIRAE_PUBLICATION_FATES_ACTION = 'fates.moirae.publish-document.v1';
export const MOIRAE_PUBLICATION_DESTINATION_ID = 'moirae.demo-publication-slot.v1';
export const MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256 =
  'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c';
export const MOIRAE_PUBLICATION_FATES_PURPOSE = 'moirae.document-publication';
export const MOIRAE_PUBLICATION_POLICY_VERSION = 'builtin:0.1.0';
export const MOIRAE_PUBLICATION_TTL_MS = 5_000;
export const MOIRAE_PUBLICATION_MAX_LIFETIME_MS = 10_000;

export const MOIRAE_PUBLICATION_AUTHORITY_BINDING = Object.freeze({
  canonicalAction: MOIRAE_PUBLICATION_FATES_ACTION,
  documentId: DEMO_DOCUMENT_ID,
  expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
  destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
  purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
});

export interface MoiraePublicationReceiptDigestInput {
  readonly documentId: string;
  readonly expectedSha256: string;
  readonly destinationId: string;
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
 * Digest integrity only. This is not a signature; provenance remains bound
 * to the authenticated Ananke transport as documented by MC-03.
 */
export function calculateMoiraePublicationAuthorityReceiptDigest(
  input: MoiraePublicationReceiptDigestInput,
): string {
  return createHash('sha256')
    .update(canonicalJson({ action: MOIRAE_PUBLICATION_FATES_ACTION, ...input }))
    .digest('hex');
}

export function calculateMoiraePublicationRequestDigest(input: {
  readonly documentId: string;
  readonly expectedSha256: string;
  readonly destinationId: string;
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

/**
 * Recomputes the canonical Ananke authority binding for the fixed publication
 * contract. This is an independent Console check; it is not a comparison of
 * one response field with another response field.
 */
export function calculateMoiraePublicationAuthorityBindingDigest(input: {
  readonly requestId: string;
  readonly policyVersion: string;
}): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        action: MOIRAE_PUBLICATION_FATES_ACTION,
        arguments: {
          documentId: DEMO_DOCUMENT_ID,
          expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
          destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
        },
        authenticatedPrincipal: { id: 'moirae-console-host', kind: 'service' },
        actingPrincipal: { id: 'moirae-document-publication-agent', kind: 'agent' },
        resourceScope: {
          mode: 'bounded',
          resourceType: 'document',
          resourceIds: [DEMO_DOCUMENT_ID],
          operations: ['publish'],
          providerNamespace: MOIRAE_PUBLICATION_DESTINATION_ID,
        },
        purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
        policyVersion: input.policyVersion,
        correlationId: input.requestId,
      }),
    )
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
  throw new TypeError('Unsupported publication receipt digest value');
}
