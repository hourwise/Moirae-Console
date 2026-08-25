import { createFatesClient } from '../src/fates/client';
import type { CallerIdentity, RequestContext } from '../src/fates/types';
import type { InvalidInspectionRequest, InspectionResult } from '../src/inspection/types';
import { DEMO_DOCUMENT_ID, INSPECT_DOCUMENT_ACTION } from '../src/webmcp/inspect-document';
import type { WebMcpInvocation } from '../src/webmcp/types';
import { governInspectDocumentInvocation, InspectDocumentService } from './inspect-document';

export type InspectDocumentHttpResult = InspectionResult | InvalidInspectionRequest;

export class InspectDocumentHttpHandler {
  private readonly service: InspectDocumentService;

  public constructor(private readonly client = createFatesClient({ environment: 'production' })) {
    this.service = new InspectDocumentService({ mode: 'production' });
  }

  public async handle(payload: unknown): Promise<InspectDocumentHttpResult> {
    const invocation = parseInvocation(payload);
    if (!invocation) {
      return {
        error: 'BAD_REQUEST',
        reasonCode: 'INVALID_INSPECT_DOCUMENT_INVOCATION',
      };
    }

    const governed = await governInspectDocumentInvocation(this.client, invocation);
    return this.service.disclose(governed.request, governed.outcome);
  }
}

export function createProductionInspectDocumentHttpHandler(): InspectDocumentHttpHandler {
  return new InspectDocumentHttpHandler();
}

function parseInvocation(payload: unknown): WebMcpInvocation | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const requestId = stringValue(payload.requestId);
  const toolName = stringValue(payload.toolName);
  const caller = parseCaller(payload.caller);
  const context = parseContext(payload.context);
  if (!requestId || toolName !== INSPECT_DOCUMENT_ACTION || !caller || !context) {
    return undefined;
  }

  if (!isBoundedArguments(payload.arguments)) {
    return undefined;
  }

  return {
    requestId,
    toolName,
    arguments: payload.arguments,
    caller,
    context,
  };
}

function isBoundedArguments(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    Object.keys(value)[0] === 'documentId' &&
    value.documentId === DEMO_DOCUMENT_ID
  );
}

function parseCaller(value: unknown): CallerIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = value.kind;
  const id = stringValue(value.id);
  const sessionId = stringValue(value.sessionId);
  if ((kind !== 'agent' && kind !== 'browser' && kind !== 'human' && kind !== 'service') || !id) {
    return undefined;
  }
  return { kind, id, ...(sessionId ? { sessionId } : {}) };
}

function parseContext(value: unknown): RequestContext | undefined {
  if (!isRecord(value) || value.source !== 'webmcp') {
    return undefined;
  }
  const tenantId = stringValue(value.tenantId);
  const workspaceId = stringValue(value.workspaceId);
  const purpose = stringValue(value.purpose);
  return {
    source: 'webmcp',
    ...(tenantId ? { tenantId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(purpose ? { purpose } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
