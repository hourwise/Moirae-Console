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
export const ANANKE_PUBLICATION_APPROVER_TOKEN_ENV = 'ANANKE_MOIRAE_APPROVER_TOKEN';

export type PublicationApprovalDecision = 'APPROVE' | 'REJECT';

export interface AnankeApprovalTransition {
  readonly approvalRequestId: string;
  readonly approvalState: 'APPROVED' | 'REJECTED' | 'EXPIRED';
  readonly decisionId?: string;
  readonly auditId?: string;
  readonly operatorId?: string;
}

export interface AnankePublicationApprovalTransport {
  approve(request: GovernedRequest, approvalRequestId: string): Promise<AnankeApprovalTransition>;
  reject(request: GovernedRequest, approvalRequestId: string): Promise<AnankeApprovalTransition>;
  executeApproved(request: GovernedRequest, approvalRequestId: string): Promise<FatesTransportResponse>;
}

export interface AnankePublicationTransportOptions {
  readonly endpoint: string;
  readonly token: string;
  readonly approverToken?: string;
  readonly timeoutMs?: number;
  readonly fetchImplementation?: typeof fetch;
}

export class AnankePublicationFatesTransport implements FatesTransport, AnankePublicationApprovalTransport {
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
    return this.sendExecution(request);
  }

  public async executeApproved(
    request: GovernedRequest,
    approvalRequestId: string,
  ): Promise<FatesTransportResponse> {
    assertApprovalRequestId(approvalRequestId);
    assertExactConsoleRequest(request);
    return this.sendExecution(request, approvalRequestId);
  }

  public async approve(
    request: GovernedRequest,
    approvalRequestId: string,
  ): Promise<AnankeApprovalTransition> {
    return this.sendApprovalDecision(request, approvalRequestId, 'APPROVE');
  }

  public async reject(
    request: GovernedRequest,
    approvalRequestId: string,
  ): Promise<AnankeApprovalTransition> {
    return this.sendApprovalDecision(request, approvalRequestId, 'REJECT');
  }

  private async sendExecution(
    request: GovernedRequest,
    approvalRequestId?: string,
  ): Promise<FatesTransportResponse> {
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
          'X-Ananke-Request-Id': request.requestId,
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
          ...(approvalRequestId ? { approvalId: approvalRequestId } : {}),
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

  private async sendApprovalDecision(
    request: GovernedRequest,
    approvalRequestId: string,
    decision: PublicationApprovalDecision,
  ): Promise<AnankeApprovalTransition> {
    assertApprovalRequestId(approvalRequestId);
    assertExactConsoleRequest(request);
    if (!this.options.approverToken?.trim()) {
      throw new Error('ANANKE_MOIRAE_APPROVER_TOKEN_UNAVAILABLE');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImplementation(
        approvalEndpoint(this.options.endpoint, approvalRequestId, decision),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.options.approverToken}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        },
      );
      const raw = await response.json().catch(() => undefined);
      const transition = parseApprovalTransition(raw, approvalRequestId);
      if (!response.ok && !transition) {
        throw new Error(`ANANKE_APPROVAL_HTTP_${response.status}`);
      }
      if (!transition) {
        throw new Error('ANANKE_APPROVAL_MALFORMED_RESPONSE');
      }
      return transition;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAnankePublicationFatesTransportFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): AnankePublicationFatesTransport | undefined {
  const token = env[ANANKE_PUBLICATION_EXECUTION_TOKEN_ENV];
  if (!token || !token.trim()) return undefined;
  const endpoint = env.ANANKE_MOIRAE_EXECUTION_URL ?? 'http://127.0.0.1:3000/api/execute';
  const approverToken = env[ANANKE_PUBLICATION_APPROVER_TOKEN_ENV];
  try {
    return new AnankePublicationFatesTransport({
      endpoint,
      token,
      ...(approverToken ? { approverToken } : {}),
      fetchImplementation,
    });
  } catch {
    return undefined;
  }
}

function approvalEndpoint(
  executeEndpoint: string,
  approvalRequestId: string,
  decision: PublicationApprovalDecision,
): string {
  return `${executeEndpoint.slice(0, -'/execute'.length)}/approvals/${encodeURIComponent(approvalRequestId)}/${decision === 'APPROVE' ? 'approve' : 'reject'}`;
}

function parseApprovalTransition(value: unknown, approvalRequestId: string): AnankeApprovalTransition | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.approvalRequestId);
  const state = stringValue(value.approvalState);
  if (id !== approvalRequestId || (state !== 'APPROVED' && state !== 'REJECTED' && state !== 'EXPIRED')) {
    return undefined;
  }
  const transition = isRecord(value.transition) ? value.transition : undefined;
  return {
    approvalRequestId: id,
    approvalState: state,
    ...(transition && stringValue(transition.decisionId)
      ? { decisionId: stringValue(transition.decisionId) }
      : {}),
    ...(transition && stringValue(transition.auditId)
      ? { auditId: stringValue(transition.auditId) }
      : {}),
    ...(transition && stringValue(transition.operatorId)
      ? { operatorId: stringValue(transition.operatorId) }
      : {}),
  };
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

function assertApprovalRequestId(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error('MOIRAE_APPROVAL_REQUEST_ID_INVALID');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
