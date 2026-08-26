import type { PublicationResult, PublicationStatusSnapshot } from './types';
import { DEMO_DOCUMENT_ID } from '../webmcp/inspect-document';
import { PUBLISH_DOCUMENT_ACTION } from '../webmcp/publish-document';

export async function requestPublishDocument(
  requestId = crypto.randomUUID(),
): Promise<PublicationResult> {
  const response = await fetch('/api/publish-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      toolName: PUBLISH_DOCUMENT_ACTION,
      arguments: { documentId: DEMO_DOCUMENT_ID },
      caller: {
        kind: 'browser',
        id: 'moirae-console-browser',
      },
      context: {
        source: 'webmcp',
        purpose: 'mc-04-demonstration',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`PUBLISH_DOCUMENT_HTTP_${response.status}`);
  }

  return (await response.json()) as PublicationResult;
}

export async function requestPublicationStatus(): Promise<PublicationStatusSnapshot> {
  const response = await fetch('/api/publish-document/status', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`PUBLICATION_STATUS_HTTP_${response.status}`);
  }
  return (await response.json()) as PublicationStatusSnapshot;
}
