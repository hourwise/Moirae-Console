/// <reference types="vitest/config" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

import {
  createProductionInspectDocumentHttpHandler,
  createProductionPublishDocumentHttpHandler,
} from './server/http-handler';
import {
  decodePathname,
  handleMoiraeApiRequest,
  isHostOnlyPath,
  type MoiraeHttpBoundarySecurity,
} from './server/http-boundary';

export default defineConfig({
  plugins: [react(), governedInspectDocumentPlugin()],
  server: {
    // The development server must not add permissive CORS headers to the
    // governed same-origin API. Cross-origin callers receive no API response.
    cors: false,
  },
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
  const publicationHandler = createProductionPublishDocumentHttpHandler();
  const security: MoiraeHttpBoundarySecurity = {
    trustedOrigin: process.env.MOIRAE_ALLOWED_ORIGIN,
    requireTrustedOrigin: true,
    allowHostDerivedOrigin: true,
  };

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

      server.middlewares.use((request, response, next) => {
        void handleMoiraeApiRequest(
          request,
          response,
          {
            inspectHandler: handler,
            publicationHandler,
          },
          security,
        )
          .then((handled) => {
            if (!handled) next();
          })
          .catch(() => next());
      });
    },
  };
}
