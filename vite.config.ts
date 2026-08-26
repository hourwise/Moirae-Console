/// <reference types="vitest/config" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

import {
  createProductionInspectDocumentHttpHandler,
  createProductionPublishDocumentHttpHandler,
} from './server/http-handler';
import { decodePathname, handleMoiraeApiRequest, isHostOnlyPath } from './server/http-boundary';

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
  const publicationHandler = createProductionPublishDocumentHttpHandler();

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
        void handleMoiraeApiRequest(request, response, {
          inspectHandler: handler,
          publicationHandler,
        })
          .then((handled) => {
            if (!handled) next();
          })
          .catch(() => next());
      });
    },
  };
}
