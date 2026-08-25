import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();

describe('MC-00 architecture boundary', () => {
  it('MC-00-T12: browser-delivered app code has no authority credential material', () => {
    const appRoot = join(repositoryRoot, 'src', 'app');
    const appSource = readdirSync(appRoot)
      .filter((file) => /\.(ts|tsx|css)$/.test(file))
      .map((file) => readFileSync(join(appRoot, file), 'utf8'))
      .join('\n');

    expect(appSource).not.toMatch(
      /PRIVATE KEY|SIGNING_KEY|AUTHORITY_SECRET|LONG_LIVED_CREDENTIAL/i,
    );
  });

  it('keeps the WebMCP adapter inbound-only', () => {
    const adapterSource = readFileSync(join(repositoryRoot, 'src', 'webmcp', 'adapter.ts'), 'utf8');

    expect(adapterSource).toContain('client.govern');
    expect(adapterSource).not.toMatch(/fetch\s*\(|localStorage|sendBeacon|XMLHttpRequest/);
    expect(adapterSource).not.toMatch(/execute\s*\(/);
  });
});
