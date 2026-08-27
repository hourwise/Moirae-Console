import { useEffect, useState } from 'react';

import {
  decidePublicationApproval,
  requestPublicationDenyDemo,
  requestPublicationStatus,
  requestPublishDocument,
} from '../publication/client';
import type { PublicationResult, PublicationStatusSnapshot } from '../publication/types';
import { GovernanceSummary, type GovernanceTone } from './GovernanceSummary';
import { TechnicalEvidence } from './TechnicalEvidence';

type PanelState =
  | { readonly status: 'IDLE'; readonly snapshot?: PublicationStatusSnapshot }
  | { readonly status: 'REQUESTED'; readonly requestId: string }
  | {
      readonly status: 'RESULT';
      readonly result: PublicationResult;
      readonly snapshot?: PublicationStatusSnapshot;
      readonly message?: string;
    }
  | { readonly status: 'ERROR'; readonly requestId: string; readonly message: string };

export function PublishDocumentPanel() {
  const [state, setState] = useState<PanelState>({ status: 'IDLE' });
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [operatorProof, setOperatorProof] = useState('');

  useEffect(() => {
    void requestPublicationStatus()
      .then((snapshot) => setState({ status: 'IDLE', snapshot }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleWebMcpResult = (event: Event) => {
      const detail = (event as CustomEvent<{ toolName?: string; result?: PublicationResult }>)
        .detail;
      if (detail?.toolName === 'publish_document' && detail.result) {
        void requestPublicationStatus()
          .catch(() => undefined)
          .then((snapshot) =>
            setState({
              status: 'RESULT',
              result: detail.result!,
              ...(snapshot ? { snapshot } : {}),
            }),
          );
      }
    };
    window.addEventListener('moirae:webmcp-result', handleWebMcpResult);
    return () => window.removeEventListener('moirae:webmcp-result', handleWebMcpResult);
  }, []);

  async function submitRequest() {
    const requestId = crypto.randomUUID();
    setState({ status: 'REQUESTED', requestId });

    try {
      const result = await requestPublishDocument(requestId);
      const snapshot = await requestPublicationStatus().catch(() => undefined);
      setState({ status: 'RESULT', result, ...(snapshot ? { snapshot } : {}) });
    } catch (error) {
      setState({
        status: 'ERROR',
        requestId,
        message: error instanceof Error ? error.message : 'PUBLISH_DOCUMENT_FAILED',
      });
    }
  }

  async function decideApproval(decision: 'APPROVE' | 'REJECT', proof: string) {
    if (state.status !== 'RESULT' || state.result.approval?.state !== 'WAITING_FOR_APPROVAL') {
      return;
    }
    const approvalHandle = state.result.approval.approvalHandle;
    setApprovalBusy(true);
    try {
      const result = await decidePublicationApproval(approvalHandle, decision, proof);
      const snapshot = await requestPublicationStatus().catch(() => undefined);
      setState({ status: 'RESULT', result, ...(snapshot ? { snapshot } : {}) });
      setOperatorProof('');
    } catch (error) {
      setState({
        ...state,
        message: error instanceof Error ? error.message : 'APPROVAL_DECISION_FAILED',
      });
    } finally {
      setApprovalBusy(false);
    }
  }

  async function runRestrictedDenyDemo() {
    const requestId = crypto.randomUUID();
    setState({ status: 'REQUESTED', requestId });

    try {
      const result = await requestPublicationDenyDemo();
      const snapshot = await requestPublicationStatus().catch(() => undefined);
      setState({ status: 'RESULT', result, ...(snapshot ? { snapshot } : {}) });
    } catch (error) {
      setState({
        status: 'ERROR',
        requestId,
        message: error instanceof Error ? error.message : 'MC06_DENY_DEMO_FAILED',
      });
    }
  }

  const result = state.status === 'RESULT' ? state.result : undefined;
  const snapshot =
    state.status === 'IDLE' || state.status === 'RESULT' ? state.snapshot : undefined;

  return (
    <section className="inspection-panel publication-panel" aria-labelledby="publication-heading">
      <div className="inspection-header">
        <div>
          <p className="card-label">Governed publication</p>
          <h2 id="publication-heading">Publish document</h2>
          <code className="tool-name">publish_document</code>
        </div>
        <div className="panel-actions">
          <button
            className="button-primary"
            type="button"
            onClick={submitRequest}
            disabled={state.status === 'REQUESTED' || approvalBusy}
          >
            {state.status === 'REQUESTED' ? 'Requesting…' : 'Request publication'}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={runRestrictedDenyDemo}
            disabled={state.status === 'REQUESTED' || approvalBusy}
          >
            Run restricted DENY demo
          </button>
        </div>
      </div>

      <p className="inspection-copy">
        Propose publication of the same fixed document. The Fates may allow, require a human
        decision, or deny it; only the Console host performs the bounded write.
      </p>

      {state.status === 'IDLE' && (
        <div className="instruction-card">
          <span>2</span>
          <p>
            <strong>The agent requests publication.</strong>
            The Fates decides authority; a human decision is required by the demonstration policy.
          </p>
        </div>
      )}
      {state.status === 'REQUESTED' && (
        <p className="result-note result-note--pending">
          REQUESTED · Awaiting an authoritative Fates decision · {state.requestId}
        </p>
      )}
      {state.status === 'ERROR' && (
        <p className="result-note result-note--blocked">
          NOT PUBLISHED · {state.message} · {state.requestId}
        </p>
      )}
      {state.status === 'RESULT' && state.message && (
        <p className="result-note result-note--blocked">DECISION NOT CONFIRMED · {state.message}</p>
      )}
      {snapshot && <PublicationStatusView snapshot={snapshot} />}
      {result && (
        <PublicationResultView
          result={result}
          approvalBusy={approvalBusy}
          operatorProof={operatorProof}
          onOperatorProofChange={setOperatorProof}
          onApprovalDecision={decideApproval}
        />
      )}
    </section>
  );
}

export function PublicationResultView({
  result,
  approvalBusy,
  operatorProof,
  onOperatorProofChange,
  onApprovalDecision,
}: {
  readonly result: PublicationResult;
  readonly approvalBusy: boolean;
  readonly operatorProof: string;
  readonly onOperatorProofChange: (value: string) => void;
  readonly onApprovalDecision: (decision: 'APPROVE' | 'REJECT', proof: string) => void;
}) {
  const summary = summaryForPublication(result);
  const waitingForApproval = result.approval?.state === 'WAITING_FOR_APPROVAL';
  const denied = result.outcome.status === 'DENIED';
  const alreadyPublished = result.publication.hostPublicationState === 'ALREADY_PUBLISHED';
  const newlyPublished =
    result.publication.state === 'PUBLISHED' &&
    result.publication.hostPublicationState === 'PUBLISHED';

  return (
    <div className="inspection-result">
      <GovernanceSummary label="Publication governance result" steps={summary} />

      <p className={`outcome-explanation ${outcomeClassName(result)}`}>
        {publicationExplanation(result)}
      </p>

      {waitingForApproval && (
        <div className="approval-card" aria-label="Human publication approval">
          <p className="card-label">Human decision · required by The Fates</p>
          <h3>Human approval required</h3>
          <p className="approval-intro">
            Review the fixed operation below. No publication effect has occurred for this request.
          </p>
          <dl className="approval-facts">
            <EvidenceItem label="Document" value="demo-policy-001" />
            <EvidenceItem label="Destination" value="Demo publication slot" />
            <EvidenceItem
              label="Fates-authenticated agent"
              value={
                result.outcome.evidence.authenticatedWorkloadIdentity?.actingPrincipalId ??
                result.request.caller.id
              }
            />
            <EvidenceItem label="Expires" value={result.approval?.expiresAt ?? '—'} />
          </dl>
          <label className="operator-proof-field">
            <span>
              Operator step-up proof
              <small>Required before the host may submit a human decision to The Fates.</small>
            </span>
            <input
              type="password"
              autoComplete="off"
              value={operatorProof}
              onChange={(event) => onOperatorProofChange(event.target.value)}
              placeholder="Enter operator proof"
              aria-label="Operator step-up proof"
            />
          </label>
          <div className="approval-actions">
            <button
              className="button-primary"
              type="button"
              onClick={() => onApprovalDecision('APPROVE', operatorProof)}
              disabled={approvalBusy || operatorProof.length === 0}
            >
              {approvalBusy ? 'Submitting…' : 'Approve'}
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => onApprovalDecision('REJECT', operatorProof)}
              disabled={approvalBusy || operatorProof.length === 0}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {denied && (
        <div className="denial-callout" aria-label="Authoritative publication denial">
          <span aria-hidden="true">⊘</span>
          <div>
            <p className="card-label">Policy enforcement succeeded</p>
            <h3>Denied</h3>
            <p>
              The restricted agent does not have publication authority. The host performed no
              publication effect.
            </p>
          </div>
        </div>
      )}

      {alreadyPublished && (
        <div className="idempotent-callout" aria-label="Publication already present">
          <span aria-hidden="true">✓</span>
          <div>
            <h3>No new write was required</h3>
            <p>
              The approved document was already present at the destination with the same expected
              digest.
            </p>
          </div>
        </div>
      )}

      {newlyPublished && (
        <div className="idempotent-callout" aria-label="Publication completed">
          <span aria-hidden="true">✓</span>
          <div>
            <h3>Publication completed</h3>
            <p>The Console host published the exact bytes authorised by The Fates.</p>
          </div>
        </div>
      )}

      <TechnicalEvidence phases={result.phases}>
        <dl className="evidence-grid">
          <EvidenceItem label="Request ID" value={result.request.requestId} />
          <EvidenceItem label="Action" value={result.request.action} />
          <EvidenceItem label="Proposal / agent label" value={result.request.caller.id} />
          <EvidenceItem
            label="Fates authenticated principal"
            value={result.outcome.evidence.authenticatedWorkloadIdentity?.actingPrincipalId ?? '—'}
          />
          <EvidenceItem label="Decision" value={result.outcome.status} />
          <EvidenceItem label="Approval state" value={result.approval?.state ?? '—'} />
          <EvidenceItem label="Publication state" value={result.publication.state} />
          <EvidenceItem label="Evidence ID" value={result.outcome.evidence.evidenceId} />
          <EvidenceItem label="Receipt ID" value={result.outcome.evidence.receiptId ?? '—'} />
          <EvidenceItem label="Decision ID" value={result.outcome.evidence.decisionId ?? '—'} />
          <EvidenceItem
            label="Outcome ID"
            value={result.outcome.evidence.outcomeId ?? result.outcome.outcomeId}
          />
          <EvidenceItem label="Audit ID" value={result.outcome.evidence.auditId ?? '—'} />
          <EvidenceItem
            label="Fates action"
            value={result.outcome.evidence.canonicalAction ?? '—'}
          />
          <EvidenceItem
            label="Fates request / correlation"
            value={`${result.outcome.evidence.fatesRequestId ?? '—'} / ${result.outcome.evidence.correlationId ?? '—'}`}
          />
          <EvidenceItem
            label="Destination"
            value={result.outcome.evidence.destinationId ?? result.publication.destinationId}
          />
          <EvidenceItem
            label="Source digest"
            value={result.outcome.evidence.expectedSha256 ?? '—'}
          />
          <EvidenceItem label="Purpose" value={result.outcome.evidence.purpose ?? '—'} />
          <EvidenceItem
            label="Canonical request digest"
            value={result.outcome.evidence.canonicalRequestDigest ?? '—'}
          />
          <EvidenceItem
            label="Authority binding digest"
            value={result.outcome.evidence.authorityBindingDigest ?? '—'}
          />
          <EvidenceItem
            label="Authority receipt digest"
            value={result.outcome.evidence.authorityReceiptDigest ?? '—'}
          />
          <EvidenceItem
            label="Authority lifetime"
            value={`${result.outcome.evidence.issuedAt ?? '—'} → ${result.outcome.evidence.expiresAt ?? '—'}`}
          />
          <EvidenceItem label="Replay state" value={result.outcome.evidence.replayState ?? '—'} />
          <EvidenceItem
            label="Policy version"
            value={result.outcome.evidence.policyVersion ?? '—'}
          />
          <EvidenceItem
            label="Policy decision / reason"
            value={`${result.outcome.evidence.policyDecision ?? '—'} / ${result.outcome.evidence.policyReason ?? result.outcome.evidence.policyReasonCode ?? '—'}`}
          />
          <EvidenceItem
            label="Effect semantics"
            value={result.outcome.evidence.effectSemantics ?? '—'}
          />
          <EvidenceItem
            label="Fates resource reads"
            value={result.outcome.evidence.fatesResourceReadAttemptCount ?? '—'}
          />
          <EvidenceItem
            label="Fates publication attempts"
            value={result.outcome.evidence.fatesPublicationAttemptCount ?? '—'}
          />
          <EvidenceItem
            label="Fates publication"
            value={formatBoolean(result.outcome.evidence.documentPublicationByFates)}
          />
          <EvidenceItem
            label="Host execution"
            value={result.publication.hostPublicationState ?? '—'}
          />
          <EvidenceItem
            label="Host executor calls"
            value={result.publication.hostPublicationExecutorInvocationCount ?? '—'}
          />
          <EvidenceItem
            label="Approval decision / audit"
            value={`${result.approval?.decisionId ?? '—'} / ${result.approval?.auditId ?? '—'}`}
          />
          <EvidenceItem label="Approval operator" value={result.approval?.operatorId ?? '—'} />
          <EvidenceItem
            label="Provenance"
            value={formatProvenance(result.outcome.evidence.provenance)}
          />
        </dl>
      </TechnicalEvidence>
    </div>
  );
}

function PublicationStatusView({ snapshot }: { readonly snapshot: PublicationStatusSnapshot }) {
  return (
    <aside className="destination-status" aria-label="Existing publication destination status">
      <div>
        <p className="card-label">Existing destination</p>
        <strong>{snapshot.published ? 'Previously published ✓' : 'Not yet published'}</strong>
        <p>
          This is destination state from before or after the current request—not proof that the
          current request performed a write.
        </p>
      </div>
      <dl>
        <EvidenceItem label="Destination" value={snapshot.destinationId} />
        <EvidenceItem label="Digest" value={snapshot.sha256 ?? 'No published digest'} />
        <EvidenceItem label="Source reads" value={snapshot.sourceReadCount} />
        <EvidenceItem label="Executor calls" value={snapshot.executorInvocationCount} />
      </dl>
    </aside>
  );
}

function summaryForPublication(result: PublicationResult): readonly [
  { readonly label: string; readonly value: string; readonly detail: string },
  {
    readonly label: string;
    readonly value: string;
    readonly detail: string;
    readonly tone: GovernanceTone;
  },
  {
    readonly label: string;
    readonly value: string;
    readonly detail: string;
    readonly tone: GovernanceTone;
  },
] {
  const denied = result.outcome.status === 'DENIED';
  const waiting = result.approval?.state === 'WAITING_FOR_APPROVAL';
  const approved = result.approval?.state === 'APPROVED';
  const alreadyPublished = result.publication.hostPublicationState === 'ALREADY_PUBLISHED';

  const decisionValue = denied
    ? 'DENIED'
    : waiting
      ? 'APPROVAL REQUIRED'
      : approved
        ? 'APPROVED'
        : (result.approval?.state ?? result.outcome.status);
  const decisionTone: GovernanceTone = denied
    ? 'denied'
    : waiting
      ? 'attention'
      : result.outcome.status === 'ALLOWED' || approved
        ? 'allowed'
        : 'neutral';

  const hostValue = denied
    ? 'NOT EXECUTED'
    : alreadyPublished
      ? 'ALREADY PRESENT'
      : result.publication.state === 'NOT_PUBLISHED'
        ? 'NOT PUBLISHED'
        : result.publication.state;
  const hostTone: GovernanceTone =
    result.publication.state === 'PUBLISHED' ? 'allowed' : denied ? 'denied' : 'attention';

  return [
    {
      label: 'Agent request',
      value: 'PUBLISH DOCUMENT',
      detail: denied
        ? 'The restricted agent requested publication.'
        : 'The agent requested publication.',
    },
    {
      label: 'Fates decision',
      value: decisionValue,
      detail: denied
        ? 'The Fates denied authority.'
        : waiting
          ? 'The Fates requires a human decision.'
          : 'The Fates authorised the exact operation.',
      tone: decisionTone,
    },
    {
      label: 'Host result',
      value: hostValue,
      detail: denied
        ? 'The host performed no effect.'
        : alreadyPublished
          ? 'The exact approved bytes were already present.'
          : result.publication.state === 'PUBLISHED'
            ? 'The host completed the bounded publication.'
            : 'The host performed no publication.',
      tone: hostTone,
    },
  ];
}

function publicationExplanation(result: PublicationResult): string {
  if (result.outcome.status === 'DENIED') {
    return 'The restricted agent does not have publication authority. The host performed no publication effect.';
  }
  if (result.approval?.state === 'WAITING_FOR_APPROVAL') {
    return 'This request is awaiting human approval. No publication was performed for this request.';
  }
  if (result.approval?.state === 'REJECTED') {
    return 'The human decision was rejected. No publication was performed.';
  }
  if (result.approval?.state === 'EXPIRED') {
    return 'The approval opportunity expired. No publication was performed.';
  }
  if (result.publication.hostPublicationState === 'ALREADY_PUBLISHED') {
    return 'The request was approved, and the host verified that identical content was already present.';
  }
  if (result.publication.state === 'PUBLISHED') {
    return 'The Fates authorised the exact operation. The Console host performed the bounded publication.';
  }
  return `No publication was performed: ${result.publication.reasonCode ?? result.outcome.status}.`;
}

function outcomeClassName(result: PublicationResult): string {
  if (result.outcome.status === 'DENIED') return 'outcome-explanation--denied';
  if (result.approval?.state === 'WAITING_FOR_APPROVAL') return 'outcome-explanation--attention';
  if (result.publication.state === 'PUBLISHED') return 'outcome-explanation--allowed';
  return '';
}

function EvidenceItem({ label, value }: { readonly label: string; readonly value: unknown }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{String(value)}</dd>
    </div>
  );
}

function formatBoolean(value: boolean | undefined): string {
  return value === undefined ? '—' : String(value);
}

function formatProvenance(provenance: Readonly<Record<string, string>> | undefined): string {
  if (!provenance) return '—';
  return Object.entries(provenance)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
