import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

describe('MC-07 release boundary', () => {
  it('uses the public package/license metadata and production start command', () => {
    const packageJson = JSON.parse(read('package.json')) as Record<string, unknown>;

    expect(packageJson.private).toBe(false);
    expect(packageJson.license).toBe('Apache-2.0');
    expect((packageJson.scripts as Record<string, string>).start).toBe(
      'node dist-server/production-server.mjs',
    );
    expect(read('LICENSE')).toMatch(/Apache License\s+Version 2\.0/);
  });

  it('uses document.modelContext and never the deprecated navigator model context', () => {
    const browserSource = read('src/webmcp/browser.ts');

    expect(browserSource).toContain('document.modelContext');
    expect(browserSource).not.toContain('navigator.modelContext');
  });

  it('keeps the production host to the bounded static and API surface', () => {
    const serverSource = read('server/production-server.ts');

    expect(serverSource).toContain("'/healthz'");
    expect(serverSource).toContain('handleMoiraeApiRequest');
    expect(serverSource).toContain('/^\\/assets\\/[A-Za-z0-9._-]+$/');
    expect(serverSource).not.toMatch(/serveStatic\([^)]*server/);
    expect(serverSource).not.toContain('ANANKE_MOIRAE_EXECUTION_TOKEN');
  });

  it('keeps the WebMCP discovery boundary free of Fates parameters', () => {
    const toolSource = read('src/webmcp/tools.ts');
    const browserSource = read('src/webmcp/browser.ts');

    expect(toolSource).not.toMatch(/expectedSha256|destinationId|purpose|credential|token/i);
    expect(browserSource).not.toMatch(/expectedSha256|destinationId|purpose|credential|token/i);
  });
});
