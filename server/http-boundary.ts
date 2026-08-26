import type { IncomingMessage, ServerResponse } from 'node:http';

import type { InspectDocumentHttpHandler, PublishDocumentHttpHandler } from './http-handler';
import { setNoStoreResponseHeaders } from './http-response';

export interface MoiraeHttpBoundarySecurity {
  /** Explicit public origin for production. Never derive this from a browser body. */
  readonly trustedOrigin?: string;
  /** Require a same-origin proof on every POST boundary. */
  readonly requireTrustedOrigin?: boolean;
  /** Development-only fallback to the request host when no origin is configured. */
  readonly allowHostDerivedOrigin?: boolean;
}

export interface MoiraeHttpBoundaryHandlers {
  readonly inspectHandler: InspectDocumentHttpHandler;
  readonly publicationHandler: PublishDocumentHttpHandler;
}

/** Handles only the bounded same-origin Console API. */
export async function handleMoiraeApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  handlers: MoiraeHttpBoundaryHandlers,
  security: MoiraeHttpBoundarySecurity = {},
): Promise<boolean> {
  const pathname = decodePathname(request.url);

  if (pathname === '/api/inspect-document') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    if (rejectUnsafePost(request, response, security)) return true;
    return readJsonBody(request)
      .then((payload) => handlers.inspectHandler.handle(payload))
      .then((result) => sendJson(response, result, statusForResult(result)))
      .catch(() => sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_JSON' }, 400))
      .then(() => true);
  }

  if (pathname === '/api/publish-document/status') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
    if (rejectUntrustedOriginIfPresent(request, response, security)) return true;
    return handlers.publicationHandler
      .status()
      .then((result) => sendJson(response, result))
      .catch(() => sendJson(response, { error: 'PUBLICATION_STATUS_UNAVAILABLE' }, 503))
      .then(() => true);
  }

  if (pathname === '/api/publish-document/approval') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    if (rejectUnsafePost(request, response, security)) return true;
    return readJsonBody(request)
      .then((payload) => handlers.publicationHandler.decideApproval(payload))
      .then((result) => sendJson(response, result, statusForResult(result)))
      .catch(() => sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_JSON' }, 400))
      .then(() => true);
  }

  if (pathname === '/api/publish-document/deny-demo') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    if (rejectUnsafePost(request, response, security)) return true;
    return readJsonBody(request)
      .then((payload) => {
        if (!isEmptyObject(payload)) throw new Error('INVALID_DENY_DEMO_REQUEST');
        return handlers.publicationHandler.denyDemo();
      })
      .then((result) => sendJson(response, result, statusForResult(result)))
      .catch(() =>
        sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_DENY_DEMO_REQUEST' }, 400),
      )
      .then(() => true);
  }

  if (pathname === '/api/publish-document') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    if (rejectUnsafePost(request, response, security)) return true;
    return readJsonBody(request)
      .then((payload) => handlers.publicationHandler.handle(payload))
      .then((result) => sendJson(response, result, statusForResult(result)))
      .catch(() => sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_JSON' }, 400))
      .then(() => true);
  }

  return false;
}

export function isHostOnlyPath(pathname: string): boolean {
  const normalized = pathname.replaceAll('\\', '/').toLowerCase();
  const blockedPrefixes = [
    '/@fs',
    '/server',
    '/dist-server',
    '/src/server',
    '/src/fixtures',
    '/fixtures',
    '/publication',
  ];
  return blockedPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
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

function rejectUnsafePost(
  request: IncomingMessage,
  response: ServerResponse,
  security: MoiraeHttpBoundarySecurity,
): boolean {
  if (!isJsonContentType(request)) {
    sendJson(response, { error: 'UNSUPPORTED_MEDIA_TYPE', reasonCode: 'JSON_REQUIRED' }, 415);
    return true;
  }
  if (!isTrustedOrigin(request, security)) {
    sendJson(response, { error: 'FORBIDDEN', reasonCode: 'UNTRUSTED_ORIGIN' }, 403);
    return true;
  }
  return false;
}

function rejectUntrustedOriginIfPresent(
  request: IncomingMessage,
  response: ServerResponse,
  security: MoiraeHttpBoundarySecurity,
): boolean {
  if (request.headers.origin && !isTrustedOrigin(request, security)) {
    sendJson(response, { error: 'FORBIDDEN', reasonCode: 'UNTRUSTED_ORIGIN' }, 403);
    return true;
  }
  return false;
}

function isTrustedOrigin(request: IncomingMessage, security: MoiraeHttpBoundarySecurity): boolean {
  if (!security.requireTrustedOrigin) return true;
  const origin = headerValue(request.headers.origin);
  if (!origin) return false;
  const expected = normalizedOrigin(
    security.trustedOrigin ??
      (security.allowHostDerivedOrigin ? hostDerivedOrigin(request) : undefined),
  );
  if (!expected || normalizedOrigin(origin) !== expected) return false;
  const referer = headerValue(request.headers.referer);
  if (!referer) return true;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

function hostDerivedOrigin(request: IncomingMessage): string | undefined {
  const host = headerValue(request.headers.host);
  if (!host) return undefined;
  const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocol}://${host}`;
}

function normalizedOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isJsonContentType(request: IncomingMessage): boolean {
  const contentType = headerValue(request.headers['content-type']);
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function statusForResult(value: unknown): number {
  if (!isRecord(value) || typeof value.error !== 'string') return 200;
  switch (value.error) {
    case 'CONFLICT':
      return 409;
    case 'FORBIDDEN':
      return 403;
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 415;
    case 'BAD_REQUEST':
    default:
      return 400;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
