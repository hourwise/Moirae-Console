import type { PublicationResult, PublicationStatusSnapshot } from './types';
import { DEMO_DOCUMENT_ID } from '../webmcp/inspect-document';
import { PUBLISH_DOCUMENT_ACTION } from '../webmcp/publish-document';

export type PublicationApprovalDecision = 'APPROVE' | 'REJECT';

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

/** Requests only the fixed host-side MC-06 restricted-agent scenario. */
export async function requestPublicationDenyDemo(): Promise<PublicationResult> {
  const response = await fetch('/api/publish-document/deny-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error(`PUBLISH_DOCUMENT_DENY_DEMO_HTTP_${response.status}`);
  }

  return (await response.json()) as PublicationResult;
}

export async function decidePublicationApproval(
  approvalHandle: string,
  decision: PublicationApprovalDecision,
  operatorProof: string,
): Promise<PublicationResult> {
  const response = await fetch('/api/publish-document/approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalHandle, decision, operatorProof }),
  });

  if (!response.ok) {
    throw new Error(`PUBLISH_DOCUMENT_APPROVAL_HTTP_${response.status}`);
  }

  return (await response.json()) as PublicationResult;
}
