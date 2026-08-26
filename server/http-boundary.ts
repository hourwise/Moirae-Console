import type { IncomingMessage, ServerResponse } from 'node:http';

import type { InspectDocumentHttpHandler, PublishDocumentHttpHandler } from './http-handler';
import { setNoStoreResponseHeaders } from './http-response';

export interface MoiraeHttpBoundaryHandlers {
  readonly inspectHandler: InspectDocumentHttpHandler;
  readonly publicationHandler: PublishDocumentHttpHandler;
}

/** Handles only the bounded same-origin Console API. */
export async function handleMoiraeApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  handlers: MoiraeHttpBoundaryHandlers,
): Promise<boolean> {
  const pathname = decodePathname(request.url);

  if (pathname === '/api/inspect-document') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    return readJsonBody(request)
      .then((payload) => handlers.inspectHandler.handle(payload))
      .then((result) => sendJson(response, result))
      .catch(() => sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_JSON' }, 400))
      .then(() => true);
  }

  if (pathname === '/api/publish-document/status') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
    return handlers.publicationHandler
      .status()
      .then((result) => sendJson(response, result))
      .catch(() => sendJson(response, { error: 'PUBLICATION_STATUS_UNAVAILABLE' }, 503))
      .then(() => true);
  }

  if (pathname === '/api/publish-document/approval') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    return readJsonBody(request)
      .then((payload) => handlers.publicationHandler.decideApproval(payload))
      .then((result) => sendJson(response, result))
      .catch(() => sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_JSON' }, 400))
      .then(() => true);
  }

  if (pathname === '/api/publish-document/deny-demo') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    return readJsonBody(request)
      .then((payload) => {
        if (!isEmptyObject(payload)) throw new Error('INVALID_DENY_DEMO_REQUEST');
        return handlers.publicationHandler.denyDemo();
      })
      .then((result) => sendJson(response, result))
      .catch(() =>
        sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_DENY_DEMO_REQUEST' }, 400),
      )
      .then(() => true);
  }

  if (pathname === '/api/publish-document') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    return readJsonBody(request)
      .then((payload) => handlers.publicationHandler.handle(payload))
      .then((result) => sendJson(response, result))
      .catch(() => sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_JSON' }, 400))
      .then(() => true);
  }

  return false;
}

export function isHostOnlyPath(pathname: string): boolean {
  const normalized = pathname.replaceAll('\\', '/');
  return (
    normalized === '/server' ||
    normalized.startsWith('/server/') ||
    (normalized.startsWith('/@fs/') && normalized.includes('/server/'))
  );
}

export function decodePathname(url: string | undefined): string {
  try {
    return decodeURIComponent(new URL(url ?? '/', 'http://localhost').pathname);
  } catch {
    return '';
  }
}

export function sendJson(response: ServerResponse, payload: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  setNoStoreResponseHeaders(response);
  response.end(JSON.stringify(payload));
}

function methodNotAllowed(response: ServerResponse, method: string): true {
  response.statusCode = 405;
  response.setHeader('Allow', method);
  setNoStoreResponseHeaders(response);
  response.end();
  return true;
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;

    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 64 * 1024) {
        reject(new Error('REQUEST_TOO_LARGE'));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    request.on('error', reject);
  });
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
