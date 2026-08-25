import type { WebMcpToolDescriptor } from './types';

export const INSPECT_DOCUMENT_ACTION = 'inspect_document';
export const DEMO_DOCUMENT_ID = 'demo-policy-001';

export const INSPECT_DOCUMENT_TOOL: WebMcpToolDescriptor = Object.freeze({
  name: INSPECT_DOCUMENT_ACTION,
  description: 'Request governed, read-only inspection of the demonstration policy document.',
  inputSchema: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      documentId: Object.freeze({
        type: 'string',
        const: DEMO_DOCUMENT_ID,
      }),
    }),
    required: Object.freeze(['documentId']),
    additionalProperties: false,
  }),
});
