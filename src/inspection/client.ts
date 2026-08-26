import type { InspectionResult } from './types';
import { DEMO_DOCUMENT_ID, INSPECT_DOCUMENT_ACTION } from '../webmcp/inspect-document';

export async function requestInspectDocument(
  requestId = crypto.randomUUID(),
): Promise<InspectionResult> {
  const response = await fetch('/api/inspect-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      toolName: INSPECT_DOCUMENT_ACTION,
      arguments: { documentId: DEMO_DOCUMENT_ID },
      caller: {
        kind: 'browser',
        id: 'moirae-console-browser',
      },
      context: {
        source: 'webmcp',
        purpose: 'mc-01-demonstration',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`INSPECT_DOCUMENT_HTTP_${response.status}`);
  }

  return (await response.json()) as InspectionResult;
}
