import { randomUUID, timingSafeEqual } from 'node:crypto';

import {
  createFatesClient,
  failedOutcome,
  parseFatesOutcome,
  snapshotGovernedRequest,
} from '../src/fates/client';
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
  type AnankePublicationDenyTransport,
  type AnankeApprovalTransition,
} from './ananke-publication-transport';
import { assertSafeConsoleCredentialComposition } from './credential-composition';
import { governInspectDocumentInvocation, InspectDocumentService } from './inspect-document';
import { governPublishDocumentInvocation, PublishDocumentService } from './publish-document';
import { FixedDemoDocumentSource, type HostDocumentSource } from './document-source';
import { FixedFilePublicationStore, type PublicationStore } from './publication-store';

export const MOIRAE_OPERATOR_STEP_UP_SECRET_ENV = 'MOIRAE_OPERATOR_STEP_UP_SECRET';

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
  private readonly restrictedTransport?: AnankePublicationDenyTransport;
  private readonly operatorStepUpSecret?: string;
  private readonly sourceReadCount: { value: number } = { value: 0 };
  private readonly pendingApprovals = new Map<string, PendingPublicationApproval>();

  public constructor(
    client?: FatesClient,
    publicationStore?: PublicationStore,
    approvalTransport?: AnankePublicationApprovalTransport,
    restrictedTransport?: AnankePublicationDenyTransport,
    documentSource?: HostDocumentSource,
    operatorStepUpSecret?: string,
  ) {
    const defaultTransport = createAnankePublicationFatesTransportFromEnvironment();
    this.client =
      client ??
      (defaultTransport
        ? createFatesClient({ environment: 'production', transport: defaultTransport })
        : createFatesClient({ environment: 'production' }));
    this.publicationStore = publicationStore ?? new FixedFilePublicationStore();
    this.approvalTransport = approvalTransport ?? defaultTransport;
    this.restrictedTransport = restrictedTransport ?? defaultTransport;
    this.operatorStepUpSecret =
      (operatorStepUpSecret ?? process.env[MOIRAE_OPERATOR_STEP_UP_SECRET_ENV])?.trim() ||
      undefined;
    const source = documentSource ?? new FixedDemoDocumentSource();
    this.service = new PublishDocumentService({
      mode: 'production',
      publicationStore: this.publicationStore,
      documentSource: {
        read: async (documentId) => {
          this.sourceReadCount.value += 1;
          return source.read(documentId);
        },
      },
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
      const pending = this.rememberPendingApproval(governed.request, governed.outcome);
      return withApproval(redactApprovalIdentifiers(result, pending.approvalHandle), {
        approvalHandle: pending.approvalHandle,
        state: 'WAITING_FOR_APPROVAL',
        expiresAt: governed.outcome.evidence.expiresAt,
      });
    }
    return result;
  }

  /**
   * Host-only MC-06 presentation scenario. The browser can request this
   * fixed demonstration, but cannot select or supply the restricted caller
   * identity, credential, action, purpose, digest, or destination.
   */
  public async denyDemo(): Promise<PublishDocumentHttpResult> {
    const request = restrictedDenyRequest();
    if (!this.restrictedTransport) {
      return this.service.publish(
        request,
        failedOutcome(request.requestId, new Error('ANANKE_MOIRAE_RESTRICTED_TOKEN_UNAVAILABLE')),
      );
    }

    try {
      const response = await this.restrictedTransport.sendRestricted(request);
      const outcome = parseFatesOutcome(response, request.requestId);
      return this.service.publish(request, outcome);
    } catch (error) {
      return this.service.publish(
        request,
        failedOutcome(
          request.requestId,
          error instanceof Error ? error : new Error('ANANKE_RESTRICTED_DENY_FAILED'),
        ),
      );
    }
  }

  public async decideApproval(payload: unknown): Promise<PublishDocumentHttpResult> {
    const decision = parseApprovalDecision(payload);
    if (!decision) {
      return { error: 'BAD_REQUEST', reasonCode: 'INVALID_APPROVAL_DECISION' };
    }

    if (!this.operatorStepUpSecret) {
      return { error: 'FORBIDDEN', reasonCode: 'OPERATOR_STEP_UP_UNAVAILABLE' };
    }
    if (!constantTimeSecretEquals(decision.operatorProof, this.operatorStepUpSecret)) {
      return { error: 'FORBIDDEN', reasonCode: 'INVALID_OPERATOR_STEP_UP' };
    }

    this.cleanupPendingApprovals();
    const pending = this.pendingApprovals.get(decision.approvalHandle);
    if (!pending) {
      return { error: 'BAD_REQUEST', reasonCode: 'APPROVAL_NOT_FOUND_OR_EXPIRED' };
    }
    if (pending.state !== 'WAITING') {
      return {
        error: 'CONFLICT',
        reasonCode:
          pending.state === 'DECIDING' ? 'APPROVAL_DECISION_IN_PROGRESS' : 'APPROVAL_TERMINAL',
      };
    }
    if (!this.approvalTransport) {
      pending.state = 'FAILED_CLOSED';
      return this.failClosedApproval(pending, 'APPROVAL_TRANSPORT_UNAVAILABLE');
    }

    // This synchronous state claim is the host-side CAS boundary. No second
    // browser request can enter a privileged approval call after this point.
    pending.state = 'DECIDING';

    try {
      const transition =
        decision.decision === 'APPROVE'
          ? await this.approvalTransport.approve(pending.request, pending.fatesApprovalRequestId)
          : await this.approvalTransport.reject(pending.request, pending.fatesApprovalRequestId);

      if (transition.approvalRequestId !== pending.fatesApprovalRequestId) {
        pending.state = 'FAILED_CLOSED';
        return this.failClosedApproval(pending, 'APPROVAL_BINDING_MISMATCH');
      }

      if (decision.decision === 'REJECT' && transition.approvalState !== 'REJECTED') {
        pending.state = 'FAILED_CLOSED';
        return this.failClosedApproval(pending, 'APPROVAL_STATE_MISMATCH');
      }

      if (transition.approvalState === 'REJECTED' || transition.approvalState === 'EXPIRED') {
        const terminalTransition = transition as AnankeApprovalTransition & {
          approvalState: 'REJECTED' | 'EXPIRED';
        };
        pending.state = transition.approvalState;
        const outcome = terminalApprovalOutcome(
          pending.outcome,
          terminalTransition,
          decision.decision,
        );
        const result = await this.service.publish(pending.request, outcome);
        return withApproval(redactApprovalIdentifiers(result, pending.approvalHandle), {
          approvalHandle: pending.approvalHandle,
          state: transition.approvalState,
          expiresAt: pending.outcome.evidence.expiresAt,
          ...(transition.decisionId ? { decisionId: transition.decisionId } : {}),
          ...(transition.auditId ? { auditId: transition.auditId } : {}),
          ...(transition.operatorId ? { operatorId: transition.operatorId } : {}),
        });
      }

      pending.state = 'APPROVED';
      const governed = await this.approvalTransport.executeApproved(
        pending.request,
        pending.fatesApprovalRequestId,
      );
      const outcome = parseFatesOutcome(governed, pending.request.requestId);
      const result = await this.service.publish(pending.request, outcome);
      return withApproval(redactApprovalIdentifiers(result, pending.approvalHandle), {
        approvalHandle: pending.approvalHandle,
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

  public async status(): Promise<
    Awaited<ReturnType<PublicationStore['status']>> & { sourceReadCount: number }
  > {
    return {
      ...(await this.publicationStore.status()),
      sourceReadCount: this.sourceReadCount.value,
    };
  }

  private rememberPendingApproval(
    request: GovernedRequest,
    outcome: ApprovalRequiredOutcome,
  ): PendingPublicationApproval {
    this.cleanupPendingApprovals();
    if (this.pendingApprovals.size >= 1_024) {
      const oldest = this.pendingApprovals.keys().next().value;
      if (typeof oldest === 'string') this.pendingApprovals.delete(oldest);
    }
    const expiresAt = Date.parse(outcome.evidence.expiresAt ?? '');
    const retainedUntil =
      (Number.isFinite(expiresAt) ? expiresAt : Date.now()) + APPROVAL_RECORD_RETENTION_MS;
    const pending: PendingPublicationApproval = {
      request,
      outcome,
      fatesApprovalRequestId: outcome.approvalBinding.bindingId,
      approvalHandle: `moirae_${randomUUID()}`,
      retainedUntil,
      state: 'WAITING',
    };
    this.pendingApprovals.set(pending.approvalHandle, pending);
    return pending;
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
    pending.state = 'FAILED_CLOSED';
    const outcome = failedOutcome(pending.request.requestId, new Error(reasonCode));
    return this.service.publish(pending.request, outcome) as unknown as PublicationResult;
  }
}

export function createProductionPublishDocumentHttpHandler(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): PublishDocumentHttpHandler {
  assertSafeConsoleCredentialComposition(env);
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
    transport,
    undefined,
    env[MOIRAE_OPERATOR_STEP_UP_SECRET_ENV],
  );
}

export function createProductionInspectDocumentHttpHandler(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): InspectDocumentHttpHandler {
  assertSafeConsoleCredentialComposition(env);
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
  readonly fatesApprovalRequestId: string;
  readonly approvalHandle: string;
  readonly retainedUntil: number;
  state: 'WAITING' | 'DECIDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'FAILED_CLOSED';
}

const APPROVAL_RECORD_RETENTION_MS = 5 * 60 * 1_000;

interface ApprovalDecisionRequest {
  readonly approvalHandle: string;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly operatorProof: string;
}

function restrictedDenyRequest(): GovernedRequest {
  return snapshotGovernedRequest({
    requestId: crypto.randomUUID(),
    action: PUBLISH_DOCUMENT_ACTION,
    parameters: { documentId: DEMO_DOCUMENT_ID },
    caller: {
      kind: 'agent',
      id: 'moirae-restricted-agent',
      sessionId: 'moirae-restricted-agent-session',
    },
    context: {
      source: 'webmcp',
      purpose: 'moirae.document-publication',
    },
  });
}

function parseApprovalDecision(value: unknown): ApprovalDecisionRequest | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'approvalHandle,decision,operatorProof') return undefined;
  if (
    typeof value.approvalHandle !== 'string' ||
    !/^moirae_[A-Za-z0-9_-]{36}$/.test(value.approvalHandle) ||
    (value.decision !== 'APPROVE' && value.decision !== 'REJECT') ||
    typeof value.operatorProof !== 'string' ||
    value.operatorProof.length < 1 ||
    value.operatorProof.length > 256
  ) {
    return undefined;
  }
  return {
    approvalHandle: value.approvalHandle,
    decision: value.decision,
    operatorProof: value.operatorProof,
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

function redactApprovalIdentifiers(
  result: PublicationResult,
  approvalHandle: string,
): PublicationResult {
  const safeEvidence = { ...result.outcome.evidence };
  delete safeEvidence.approvalRequestId;
  const outcome =
    result.outcome.status === 'REQUIRES_APPROVAL'
      ? {
          ...result.outcome,
          evidence: safeEvidence,
          approvalBinding: {
            ...result.outcome.approvalBinding,
            bindingId: approvalHandle,
          },
        }
      : { ...result.outcome, evidence: safeEvidence };
  return { ...result, outcome };
}

function constantTimeSecretEquals(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (candidateBytes.byteLength !== expectedBytes.byteLength) return false;
  return timingSafeEqual(candidateBytes, expectedBytes);
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
