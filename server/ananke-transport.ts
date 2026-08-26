import type {
  FatesTransport,
  FatesTransportBinding,
  FatesTransportResponse,
} from '../src/fates/client';
import type { GovernedRequest } from '../src/fates/types';
import { DEMO_DOCUMENT_ID, INSPECT_DOCUMENT_ACTION } from '../src/webmcp/inspect-document';
import {
  MOIRAE_AUTHORITY_BINDING,
  MOIRAE_FATES_EXPECTED_SHA256,
  MOIRAE_FATES_PURPOSE,
} from './moirae-authority';

export const DEFAULT_ANANKE_EXECUTE_URL = 'http://127.0.0.1:3000/api/execute';
export const ANANKE_EXECUTION_TOKEN_ENV = 'ANANKE_MOIRAE_EXECUTION_TOKEN';

export interface AnankeTransportOptions {
  readonly endpoint: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly fetchImplementation?: typeof fetch;
}

export class AnankeFatesTransport implements FatesTransport {
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  public constructor(private readonly options: AnankeTransportOptions) {
    if (!options.token.trim()) {
      throw new Error('ANANKE_MOIRAE_EXECUTION_TOKEN is required');
    }
    assertExecuteEndpoint(options.endpoint);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public async send(request: GovernedRequest): Promise<FatesTransportResponse> {
    assertExactConsoleRequest(request);

    const correlationId = request.requestId;
    const binding: FatesTransportBinding = {
      ...MOIRAE_AUTHORITY_BINDING,
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
          toolName: MOIRAE_AUTHORITY_BINDING.canonicalAction,
          arguments: {
            documentId: MOIRAE_AUTHORITY_BINDING.documentId,
            expectedSha256: MOIRAE_FATES_EXPECTED_SHA256,
          },
          purpose: MOIRAE_FATES_PURPOSE,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`ANANKE_HTTP_${response.status}`);
      }

      return {
        response: await response.json(),
        binding,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAnankeFatesTransportFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): FatesTransport | undefined {
  const token = env[ANANKE_EXECUTION_TOKEN_ENV];
  if (!token || !token.trim()) {
    return undefined;
  }

  const endpoint = env.ANANKE_MOIRAE_EXECUTION_URL ?? DEFAULT_ANANKE_EXECUTE_URL;
  try {
    return new AnankeFatesTransport({ endpoint, token, fetchImplementation });
  } catch {
    return undefined;
  }
}

function assertExactConsoleRequest(request: GovernedRequest): void {
  if (
    request.action !== INSPECT_DOCUMENT_ACTION ||
    !isExactDocumentParameters(request.parameters)
  ) {
    throw new Error('MOIRAE_CONSOLE_REQUEST_BINDING_MISMATCH');
  }
}

function isExactDocumentParameters(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'documentId' && value.documentId === DEMO_DOCUMENT_ID;
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
