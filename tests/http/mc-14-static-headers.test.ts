import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createMoiraeProductionServer } from '../../server/production-host';

const servers: ReturnType<typeof createMoiraeProductionServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose, rejectClose) => {
          server.close((error) => (error ? rejectClose(error) : resolveClose()));
        }),
    ),
  );
});

function startServer(): Promise<{
  server: ReturnType<typeof createMoiraeProductionServer>;
  port: number;
}> {
  const server = createMoiraeProductionServer({
    env: {
      MOIRAE_ALLOWED_ORIGIN: 'https://console.example.test',
      MOIRAE_OPERATOR_STEP_UP_SECRET: 'mc14-operator-placeholder',
      ANANKE_MOIRAE_EXECUTION_TOKEN: 'mc14-inspection-placeholder',
      ANANKE_MOIRAE_PUBLISH_TOKEN: 'mc14-publication-placeholder',
      ANANKE_MOIRAE_APPROVER_TOKEN: 'mc14-approver-placeholder',
      ANANKE_MOIRAE_RESTRICTED_TOKEN: 'mc14-restricted-placeholder',
      ANANKE_MOIRAE_EXECUTION_URL: 'http://127.0.0.1:3000/api/execute',
    },
    staticRoot: resolve('dist'),
  });
  servers.push(server);
  return new Promise((resolveStart, rejectStart) => {
    server.once('error', rejectStart);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectStart(new Error('MC14_STATIC_SERVER_ADDRESS_MISSING'));
        return;
      }
      resolveStart({ server, port: address.port });
    });
  });
}

describe('MC-14 static response headers', () => {
  it('protects the root HTML response', async () => {
    const running = await startServer();
    const response = await fetch(`http://127.0.0.1:${running.port}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('protects the explicit index HTML response', async () => {
    const running = await startServer();
    const response = await fetch(`http://127.0.0.1:${running.port}/index.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
