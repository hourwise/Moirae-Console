import { createHash } from 'node:crypto';

import { snapshotGovernedRequest } from '../src/fates/client';
import type { FatesClient } from '../src/fates/client';
import type { GovernanceOutcome, GovernedRequest } from '../src/fates/types';
import type { PublicationLifecyclePhase, PublicationResult } from '../src/publication/types';
import type { WebMcpGovernedInvocation, WebMcpInvocation } from '../src/webmcp/types';
import { createWebMcpAdapter } from '../src/webmcp/adapter';
import { DEMO_DOCUMENT_ID } from '../src/webmcp/inspect-document';
import { PUBLISH_DOCUMENT_ACTION, PUBLISH_DOCUMENT_TOOL } from '../src/webmcp/publish-document';
import type { HostDocumentSource } from './document-source';
import { FixedDemoDocumentSource } from './document-source';
import {
  InMemoryAuthorityConsumptionStore,
  type AuthorityConsumptionStore,
} from './authority-consumption';
import type { PublicationStore } from './publication-store';
import {
  calculateMoiraePublicationAuthorityReceiptDigest,
  calculateMoiraePublicationRequestDigest,
  MOIRAE_PUBLICATION_AUTHORITY_BINDING,
  MOIRAE_PUBLICATION_FATES_ACTION,
  MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
  MOIRAE_PUBLICATION_FATES_PURPOSE,
  MOIRAE_PUBLICATION_MAX_LIFETIME_MS,
  MOIRAE_PUBLICATION_DESTINATION_ID,
} from './moirae-publication-authority';
import { FixedFilePublicationStore } from './publication-store';

export type PublicationMode = 'production' | 'synthetic-demo';

export interface PublishDocumentServiceOptions {
  readonly mode: PublicationMode;
  readonly documentSource?: HostDocumentSource;
  readonly consumptionStore?: AuthorityConsumptionStore;
  readonly publicationStore?: PublicationStore;
  readonly now?: () => number;
}

export class PublishDocumentService {
  private readonly documentSource: HostDocumentSource;
  private readonly consumptionStore: AuthorityConsumptionStore;
  private readonly publicationStore: PublicationStore;
  private readonly now: () => number;

  public constructor(private readonly options: PublishDocumentServiceOptions) {
    this.documentSource = options.documentSource ?? new FixedDemoDocumentSource();
    this.consumptionStore = options.consumptionStore ?? new InMemoryAuthorityConsumptionStore();
    this.publicationStore = options.publicationStore ?? new FixedFilePublicationStore();
    this.now = options.now ?? Date.now;
  }

  public async publish(
    request: GovernedRequest,
    outcome: GovernanceOutcome,
  ): Promise<PublicationResult> {
    const snapshot = snapshotGovernedRequest(request);
    const phases = initialLifecycle();
    const evidenceMode = evidenceModeFor(outcome);
    const nowMs = this.now();

    if (!mayPublish(outcome, snapshot, this.options.mode, nowMs)) {
      return notPublished(
        snapshot,
        outcome,
        phases,
        evidenceMode,
        reasonForNoPublication(outcome, snapshot, nowMs),
      );
    }

    const expiresAtMs = Date.parse(outcome.evidence.expiresAt as string);
    const claim = this.consumptionStore.claim(
      outcome.evidence.receiptId as string,
      expiresAtMs,
      nowMs,
    );
    if (!claim.accepted) {
      return notPublished(
        snapshot,
        outcome,
        phases,
        evidenceMode,
        claim.reason === 'replayed'
          ? 'REPLAY_REJECTED'
          : claim.reason === 'expired'
            ? 'STALE_AUTHORITY'
            : 'AUTHORITY_CONSUMPTION_UNAVAILABLE',
      );
    }

    const allowedPhases: PublicationLifecyclePhase[] = [
      ...phases,
      {
        name: 'ALLOWED',
        source: 'fates-authoritative',
        evidenceId: outcome.evidence.evidenceId,
      },
    ];

    try {
      const documentId = readDocumentId(snapshot.parameters);
      if (documentId !== DEMO_DOCUMENT_ID) {
        return notPublished(
          snapshot,
          outcome,
          allowedPhases,
          evidenceMode,
          'DOCUMENT_REQUEST_INVALID',
        );
      }
      const document = await this.documentSource.read(documentId);
      if (document.documentId !== DEMO_DOCUMENT_ID || !(document.bytes instanceof Uint8Array)) {
        return notPublished(
          snapshot,
          outcome,
          allowedPhases,
          evidenceMode,
          'DOCUMENT_SOURCE_INVALID',
        );
      }

      const actualSha256 = sha256(document.bytes);
      if (actualSha256 !== MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256) {
        return notPublished(
          snapshot,
          outcome,
          allowedPhases,
          evidenceMode,
          'DOCUMENT_DIGEST_MISMATCH',
        );
      }

      const executionPhases: PublicationLifecyclePhase[] = [
        ...allowedPhases,
        { name: 'HOST EXECUTION', source: 'host-executed' },
      ];
      const write = await this.publicationStore.publish({
        documentId,
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
        bytes: document.bytes,
        expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
      });

      return {
        request: snapshot,
        outcome,
        phases: [...executionPhases, { name: 'PUBLISHED', source: 'host-executed' }],
        publication: {
          state: 'PUBLISHED',
          evidenceMode,
          destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
          hostPublicationState: write.state,
          hostPublicationExecutorInvocationCount: write.executorInvocationCount,
        },
      };
    } catch (error) {
      return notPublished(
        snapshot,
        outcome,
        allowedPhases,
        evidenceMode,
        error instanceof Error ? error.message : 'PUBLICATION_FAILED',
      );
    }
  }
}

