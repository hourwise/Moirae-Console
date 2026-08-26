import { createHash } from 'node:crypto';

import { snapshotGovernedRequest } from '../src/fates/client';
import type { GovernanceOutcome, GovernedRequest } from '../src/fates/types';
import type { WebMcpGovernedInvocation, WebMcpInvocation } from '../src/webmcp/types';
import { createWebMcpAdapter } from '../src/webmcp/adapter';
import {
  DEMO_DOCUMENT_ID,
  INSPECT_DOCUMENT_ACTION,
  INSPECT_DOCUMENT_TOOL,
} from '../src/webmcp/inspect-document';
import type {
  InspectionResult,
  LifecyclePhase,
  LifecyclePhaseSource,
} from '../src/inspection/types';
import { FixedDemoDocumentSource } from './document-source';
import type { HostDocumentSource } from './document-source';
import {
  MOIRAE_AUTHORITY_BINDING,
  MOIRAE_FATES_ACTION,
  MOIRAE_FATES_CANONICAL_REQUEST_DIGEST,
  MOIRAE_FATES_EXPECTED_SHA256,
  MOIRAE_FATES_PURPOSE,
} from './moirae-authority';

export type InspectDisclosureMode = 'production' | 'synthetic-demo';

export interface InspectDocumentServiceOptions {
  readonly mode: InspectDisclosureMode;
  readonly documentSource?: HostDocumentSource;
}

export class InspectDocumentService {
  private readonly documentSource: HostDocumentSource;

  public constructor(private readonly options: InspectDocumentServiceOptions) {
    this.documentSource = options.documentSource ?? new FixedDemoDocumentSource();
  }

  public async disclose(
    request: GovernedRequest,
    outcome: GovernanceOutcome,
  ): Promise<InspectionResult> {
    const snapshot = snapshotGovernedRequest(request);
    const initialPhases = initialLifecycle();
    const evidenceMode = evidenceModeFor(outcome);

    if (!mayDisclose(outcome, snapshot, this.options.mode)) {
      return {
        request: snapshot,
        outcome,
        phases: initialPhases,
        disclosure: {
          state: 'NOT_DISCLOSED',
          evidenceMode,
          reasonCode: reasonForNoDisclosure(outcome, snapshot),
        },
      };
    }

    const admittedPhase: LifecyclePhase = {
      name: 'ADMITTED',
      source: phaseSourceFor(this.options.mode),
      evidenceId: outcome.evidence.evidenceId,
    };

    try {
      const documentId = readDocumentId(snapshot.parameters);
      if (documentId === null) {
        return {
          request: snapshot,
          outcome,
          phases: initialPhases,
          disclosure: {
            state: 'NOT_DISCLOSED',
            evidenceMode,
            reasonCode: 'DOCUMENT_REQUEST_INVALID',
          },
        };
      }
      const document = await this.documentSource.read(documentId);
      if (document.documentId !== documentId) {
        return {
          request: snapshot,
          outcome,
          phases: [...initialPhases, admittedPhase],
          hostDocumentReadCount: 1,
          disclosure: {
            state: 'NOT_DISCLOSED',
            evidenceMode,
            reasonCode: 'DOCUMENT_ID_MISMATCH',
          },
        };
      }

      const bytes = document.bytes
        ? Uint8Array.from(document.bytes)
        : new TextEncoder().encode(document.content);
      const actualSha256 = createHash('sha256').update(bytes).digest('hex');
      if (this.options.mode === 'production' && actualSha256 !== outcome.evidence.expectedSha256) {
        return {
          request: snapshot,
          outcome,
          phases: [...initialPhases, admittedPhase],
          hostDocumentReadCount: 1,
          disclosure: {
            state: 'NOT_DISCLOSED',
            evidenceMode,
            reasonCode: 'DOCUMENT_DIGEST_MISMATCH',
          },
        };
      }

      return {
        request: snapshot,
        outcome,
        phases: [...initialPhases, admittedPhase, { name: 'EXECUTED', source: 'host-executed' }],
        hostDocumentReadCount: 1,
        disclosure: {
          state: 'DISCLOSED',
          evidenceMode,
        },
        document: {
          documentId: document.documentId,
          content: new TextDecoder().decode(bytes),
        },
      };
    } catch {
      return {
        request: snapshot,
        outcome,
        phases: [...initialPhases, admittedPhase],
        disclosure: {
          state: 'NOT_DISCLOSED',
          evidenceMode,
          reasonCode: 'DOCUMENT_SOURCE_UNAVAILABLE',
        },
      };
    }
  }
}

export async function governInspectDocumentInvocation(
  client: Parameters<typeof createWebMcpAdapter>[0]['client'],
  invocation: WebMcpInvocation,
): Promise<WebMcpGovernedInvocation> {
  const adapter = createWebMcpAdapter({
    client,
    tools: [INSPECT_DOCUMENT_TOOL],
  });
  return adapter.invokeGoverned(invocation);
}

export function mayDisclose(
  outcome: unknown,
  request: GovernedRequest,
  mode: InspectDisclosureMode,
): boolean {
  if (!isStructurallyValidAllowedOutcome(outcome)) {
    return false;
  }

  if (outcome.requestId !== request.requestId || !isExactInspectRequest(request)) {
    return false;
  }

  if (mode === 'production') {
    return isAuthoritativeMoiraeAllow(outcome, request);
  }

  return outcome.evidence.source === 'synthetic-test' && outcome.evidence.authority === 'synthetic';
}

