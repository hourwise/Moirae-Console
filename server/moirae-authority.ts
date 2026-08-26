import { DEMO_DOCUMENT_ID } from '../src/webmcp/inspect-document';

export const MOIRAE_FATES_ACTION = 'fates.moirae.inspect-document.v1';
export const MOIRAE_FATES_EXPECTED_SHA256 =
  'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c';
/** Pin the canonical digest returned by Ananke for the fixed argument object. */
export const MOIRAE_FATES_CANONICAL_REQUEST_DIGEST =
  '2d02cda936b415d60f700ef3b2ac1d44c8df8a5a90e229be1cc5b32c02fe3ab0';
export const MOIRAE_FATES_PURPOSE = 'moirae.document-inspection';

export const MOIRAE_AUTHORITY_BINDING = Object.freeze({
  canonicalAction: MOIRAE_FATES_ACTION,
  documentId: DEMO_DOCUMENT_ID,
  expectedSha256: MOIRAE_FATES_EXPECTED_SHA256,
  purpose: MOIRAE_FATES_PURPOSE,
});