export function governPublishDocumentInvocation(
  client: FatesClient,
  invocation: WebMcpInvocation,
): Promise<WebMcpGovernedInvocation> {
  const adapter = createWebMcpAdapter({ client, tools: [PUBLISH_DOCUMENT_TOOL] });
  return adapter.invokeGoverned(invocation);
}

function mayPublish(
  outcome: GovernanceOutcome,
  request: GovernedRequest,
  mode: PublicationMode,
  nowMs: number,
): boolean {
  if (mode !== 'production' || outcome.status !== 'ALLOWED') return false;
  if (!isExactPublishRequest(request) || outcome.requestId !== request.requestId) return false;

  const evidence = outcome.evidence;
  const transportBinding = evidence.transportBinding;
  return (
    evidence.source === 'fates' &&
    evidence.authority === 'authoritative' &&
    outcome.outcomeId === evidence.outcomeId &&
    evidence.canonicalAction === MOIRAE_PUBLICATION_FATES_ACTION &&
    evidence.documentId === DEMO_DOCUMENT_ID &&
    evidence.expectedSha256 === MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256 &&
    evidence.destinationId === MOIRAE_PUBLICATION_DESTINATION_ID &&
    evidence.purpose === MOIRAE_PUBLICATION_FATES_PURPOSE &&
    nonEmptyString(evidence.fatesRequestId) &&
    evidence.correlationId === request.requestId &&
    evidence.canonicalRequestDigest ===
      calculateMoiraePublicationRequestDigest({
        documentId: DEMO_DOCUMENT_ID,
        expectedSha256: MOIRAE_PUBLICATION_FATES_EXPECTED_SHA256,
        destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
      }) &&
    isSha256(evidence.authorityBindingDigest) &&
    isSha256(evidence.authorityReceiptDigest) &&
    isCanonicalTimestampWithinLifetime(evidence.issuedAt, evidence.expiresAt, nowMs) &&
    nonEmptyString(evidence.receiptId) &&
    nonEmptyString(evidence.nonce) &&
    isSha256(evidence.replayKeyDigest) &&
    evidence.replayKeyDigest === evidence.authorityBindingDigest &&
    evidence.replayState === 'CONSUMED_ONCE' &&
    nonEmptyString(evidence.decisionId) &&
    nonEmptyString(evidence.outcomeId) &&
    nonEmptyString(evidence.auditId) &&
    evidence.outcomeState === 'COMPLETED' &&
    evidence.policyDecision === 'ALLOW' &&
    evidence.effectSemantics === 'AUTHORIZATION_ONLY_NO_PUBLICATION' &&
    evidence.fatesResourceReadAttemptCount === 0 &&
    evidence.fatesPublicationAttemptCount === 0 &&
    evidence.documentPublicationByFates === false &&
    isAuthenticatedPublicationWorkload(evidence.authenticatedWorkloadIdentity) &&
    evidence.authorityReceiptDigest ===
      calculateMoiraePublicationAuthorityReceiptDigest({
        documentId: evidence.documentId as string,
        expectedSha256: evidence.expectedSha256 as string,
        destinationId: evidence.destinationId as string,
        purpose: evidence.purpose as string,
        fatesRequestId: evidence.fatesRequestId as string,
        correlationId: evidence.correlationId as string,
        canonicalRequestDigest: evidence.canonicalRequestDigest as string,
        authorityBindingDigest: evidence.authorityBindingDigest as string,
        policyVersion: evidence.policyVersion as string,
        decisionId: evidence.decisionId as string,
        outcomeId: evidence.outcomeId as string,
        issuedAt: evidence.issuedAt as string,
        expiresAt: evidence.expiresAt as string,
        receiptId: evidence.receiptId as string,
        nonce: evidence.nonce as string,
      }) &&
    transportBinding?.canonicalAction === MOIRAE_PUBLICATION_AUTHORITY_BINDING.canonicalAction &&
    transportBinding.documentId === MOIRAE_PUBLICATION_AUTHORITY_BINDING.documentId &&
    transportBinding.expectedSha256 === MOIRAE_PUBLICATION_AUTHORITY_BINDING.expectedSha256 &&
    transportBinding.destinationId === MOIRAE_PUBLICATION_AUTHORITY_BINDING.destinationId &&
    transportBinding.purpose === MOIRAE_PUBLICATION_AUTHORITY_BINDING.purpose &&
    transportBinding.correlationId === request.requestId
  );
}

