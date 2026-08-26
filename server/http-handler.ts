import { createFatesClient, failedOutcome, parseFatesOutcome } from '../src/fates/client';
import type { FatesClient } from '../src/fates/client';
import type {
  ApprovalRequiredOutcome,
  CallerIdentity,
  GovernanceOutcome,
  GovernedRequest,
  RequestContext,
} from '../src/fates/types';
import type { InvalidInspectionRequest, InspectionResult } from '../src/inspection/types';
import type { InvalidPublicationRequest, PublicationResult } from '../src/publication/types';
import { DEMO_DOCUMENT_ID, INSPECT_DOCUMENT_ACTION } from '../src/webmcp/inspect-document';
import { PUBLISH_DOCUMENT_ACTION } from '../src/webmcp/publish-document';
import type { WebMcpInvocation } from '../src/webmcp/types';
import { createAnankeFatesTransportFromEnvironment } from './ananke-transport';
import {
  createAnankePublicationFatesTransportFromEnvironment,
  type AnankePublicationApprovalTransport,
  type AnankeApprovalTransition,
} from './ananke-publication-transport';
import { governInspectDocumentInvocation, InspectDocumentService } from './inspect-document';
import { governPublishDocumentInvocation, PublishDocumentService } from './publish-document';
import { FixedFilePublicationStore, type PublicationStore } from './publication-store';

export type InspectDocumentHttpResult = InspectionResult | InvalidInspectionRequest;
export type PublishDocumentHttpResult = PublicationResult | InvalidPublicationRequest;

export class InspectDocumentHttpHandler {
  private readonly service: InspectDocumentService;
  private readonly client: FatesClient;

  public constructor(client?: FatesClient) {
    this.client = client ?? createProductionFatesClient();
    this.service = new InspectDocumentService({ mode: 'production' });
  }

  public async handle(payload: unknown): Promise<InspectDocumentHttpResult> {
    const invocation = parseInvocation(payload);
    if (!invocation) {
      return {
        error: 'BAD_REQUEST',
        reasonCode: 'INVALID_INSPECT_DOCUMENT_INVOCATION',
      };
    }

    const governed = await governInspectDocumentInvocation(this.client, invocation);
    return this.service.disclose(governed.request, governed.outcome);
  }
}

export class PublishDocumentHttpHandler {
  private readonly service: PublishDocumentService;
  private readonly client: FatesClient;
  private readonly publicationStore: PublicationStore;
  private readonly approvalTransport?: AnankePublicationApprovalTransport;
  private readonly pendingApprovals = new Map<string, PendingPublicationApproval>();

  public constructor(
    client?: FatesClient,
    publicationStore?: PublicationStore,
    approvalTransport?: AnankePublicationApprovalTransport,
  ) {
    const defaultTransport = createAnankePublicationFatesTransportFromEnvironment();
    this.client =
      client ??
      (defaultTransport
        ? createFatesClient({ environment: 'production', transport: defaultTransport })
        : createFatesClient({ environment: 'production' }));
    this.publicationStore = publicationStore ?? new FixedFilePublicationStore();
    this.approvalTransport = approvalTransport ?? defaultTransport;
    this.service = new PublishDocumentService({
      mode: 'production',
      publicationStore: this.publicationStore,
    });
  }

  public async handle(payload: unknown): Promise<PublishDocumentHttpResult> {
    const invocation = parsePublishInvocation(payload);
    if (!invocation) {
      return {
        error: 'BAD_REQUEST',
        reasonCode: 'INVALID_PUBLISH_DOCUMENT_INVOCATION',
      };
    }

    const governed = await governPublishDocumentInvocation(this.client, invocation);
    const result = await this.service.publish(governed.request, governed.outcome);
    if (governed.outcome.status === 'REQUIRES_APPROVAL') {
      const approvalRequestId = governed.outcome.approvalBinding.bindingId;
      this.rememberPendingApproval(approvalRequestId, governed.request, governed.outcome);
      return withApproval(result, {
        approvalRequestId,
        state: 'WAITING_FOR_APPROVAL',
        expiresAt: governed.outcome.evidence.expiresAt,
      });
    }
    return result;
  }