function isExactInspectRequest(request: GovernedRequest): boolean {
  if (request.action !== INSPECT_DOCUMENT_ACTION || !isRecord(request.parameters)) {
    return false;
  }

  const keys = Object.keys(request.parameters);
  return (
    keys.length === 1 &&
    keys[0] === 'documentId' &&
    readDocumentId(request.parameters) === DEMO_DOCUMENT_ID
  );
}

function isAuthoritativeMoiraeAllow(
  outcome: GovernanceOutcome & { readonly status: 'ALLOWED' },
  request: GovernedRequest,
): boolean {
  const evidence = outcome.evidence;
  const identity = evidence.authenticatedWorkloadIdentity;
  const transportBinding = evidence.transportBinding;
  return (
    evidence.source === 'fates' &&
    evidence.authority === 'authoritative' &&
    outcome.outcomeId === evidence.outcomeId &&
    nonEmptyString(evidence.canonicalAction) &&
    evidence.canonicalAction === MOIRAE_FATES_ACTION &&
    evidence.documentId === DEMO_DOCUMENT_ID &&
    evidence.expectedSha256 === MOIRAE_FATES_EXPECTED_SHA256 &&
    evidence.purpose === MOIRAE_FATES_PURPOSE &&
    nonEmptyString(evidence.fatesRequestId) &&
    evidence.correlationId === request.requestId &&
    evidence.canonicalRequestDigest === MOIRAE_FATES_CANONICAL_REQUEST_DIGEST &&
    isSha256(evidence.authorityBindingDigest) &&
    nonEmptyString(evidence.decisionId) &&
    nonEmptyString(evidence.outcomeId) &&
    nonEmptyString(evidence.auditId) &&
    evidence.outcomeState === 'COMPLETED' &&
    evidence.policyDecision === 'ALLOW' &&
    evidence.effectSemantics === 'AUTHORIZATION_ONLY_NO_RESOURCE_READ' &&
    evidence.fatesResourceReadAttemptCount === 0 &&
    evidence.documentDisclosureByFates === false &&
    isAuthenticatedWorkloadIdentity(identity) &&
    transportBinding?.canonicalAction === MOIRAE_AUTHORITY_BINDING.canonicalAction &&
    transportBinding.documentId === MOIRAE_AUTHORITY_BINDING.documentId &&
    transportBinding.expectedSha256 === MOIRAE_AUTHORITY_BINDING.expectedSha256 &&
    transportBinding.purpose === MOIRAE_AUTHORITY_BINDING.purpose &&
    transportBinding.correlationId === request.requestId
  );
}

function isStructurallyValidAllowedOutcome(value: unknown): value is GovernanceOutcome & {
  readonly status: 'ALLOWED';
} {
  if (!isRecord(value) || value.status !== 'ALLOWED') {
    return false;
  }

  if (!nonEmptyString(value.requestId) || !nonEmptyString(value.outcomeId)) {
    return false;
  }

  const evidence = value.evidence;
  return (
    isRecord(evidence) &&
    nonEmptyString(evidence.evidenceId) &&
    nonEmptyString(evidence.source) &&
    nonEmptyString(evidence.authority)
  );
}

function readDocumentId(parameters: unknown): string | null {
  if (!isRecord(parameters) || typeof parameters.documentId !== 'string') {
    return null;
  }
  return parameters.documentId;
}

function initialLifecycle(): readonly LifecyclePhase[] {
  return [
    { name: 'REQUESTED', source: 'local-observed' },
    { name: 'IDENTIFIED', source: 'local-observed' },
    { name: 'PREFLIGHT', source: 'local-observed' },
  ];
}

function phaseSourceFor(mode: InspectDisclosureMode): LifecyclePhaseSource {
  return mode === 'production' ? 'fates-authoritative' : 'synthetic-test-only';
}

function evidenceModeFor(
  outcome: GovernanceOutcome,
): InspectionResult['disclosure']['evidenceMode'] {
  if (outcome.evidence.source === 'fates' && outcome.evidence.authority === 'authoritative') {
    return 'AUTHORITATIVE';
  }
  if (outcome.evidence.source === 'synthetic-test') {
    return 'SYNTHETIC_TEST_ONLY';
  }
  return 'UNVERIFIED';
}

function reasonForNoDisclosure(outcome: GovernanceOutcome, request: GovernedRequest): string {
  if (outcome.requestId !== request.requestId) {
    return 'REQUEST_ID_MISMATCH';
  }
  if (!isExactInspectRequest(request)) {
    return 'DOCUMENT_REQUEST_INVALID';
  }
  if (outcome.status === 'REQUIRES_APPROVAL') {
    return 'APPROVAL_NOT_IMPLEMENTED';
  }
  if (outcome.status === 'ALLOWED') {
    return 'UNVERIFIABLE_AUTHORIZATION';
  }
  return outcome.status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isAuthenticatedWorkloadIdentity(
  value: Readonly<Record<string, string>> | undefined,
): boolean {
  return Boolean(
    value &&
    nonEmptyString(value.authenticatedPrincipalId) &&
    nonEmptyString(value.actingPrincipalId),
  );
}