function isExactPublishRequest(request: GovernedRequest): boolean {
  if (request.action !== PUBLISH_DOCUMENT_ACTION || !isRecord(request.parameters)) return false;
  const keys = Object.keys(request.parameters);
  return (
    keys.length === 1 &&
    keys[0] === 'documentId' &&
    request.parameters.documentId === DEMO_DOCUMENT_ID
  );
}

function notPublished(
  request: GovernedRequest,
  outcome: GovernanceOutcome,
  phases: readonly PublicationLifecyclePhase[],
  evidenceMode: PublicationResult['publication']['evidenceMode'],
  reasonCode: string,
): PublicationResult {
  return {
    request,
    outcome,
    phases,
    publication: {
      state: 'NOT_PUBLISHED',
      evidenceMode,
      reasonCode,
      destinationId: MOIRAE_PUBLICATION_DESTINATION_ID,
    },
  };
}

function reasonForNoPublication(
  outcome: GovernanceOutcome,
  request: GovernedRequest,
  nowMs: number,
): string {
  if (outcome.requestId !== request.requestId) return 'REQUEST_ID_MISMATCH';
  if (!isExactPublishRequest(request)) return 'PUBLICATION_REQUEST_INVALID';
  if (outcome.status === 'REQUIRES_APPROVAL') return 'APPROVAL_NOT_IMPLEMENTED';
  if (outcome.status === 'FAILED' && outcome.errorCode === 'CONFLICT') return 'REPLAY_REJECTED';
  if (outcome.status === 'FAILED' && outcome.errorCode === 'STALE_STATE') return 'STALE_AUTHORITY';
  if (outcome.status === 'ALLOWED') {
    const expiresAtMs = Date.parse(outcome.evidence.expiresAt ?? '');
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) return 'STALE_AUTHORITY';
    return 'UNVERIFIABLE_AUTHORIZATION';
  }
  return outcome.status;
}

function initialLifecycle(): readonly PublicationLifecyclePhase[] {
  return [
    { name: 'REQUESTED', source: 'local-observed' },
    { name: 'IDENTIFIED', source: 'local-observed' },
    { name: 'FATES GOVERNANCE', source: 'local-observed' },
  ];
}

function evidenceModeFor(
  outcome: GovernanceOutcome,
): PublicationResult['publication']['evidenceMode'] {
  if (outcome.evidence.source === 'fates' && outcome.evidence.authority === 'authoritative') {
    return 'AUTHORITATIVE';
  }
  if (outcome.evidence.source === 'synthetic-test') return 'SYNTHETIC_TEST_ONLY';
  return 'UNVERIFIED';
}

function readDocumentId(parameters: unknown): string | undefined {
  return isRecord(parameters) && typeof parameters.documentId === 'string'
    ? parameters.documentId
    : undefined;
}

function isAuthenticatedPublicationWorkload(
  value: Readonly<Record<string, string>> | undefined,
): boolean {
  return Boolean(
    value?.authenticatedPrincipalId === 'moirae-console-host' &&
    value.actingPrincipalId === 'moirae-document-publication-agent',
  );
}

function isCanonicalTimestampWithinLifetime(
  issuedAt: unknown,
  expiresAt: unknown,
  nowMs: number,
): issuedAt is string {
  if (typeof issuedAt !== 'string' || typeof expiresAt !== 'string') return false;
  const issuedAtMs = Date.parse(issuedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) return false;
  if (new Date(issuedAtMs).toISOString() !== issuedAt) return false;
  if (new Date(expiresAtMs).toISOString() !== expiresAt) return false;
  return (
    issuedAtMs <= nowMs &&
    expiresAtMs > nowMs &&
    expiresAtMs > issuedAtMs &&
    expiresAtMs - issuedAtMs <= MOIRAE_PUBLICATION_MAX_LIFETIME_MS
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