  public async decideApproval(payload: unknown): Promise<PublishDocumentHttpResult> {
    const decision = parseApprovalDecision(payload);
    if (!decision) {
      return { error: 'BAD_REQUEST', reasonCode: 'INVALID_APPROVAL_DECISION' };
    }

    this.cleanupPendingApprovals();
    const pending = this.pendingApprovals.get(decision.approvalRequestId);
    if (!pending) {
      return { error: 'BAD_REQUEST', reasonCode: 'APPROVAL_NOT_FOUND_OR_EXPIRED' };
    }
    if (!this.approvalTransport) {
      return this.failClosedApproval(pending, 'APPROVAL_TRANSPORT_UNAVAILABLE');
    }

    try {
      const transition =
        decision.decision === 'APPROVE'
          ? await this.approvalTransport.approve(pending.request, decision.approvalRequestId)
          : await this.approvalTransport.reject(pending.request, decision.approvalRequestId);

      if (decision.decision === 'REJECT' && transition.approvalState !== 'REJECTED') {
        return this.failClosedApproval(pending, 'APPROVAL_STATE_MISMATCH');
      }

      if (transition.approvalState === 'REJECTED' || transition.approvalState === 'EXPIRED') {
        const terminalTransition = transition as AnankeApprovalTransition & {
          approvalState: 'REJECTED' | 'EXPIRED';
        };
        const outcome = terminalApprovalOutcome(
          pending.outcome,
          terminalTransition,
          decision.decision,
        );
        const result = await this.service.publish(pending.request, outcome);
        return withApproval(result, {
          approvalRequestId: transition.approvalRequestId,
          state: transition.approvalState,
          expiresAt: pending.outcome.evidence.expiresAt,
          ...(transition.decisionId ? { decisionId: transition.decisionId } : {}),
          ...(transition.auditId ? { auditId: transition.auditId } : {}),
          ...(transition.operatorId ? { operatorId: transition.operatorId } : {}),
        });
      }

      const governed = await this.approvalTransport.executeApproved(
        pending.request,
        decision.approvalRequestId,
      );
      const outcome = parseFatesOutcome(governed, pending.request.requestId);
      const result = await this.service.publish(pending.request, outcome);
      return withApproval(result, {
        approvalRequestId: transition.approvalRequestId,
        state: 'APPROVED',
        expiresAt: pending.outcome.evidence.expiresAt,
        ...(transition.decisionId ? { decisionId: transition.decisionId } : {}),
        ...(transition.auditId ? { auditId: transition.auditId } : {}),
        ...(transition.operatorId ? { operatorId: transition.operatorId } : {}),
      });
    } catch (error) {
      return this.failClosedApproval(
        pending,
        error instanceof Error ? error.message : 'APPROVAL_FAILED',
      );
    }
  }

  public async status(): Promise<Awaited<ReturnType<PublicationStore['status']>>> {
    return this.publicationStore.status();
  }

  private rememberPendingApproval(
    approvalRequestId: string,
    request: GovernedRequest,
    outcome: ApprovalRequiredOutcome,
  ): void {
    this.cleanupPendingApprovals();
    if (this.pendingApprovals.size >= 1_024) {
      const oldest = this.pendingApprovals.keys().next().value;
      if (typeof oldest === 'string') this.pendingApprovals.delete(oldest);
    }
    const expiresAt = Date.parse(outcome.evidence.expiresAt ?? '');
    const retainedUntil =
      (Number.isFinite(expiresAt) ? expiresAt : Date.now()) + APPROVAL_RECORD_RETENTION_MS;
    this.pendingApprovals.set(approvalRequestId, { request, outcome, retainedUntil });
  }

  private cleanupPendingApprovals(): void {
    const now = Date.now();
    for (const [id, pending] of this.pendingApprovals) {
      if (pending.retainedUntil <= now) this.pendingApprovals.delete(id);
    }
  }

  private failClosedApproval(
    pending: PendingPublicationApproval,
    reasonCode: string,
  ): PublicationResult {
    const outcome = failedOutcome(pending.request.requestId, new Error(reasonCode));
    return this.service.publish(pending.request, outcome) as unknown as PublicationResult;
  }
}

export function createProductionPublishDocumentHttpHandler(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): PublishDocumentHttpHandler {
  const transport = createAnankePublicationFatesTransportFromEnvironment(env, fetchImplementation);
  const store = new FixedFilePublicationStore({
    ...(env.MOIRAE_PUBLICATION_STORE_ROOT ? { rootPath: env.MOIRAE_PUBLICATION_STORE_ROOT } : {}),
  });
  return new PublishDocumentHttpHandler(
    transport
      ? createFatesClient({ environment: 'production', transport })
      : createFatesClient({ environment: 'production' }),
    store,
    transport,
  );
}

export function createProductionInspectDocumentHttpHandler(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): InspectDocumentHttpHandler {
  return new InspectDocumentHttpHandler(createProductionFatesClient(env, fetchImplementation));
}

function createProductionFatesClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): FatesClient {
  const transport = createAnankeFatesTransportFromEnvironment(env, fetchImplementation);
  return transport
    ? createFatesClient({ environment: 'production', transport })
    : createFatesClient({ environment: 'production' });
}

interface PendingPublicationApproval {
  readonly request: GovernedRequest;
  readonly outcome: ApprovalRequiredOutcome;
  readonly retainedUntil: number;
}

const APPROVAL_RECORD_RETENTION_MS = 5 * 60 * 1_000;

