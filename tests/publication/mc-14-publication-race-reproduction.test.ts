import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const targetFileName = 'moirae-demo-publication-slot.v1.bin';
let targetPreflightReads = 0;
let targetReadFailure: string | undefined;
let targetStatFailure: string | undefined;
let releasePreflight: (() => void) | undefined;
let preflightReady: Promise<void>;

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const [path] = args;
      if (String(path).endsWith(targetFileName) && targetReadFailure) {
        throw Object.assign(new Error(targetReadFailure), { code: targetReadFailure });
      }
      if (String(path).endsWith(targetFileName) && targetPreflightReads < 2) {
        targetPreflightReads += 1;
        if (targetPreflightReads === 2) releasePreflight?.();
        await preflightReady;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return actual.readFile(...args);
    },
    stat: async (...args: Parameters<typeof actual.stat>) => {
      const [path] = args;
      if (String(path).endsWith(targetFileName) && targetStatFailure) {
        throw Object.assign(new Error(targetStatFailure), { code: targetStatFailure });
      }
      return actual.stat(...args);
    },
  };
});

const { FixedFilePublicationStore } = await import('../../server/publication-store');

const expectedSha256 = 'f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c';
const bytes = await readFile(join(process.cwd(), 'server', 'fixtures', 'demo-policy-001.txt'));
const temporaryRoots: string[] = [];

afterEach(async () => {
  releasePreflight?.();
  releasePreflight = undefined;
  targetReadFailure = undefined;
  targetStatFailure = undefined;
  targetPreflightReads = 0;
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('MC-14 publication-store race reproduction', () => {
  it('collapses two calls racing through the target check to one install', async () => {
    targetPreflightReads = 0;
    preflightReady = new Promise<void>((resolve) => {
      releasePreflight = resolve;
    });
    const root = await mkdtemp(join(tmpdir(), 'moirae-mc14-race-'));
    temporaryRoots.push(root);
    const store = new FixedFilePublicationStore({ rootPath: root });

    const results = await Promise.all([
      store.publish({
        documentId: 'demo-policy-001',
        destinationId: 'moirae.demo-publication-slot.v1',
        bytes,
        expectedSha256,
      }),
      store.publish({
        documentId: 'demo-policy-001',
        destinationId: 'moirae.demo-publication-slot.v1',
        bytes,
        expectedSha256,
      }),
    ]);

    expect(results.map((result) => result.state).sort()).toEqual([
      'ALREADY_PUBLISHED',
      'PUBLISHED',
    ]);
    expect((await readdir(root)).filter((name) => name.includes('.tmp-'))).toEqual([]);
  });

  it('serializes a larger identical burst to one install and idempotent followers', async () => {
    targetPreflightReads = 0;
    preflightReady = new Promise<void>((resolve) => {
      releasePreflight = resolve;
    });
    const root = await mkdtemp(join(tmpdir(), 'moirae-mc14-burst-'));
    temporaryRoots.push(root);
    const store = new FixedFilePublicationStore({ rootPath: root });
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        store.publish({
          documentId: 'demo-policy-001',
          destinationId: 'moirae.demo-publication-slot.v1',
          bytes,
          expectedSha256,
        }),
      ),
    );

    expect(results.filter((result) => result.state === 'PUBLISHED')).toHaveLength(1);
    expect(results.filter((result) => result.state === 'ALREADY_PUBLISHED')).toHaveLength(5);
    expect((await new FixedFilePublicationStore({ rootPath: root }).status()).sha256).toBe(
      expectedSha256,
    );
    expect((await readdir(root)).filter((name) => name.includes('.tmp-'))).toEqual([]);
  });

  it('does not overwrite a fixed destination containing different content', async () => {
    targetPreflightReads = 2;
    const root = await mkdtemp(join(tmpdir(), 'moirae-mc14-conflict-'));
    temporaryRoots.push(root);
    await writeFile(join(root, targetFileName), Buffer.from('different-content'));
    const store = new FixedFilePublicationStore({ rootPath: root });

    await expect(
      store.publish({
        documentId: 'demo-policy-001',
        destinationId: 'moirae.demo-publication-slot.v1',
        bytes,
        expectedSha256,
      }),
    ).rejects.toThrow('PUBLICATION_DESTINATION_CONFLICT');
    await expect(readFile(join(root, targetFileName), 'utf8')).resolves.toBe('different-content');
  });

  it('fails closed when an existing-target read returns an unexpected filesystem error', async () => {
    targetReadFailure = 'EACCES';
    const root = await mkdtemp(join(tmpdir(), 'moirae-mc14-read-error-'));
    temporaryRoots.push(root);
    const store = new FixedFilePublicationStore({ rootPath: root });

    await expect(store.status()).rejects.toMatchObject({ code: 'EACCES' });
    await expect(
      store.publish({
        documentId: 'demo-policy-001',
        destinationId: 'moirae.demo-publication-slot.v1',
        bytes,
        expectedSha256,
      }),
    ).rejects.toMatchObject({ code: 'EACCES' });
    expect((await readdir(root)).filter((name) => name.includes('.tmp-'))).toEqual([]);

    targetReadFailure = undefined;
    await writeFile(join(root, targetFileName), bytes);
    targetPreflightReads = 2;
    targetStatFailure = 'EIO';
    const statFailingStore = new FixedFilePublicationStore({ rootPath: root });
    await expect(statFailingStore.status()).rejects.toMatchObject({ code: 'EIO' });
    await expect(
      statFailingStore.publish({
        documentId: 'demo-policy-001',
        destinationId: 'moirae.demo-publication-slot.v1',
        bytes,
        expectedSha256,
      }),
    ).rejects.toMatchObject({ code: 'EIO' });
  });
});
