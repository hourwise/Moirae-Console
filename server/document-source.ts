import { readFile } from 'node:fs/promises';

import { DEMO_DOCUMENT_ID } from '../src/webmcp/inspect-document';
import type { DisclosedDocument } from '../src/inspection/types';

const FIXED_DOCUMENTS = {
  [DEMO_DOCUMENT_ID]: new URL('./fixtures/demo-policy-001.txt', import.meta.url),
} as const;

export interface HostDocumentSource {
  read(documentId: string): Promise<DisclosedDocument>;
}

export class FixedDemoDocumentSource implements HostDocumentSource {
  public async read(documentId: string): Promise<DisclosedDocument> {
    const fixtureUrl = FIXED_DOCUMENTS[documentId as keyof typeof FIXED_DOCUMENTS];
    if (!fixtureUrl) {
      throw new Error('DOCUMENT_NOT_REGISTERED');
    }

    return {
      documentId,
      content: await readFile(fixtureUrl, 'utf8'),
    };
  }
}
