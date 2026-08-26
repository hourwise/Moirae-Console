/// <reference types="vitest/config" />

import type { IncomingMessage, ServerResponse } from 'node:http';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

import { createProductionInspectDocumentHttpHandler } from './server/http-handler';
import { setNoStoreResponseHeaders } from './server/http-response';

export default defineConfig({
  plugins: [react(), governedInspectDocumentPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

/**
 * Development-only host boundary. Production deployment must replace this
 * Vite middleware with an authenticated host/service boundary. When the
 * trusted Ananke endpoint and token are absent, the handler remains
 * unavailable and fail-closed.
 */
function governedInspectDocumentPlugin(): Plugin {
  const handler = createProductionInspectDocumentHttpHandler();

  return {
    name: 'moirae-governed-inspect-document',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = decodePathname(request.url);
        if (isHostOnlyPath(pathname)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        next();
      });

      server.middlewares.use('/api/inspect-document', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Allow', 'POST');
          response.end();
          return;
        }

        void readJsonBody(request)
          .then((payload) => handler.handle(payload))
          .then((result) => sendJson(response, result))
          .catch(() =>
            sendJson(response, { error: 'BAD_REQUEST', reasonCode: 'INVALID_JSON' }, 400),
          );
      });
    },
  };
}

function decodePathname(url: string | undefined): string {
  try {
    return decodeURIComponent(new URL(url ?? '/', 'http://localhost').pathname);
  } catch {
    return '';
  }
}

function isHostOnlyPath(pathname: string): boolean {
  const normalized = pathname.replaceAll('\\', '/');
  return (
    normalized === '/server' ||
    normalized.startsWith('/server/') ||
    (normalized.startsWith('/@fs/') && normalized.includes('/server/'))
  );
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

function sendJson(response: ServerResponse, payload: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  setNoStoreResponseHeaders(response);
  response.end(JSON.stringify(payload));
}
