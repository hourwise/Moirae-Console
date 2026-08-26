import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createProductionInspectDocumentHttpHandler,
  createProductionPublishDocumentHttpHandler,
} from './http-handler';
import { decodePathname, handleMoiraeApiRequest, isHostOnlyPath, sendJson } from './http-boundary';
import { setNoStoreResponseHeaders } from './http-response';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticRoot = resolve(process.env.MOIRAE_STATIC_ROOT ?? join(repositoryRoot, 'dist'));
const port = parsePort(process.env.PORT ?? '4173');
const host = process.env.HOST ?? '0.0.0.0';

const handlers = {
  inspectHandler: createProductionInspectDocumentHttpHandler(),
  publicationHandler: createProductionPublishDocumentHttpHandler(),
};

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.writableEnded) sendJson(response, { error: 'HOST_REQUEST_FAILED' }, 503);
  });
});

server.listen(port, host, () => {
  console.log(`Moirae Console listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const pathname = decodePathname(request.url);

  if (pathname === '/healthz') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      setNoStoreResponseHeaders(response);
      response.end();
      return;
    }
    sendJson(response, { status: 'ok', service: 'moirae-console' });
    return;
  }

  if (await handleMoiraeApiRequest(request, response, handlers)) return;

  if (isHostOnlyPath(pathname)) {
    response.statusCode = 404;
    response.end();
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    response.end();
    return;
  }

  await serveStatic(pathname, request.method === 'HEAD', response);
}

async function serveStatic(
  pathname: string,
  headOnly: boolean,
  response: ServerResponse,
): Promise<void> {
  const relativePath =
    pathname === '/' || pathname === '/index.html'
      ? 'index.html'
      : /^\/assets\/[A-Za-z0-9._-]+$/.test(pathname)
        ? pathname.slice('/'.length)
        : undefined;

  if (!relativePath) {
    response.statusCode = 404;
    response.end();
    return;
  }

  const filePath = resolve(staticRoot, relativePath);
  if (!filePath.startsWith(`${staticRoot}\\`) && !filePath.startsWith(`${staticRoot}/`)) {
    response.statusCode = 404;
    response.end();
    return;
  }

  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) throw new Error('NOT_A_FILE');
    const bytes = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentType(filePath));
    response.setHeader('Content-Length', String(bytes.byteLength));
    response.setHeader(
      'Cache-Control',
      relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    );
    if (headOnly) response.end();
    else response.end(bytes);
  } catch {
    response.statusCode = 404;
    response.end();
  }
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('PORT must be a valid TCP port number');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
  return parsed;
}