interface ApprovalDecisionRequest {
  readonly approvalRequestId: string;
  readonly decision: 'APPROVE' | 'REJECT';
}

function parseApprovalDecision(value: unknown): ApprovalDecisionRequest | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'approvalRequestId,decision') return undefined;
  if (
    typeof value.approvalRequestId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.approvalRequestId) ||
    (value.decision !== 'APPROVE' && value.decision !== 'REJECT')
  ) {
    return undefined;
  }
  return {
    approvalRequestId: value.approvalRequestId,
    decision: value.decision,
  };
}

function terminalApprovalOutcome(
  pending: ApprovalRequiredOutcome,
  transition: {
    approvalRequestId: string;
    approvalState: 'REJECTED' | 'EXPIRED';
    decisionId?: string;
    auditId?: string;
    operatorId?: string;
  },
  decision: 'APPROVE' | 'REJECT',
): GovernanceOutcome {
  const state = transition.approvalState;
  return {
    requestId: pending.requestId,
    outcomeId: transition.auditId ?? `${transition.approvalRequestId}-${state.toLowerCase()}`,
    status: 'DENIED',
    reasonCode: state === 'EXPIRED' ? 'APPROVAL_EXPIRED' : 'APPROVAL_REJECTED',
    evidence: {
      ...pending.evidence,
      outcomeState: 'DENIED',
      policyDecision: 'DENY',
      approvalRequestId: transition.approvalRequestId,
      approvalState: state,
      approvalDecision: decision,
      ...(transition.decisionId ? { decisionId: transition.decisionId } : {}),
      ...(transition.auditId ? { auditId: transition.auditId, outcomeId: transition.auditId } : {}),
      ...(transition.operatorId ? { approvalOperatorId: transition.operatorId } : {}),
    },
  };
}

function withApproval(
  result: PublicationResult,
  approval: NonNullable<PublicationResult['approval']>,
): PublicationResult {
  const phases = [...result.phases];
  const phaseName =
    approval.state === 'WAITING_FOR_APPROVAL'
      ? 'APPROVAL REQUIRED'
      : approval.state === 'APPROVED'
        ? 'APPROVED'
        : approval.state;
  if (!phases.some((phase) => phase.name === phaseName)) {
    const insertAt = phases.findIndex((phase) => phase.name === 'ALLOWED');
    phases.splice(insertAt >= 0 ? insertAt : phases.length, 0, {
      name: phaseName,
      source: 'fates-authoritative',
      evidenceId: result.outcome.evidence.evidenceId,
    });
  }
  return { ...result, phases, approval };
}

function parseInvocation(payload: unknown): WebMcpInvocation | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const requestId = stringValue(payload.requestId);
  const toolName = stringValue(payload.toolName);
  const caller = parseCaller(payload.caller);
  const context = parseContext(payload.context);
  if (!requestId || toolName !== INSPECT_DOCUMENT_ACTION || !caller || !context) {
    return undefined;
  }

  if (!isBoundedArguments(payload.arguments)) {
    return undefined;
  }

  return {
    requestId,
    toolName,
    arguments: payload.arguments,
    caller,
    context,
  };
}

function parsePublishInvocation(payload: unknown): WebMcpInvocation | undefined {
  if (!isRecord(payload)) return undefined;

  const requestId = stringValue(payload.requestId);
  const toolName = stringValue(payload.toolName);
  const caller = parseCaller(payload.caller);
  const context = parseContext(payload.context);
  if (!requestId || toolName !== PUBLISH_DOCUMENT_ACTION || !caller || !context) {
    return undefined;
  }
  if (!isBoundedPublicationArguments(payload.arguments)) return undefined;
  return {
    requestId,
    toolName,
    arguments: payload.arguments,
    caller,
    context,
  };
}

function isBoundedArguments(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    Object.keys(value)[0] === 'documentId' &&
    value.documentId === DEMO_DOCUMENT_ID
  );
}

function isBoundedPublicationArguments(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    Object.keys(value)[0] === 'documentId' &&
    value.documentId === DEMO_DOCUMENT_ID
  );
}

function parseCaller(value: unknown): CallerIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = value.kind;
  const id = stringValue(value.id);
  const sessionId = stringValue(value.sessionId);
  if ((kind !== 'agent' && kind !== 'browser' && kind !== 'human' && kind !== 'service') || !id) {
    return undefined;
  }
  return { kind, id, ...(sessionId ? { sessionId } : {}) };
}

function parseContext(value: unknown): RequestContext | undefined {
  if (!isRecord(value) || value.source !== 'webmcp') {
    return undefined;
  }
  const tenantId = stringValue(value.tenantId);
  const workspaceId = stringValue(value.workspaceId);
  const purpose = stringValue(value.purpose);
  return {
    source: 'webmcp',
    ...(tenantId ? { tenantId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(purpose ? { purpose } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
