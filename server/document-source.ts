import { readFile } from 'node:fs/promises';

import { DEMO_DOCUMENT_ID } from '../src/webmcp/inspect-document';
import type { DisclosedDocument } from '../src/inspection/types';

const FIXED_DOCUMENTS = {
  [DEMO_DOCUMENT_ID]: new URL('./fixtures/demo-policy-001.txt', import.meta.url),
} as const;

export interface HostDocumentRead extends DisclosedDocument {
  /** The exact bytes that will be hashed and then converted into the response body. */
  readonly bytes?: Uint8Array;
}

export interface HostDocumentSource {
  read(documentId: string): Promise<HostDocumentRead>;
}

export class FixedDemoDocumentSource implements HostDocumentSource {
  public async read(documentId: string): Promise<HostDocumentRead> {
    const fixtureUrl = FIXED_DOCUMENTS[documentId as keyof typeof FIXED_DOCUMENTS];
    if (!fixtureUrl) {
      throw new Error('DOCUMENT_NOT_REGISTERED');
    }

    const bytes = await readFile(fixtureUrl);
    return {
      documentId,
      content: bytes.toString('utf8'),
      bytes,
    };
  }
}
