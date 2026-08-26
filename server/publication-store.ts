import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MOIRAE_PUBLICATION_DESTINATION_ID,
  MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
} from './moirae-publication-authority';

export interface PublicationStoreInput {
  readonly documentId: string;
  readonly destinationId: string;
  readonly bytes: Uint8Array;
  readonly expectedSha256: string;
}

export interface PublicationWriteResult {
  readonly state: 'PUBLISHED' | 'ALREADY_PUBLISHED';
  readonly documentId: string;
  readonly destinationId: string;
  readonly sha256: string;
  readonly publishedAt: string;
  readonly executorInvocationCount: number;
}

export interface PublicationStatus {
  readonly published: boolean;
  readonly documentId: string;
  readonly destinationId: string;
  readonly sha256?: string;
  readonly publishedAt?: string;
  readonly executorInvocationCount: number;
}

export interface PublicationStore {
  publish(input: PublicationStoreInput): Promise<PublicationWriteResult>;
  status(): Promise<PublicationStatus>;
}

export interface FixedPublicationStoreOptions {
  readonly rootPath?: string;
  readonly now?: () => number;
  /** Test-only failpoint; production composition never supplies it. */
  readonly beforeRename?: () => void;
}

const TARGET_FILE_NAME = 'moirae-demo-publication-slot.v1.bin';
const TEMP_FILE_PREFIX = `${TARGET_FILE_NAME}.tmp-`;

/**
 * One fixed, host-only publication target. The caller supplies bytes, never a
 * path. Existing identical content is treated as an idempotent success;
 * different content is a destination conflict and is never overwritten.
 */
export class FixedFilePublicationStore implements PublicationStore {
  private readonly rootPath: string;
  private readonly now: () => number;
  private readonly beforeRename?: () => void;
  private executorInvocationCount = 0;

  public constructor(options: FixedPublicationStoreOptions = {}) {
    this.rootPath = options.rootPath ?? join(tmpdir(), 'moirae-console-mc04-publication');
    this.now = options.now ?? Date.now;
    this.beforeRename = options.beforeRename;
  }

  public async publish(input: PublicationStoreInput): Promise<PublicationWriteResult> {
    this.executorInvocationCount += 1;
    assertExactInput(input);
    await mkdir(this.rootPath, { recursive: true });

    const targetPath = join(this.rootPath, TARGET_FILE_NAME);
    const existing = await readExisting(targetPath);
    if (existing) {
      if (existing.sha256 !== input.expectedSha256) {
        throw new Error('PUBLICATION_DESTINATION_CONFLICT');
      }
      return {
        state: 'ALREADY_PUBLISHED',
        documentId: input.documentId,
        destinationId: input.destinationId,
        sha256: existing.sha256,
        publishedAt: existing.publishedAt,
        executorInvocationCount: this.executorInvocationCount,
      };
    }

    const temporaryPath = join(this.rootPath, `${TEMP_FILE_PREFIX}${randomUUID()}`);
    try {
      await writeFile(temporaryPath, Buffer.from(input.bytes));
      const handle = await open(temporaryPath, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.beforeRename?.();
      try {
        // A hard link is an atomic no-overwrite install on the same
        // filesystem. Unlike rename-over-existing, it cannot turn two
        // concurrent absent-target observations into two successful writes.
        await link(temporaryPath, targetPath);
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
        const installed = await readExisting(targetPath);
        if (!installed) {
          throw new Error('PUBLICATION_DESTINATION_CONFLICT', { cause: error });
        }
        if (installed.sha256 !== input.expectedSha256) {
          throw new Error('PUBLICATION_DESTINATION_CONFLICT', { cause: error });
        }
        return {
          state: 'ALREADY_PUBLISHED',
          documentId: input.documentId,
          destinationId: input.destinationId,
          sha256: installed.sha256,
          publishedAt: installed.publishedAt,
          executorInvocationCount: this.executorInvocationCount,
        };
      }

      const finalBytes = await readFile(targetPath);
      const finalSha256 = sha256(finalBytes);
      if (finalSha256 !== input.expectedSha256) {
        throw new Error('PUBLICATION_DESTINATION_DIGEST_MISMATCH');
      }
      return {
        state: 'PUBLISHED',
        documentId: input.documentId,
        destinationId: input.destinationId,
        sha256: finalSha256,
        publishedAt: new Date(this.now()).toISOString(),
        executorInvocationCount: this.executorInvocationCount,
      };
    } finally {
      await unlinkIfPresent(temporaryPath);
    }
  }

  public async status(): Promise<PublicationStatus> {
    const targetPath = join(this.rootPath, TARGET_FILE_NAME);
    const existing = await readExisting(targetPath);
    return {
      published: Boolean(existing),
      documentId: 'demo-policy-001',
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      ...(existing ? { sha256: existing.sha256, publishedAt: existing.publishedAt } : {}),
      executorInvocationCount: this.executorInvocationCount,
    };
  }
}

function assertExactInput(input: PublicationStoreInput): void {
  if (
    input.documentId !== 'demo-policy-001' ||
    input.destinationId !== MOIRAE_PUBLICATION_DESTINATION_ID ||
    input.expectedSha256 !== MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256 ||
    !(input.bytes instanceof Uint8Array) ||
    sha256(input.bytes) !== input.expectedSha256
  ) {
    throw new Error('PUBLICATION_INPUT_DIGEST_MISMATCH');
  }
}

async function readExisting(
  targetPath: string,
): Promise<{ sha256: string; publishedAt: string } | undefined> {
  try {
    const bytes = await readFile(targetPath);
    const metadata = await stat(targetPath);
    return { sha256: sha256(bytes), publishedAt: metadata.mtime.toISOString() };
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return isNodeFileSystemError(error) && error.code === 'ENOENT';
}

function isAlreadyExistsError(error: unknown): boolean {
  return isNodeFileSystemError(error) && error.code === 'EEXIST';
}

function isNodeFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string';
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Cleanup is best effort; the fixed target is never exposed to callers.
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
