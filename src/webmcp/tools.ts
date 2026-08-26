import { INSPECT_DOCUMENT_TOOL } from './inspect-document';
import { PUBLISH_DOCUMENT_TOOL } from './publish-document';
import type { WebMcpToolDescriptor } from './types';

/** The deliberately bounded WebMCP surface: one read and one publication proposal. */
export const WEBMCP_TOOLS: readonly WebMcpToolDescriptor[] = Object.freeze([
  INSPECT_DOCUMENT_TOOL,
  PUBLISH_DOCUMENT_TOOL,
]);
