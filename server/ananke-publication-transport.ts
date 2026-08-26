import type {
  FatesTransport,
  FatesTransportBinding,
  FatesTransportResponse,
} from '../src/fates/client';
import type { GovernedRequest } from '../src/fates/types';
import { DEMO_DOCUMENT_ID } from '../src/webmcp/inspect-document';
import { PUBLISH_DOCUMENT_ACTION } from '../src/webmcp/publish-document';
import {
  MOIRAE_PUBLICATION_AUTHORITY_BINDING,
  MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
  MOIRAE_PUBLICATION_FATES_PURPOSE,
} from './moirae-publication-authority';

export const ANANKE_PUBLICATION_EXECUTION_TOKEN_ENV = 'ANANKE_MOIRAE_PUBLISH_TOKEN';

export interface AnankePublicationTransportOptions {
  readonly endpoint: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly fetchImplementation?: typeof fetch;
}

export class AnankePublicationFatesTransport implements FatesTransport {
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  public constructor(private readonly options: AnankePublicationTransportOptions) {
    if (!options.token.trim()) {
      throw new Error('ANANKE_MOIRAE_PUBLISH_TOKEN is required');
    }
    assertExecuteEndpoint(options.endpoint);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public async send(request: GovernedRequest): Promise<FatesTransportResponse> {
    assertExactConsoleRequest(request);
    const correlationId = request.requestId;
    const binding: FatesTransportBinding = {
      ...MOIRAE_PUBLICATION_AUTHORITY_BINDING,
      correlationId,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(this.options.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          'Content-Type': 'application/json',
          'X-Ananke-Correlation-Id': correlationId,
        },
        body: JSON.stringify({
          toolName: MOIRAE_PUBLICATION_AUTHORITY_BINDING.canonicalAction,
          arguments: {
            documentId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId,
            expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
            destinationId: MOIRAE_PUBLICATION_AUTHORITY_BINDING.destinationId,
          },
          purpose: MOIRAE_PUBLICATION_FATES_PURPOSE,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`ANANKE_HTTP_${response.status}`);
      }

      return { response: await response.json(), binding };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAnankePublicationFatesTransportFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): FatesTransport | undefined {
  const token = env[ANANKE_PUBLICATION_EXECUTION_TOKEN_ENV];
  if (!token || !token.trim()) return undefined;
  const endpoint = env.ANANKE_MOIRAE_EXECUTION_URL ?? 'http://127.0.0.1:3000/api/execute';
  try {
    return new AnankePublicationFatesTransport({ endpoint, token, fetchImplementation });
  } catch {
    return undefined;
  }
}

function assertExactConsoleRequest(request: GovernedRequest): void {
  if (
    request.action !== PUBLISH_DOCUMENT_ACTION ||
    !isRecord(request.parameters) ||
    Object.keys(request.parameters).length !== 1 ||
    request.parameters.documentId !== DEMO_DOCUMENT_ID
  ) {
    throw new Error('MOIRAE_CONSOLE_PUBLICATION_REQUEST_BINDING_MISMATCH');
  }
}

function assertExecuteEndpoint(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ANANKE_MOIRAE_EXECUTION_URL must be a valid URL');
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/api/execute') {
    throw new Error('ANANKE_MOIRAE_EXECUTION_URL must target POST /api/execute');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
