import { createFatesClient } from '../src/fates/client';
import type { FatesClient } from '../src/fates/client';
import type { CallerIdentity, RequestContext } from '../src/fates/types';
import type { InvalidInspectionRequest, InspectionResult } from '../src/inspection/types';
import type { InvalidPublicationRequest, PublicationResult } from '../src/publication/types';
import { DEMO_DOCUMENT_ID, INSPECT_DOCUMENT_ACTION } from '../src/webmcp/inspect-document';
import { PUBLISH_DOCUMENT_ACTION } from '../src/webmcp/publish-document';
import type { WebMcpInvocation } from '../src/webmcp/types';
import { createAnankeFatesTransportFromEnvironment } from './ananke-transport';
import { createAnankePublicationFatesTransportFromEnvironment } from './ananke-publication-transport';
import { governInspectDocumentInvocation, InspectDocumentService } from './inspect-document';
import { governPublishDocumentInvocation, PublishDocumentService } from './publish-document';
import { FixedFilePublicationStore, type PublicationStore } from './publication-store';

export type InspectDocumentHttpResult = InspectionResult | InvalidInspectionRequest;
export type PublishDocumentHttpResult = PublicationResult | InvalidPublicationRequest;

export class InspectDocumentHttpHandler {
  private readonly service: InspectDocumentService;
  private readonly client: FatesClient;

  public constructor(client?: FatesClient) {
    this.client = client ?? createProductionFatesClient();
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

export class PublishDocumentHttpHandler {
  private readonly service: PublishDocumentService;
  private readonly client: FatesClient;
  private readonly publicationStore: PublicationStore;

  public constructor(client?: FatesClient, publicationStore?: PublicationStore) {
    this.client = client ?? createProductionPublicationFatesClient();
    this.publicationStore = publicationStore ?? new FixedFilePublicationStore();
    this.service = new PublishDocumentService({
      mode: 'production',
      publicationStore: this.publicationStore,
    });
  }

  public async handle(payload: unknown): Promise<PublishDocumentHttpResult> {
    const invocation = parsePublishInvocation(payload);
    if (!invocation) {
      return {
        error: 'BAD_REQUEST',
        reasonCode: 'INVALID_PUBLISH_DOCUMENT_INVOCATION',
      };
    }

    const governed = await governPublishDocumentInvocation(this.client, invocation);
    return this.service.publish(governed.request, governed.outcome);
  }

  public async status(): Promise<Awaited<ReturnType<PublicationStore['status']>>> {
    return this.publicationStore.status();
  }
}

export function createProductionPublishDocumentHttpHandler(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): PublishDocumentHttpHandler {
  const store = new FixedFilePublicationStore({
    ...(env.MOIRAE_PUBLICATION_STORE_ROOT ? { rootPath: env.MOIRAE_PUBLICATION_STORE_ROOT } : {}),
  });
  return new PublishDocumentHttpHandler(
    createProductionPublicationFatesClient(env, fetchImplementation),
    store,
  );
}

export function createProductionInspectDocumentHttpHandler(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): InspectDocumentHttpHandler {
  return new InspectDocumentHttpHandler(createProductionFatesClient(env, fetchImplementation));
}

function createProductionFatesClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): FatesClient {
  const transport = createAnankeFatesTransportFromEnvironment(env, fetchImplementation);
  return transport
    ? createFatesClient({ environment: 'production', transport })
    : createFatesClient({ environment: 'production' });
}

function createProductionPublicationFatesClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): FatesClient {
  const transport = createAnankePublicationFatesTransportFromEnvironment(env, fetchImplementation);
  return transport
    ? createFatesClient({ environment: 'production', transport })
    : createFatesClient({ environment: 'production' });
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

function parsePublishInvocation(payload: unknown): WebMcpInvocation | undefined {
  if (!isRecord(payload)) return undefined;

  const requestId = stringValue(payload.requestId);
  const toolName = stringValue(payload.toolName);
  const caller = parseCaller(payload.caller);
  const context = parseContext(payload.context);
  if (!requestId || toolName !== PUBLISH_DOCUMENT_ACTION || !caller || !context) {
    return undefined;
  }
  if (!isBoundedPublicationArguments(payload.arguments)) return undefined;
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

function isBoundedPublicationArguments(value: unknown): value is Record<string, unknown> {
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
