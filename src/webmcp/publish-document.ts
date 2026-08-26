import type { WebMcpToolDescriptor } from './types';
import { DEMO_DOCUMENT_ID } from './inspect-document';

export const PUBLISH_DOCUMENT_ACTION = 'publish_document';

export const PUBLISH_DOCUMENT_TOOL: WebMcpToolDescriptor = Object.freeze({
  name: PUBLISH_DOCUMENT_ACTION,
  description: 'Request governed publication of the fixed demonstration policy document.',
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
