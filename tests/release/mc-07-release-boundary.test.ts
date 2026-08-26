import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isHostOnlyPath } from '../../server/http-boundary';

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
    const hostSource = read('server/production-host.ts');
    const productionHostSource = `${serverSource}\n${hostSource}`;

    expect(productionHostSource).toContain("'/healthz'");
    expect(productionHostSource).toContain('handleMoiraeApiRequest');
    expect(productionHostSource).toContain('/^\\/assets\\/[A-Za-z0-9._-]+$/');
    expect(productionHostSource).not.toMatch(/serveStatic\([^)]*server/);
    expect(productionHostSource).not.toContain('ANANKE_MOIRAE_EXECUTION_TOKEN');
  });

  it('blocks development and production access to server-only paths', () => {
    expect(isHostOnlyPath('/server/document-source.ts')).toBe(true);
    expect(isHostOnlyPath('/dist-server/fixtures/demo-policy-001.txt')).toBe(true);
    expect(isHostOnlyPath('/src/server/document-source.ts')).toBe(true);
    expect(isHostOnlyPath('/src/fixtures/demo-policy-001.txt')).toBe(true);
    expect(isHostOnlyPath('/publication/demo-policy-001')).toBe(true);
    expect(isHostOnlyPath('/@fs/D:/Users/fleur/Moirae-Console/server/http-handler.ts')).toBe(true);
    expect(isHostOnlyPath('/assets/index.js')).toBe(false);
  });

  it('keeps the WebMCP discovery boundary free of Fates parameters', () => {
    const toolSource = read('src/webmcp/tools.ts');
    const browserSource = read('src/webmcp/browser.ts');

    expect(toolSource).not.toMatch(/expectedSha256|destinationId|purpose|credential|token/i);
    expect(browserSource).not.toMatch(/expectedSha256|destinationId|purpose|credential|token/i);
  });
});
