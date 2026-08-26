import { useEffect, useState } from 'react';

import {
  decidePublicationApproval,
  requestPublicationDenyDemo,
  requestPublicationStatus,
  requestPublishDocument,
} from '../publication/client';
import type {
  PublicationLifecyclePhase,
  PublicationResult,
  PublicationStatusSnapshot,
} from '../publication/types';

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

  async function decideApproval(decision: 'APPROVE' | 'REJECT') {
    if (state.status !== 'RESULT' || state.result.approval?.state !== 'WAITING_FOR_APPROVAL') {
      return;
    }
    const approvalRequestId = state.result.approval.approvalRequestId;
    setApprovalBusy(true);
    try {
      const result = await decidePublicationApproval(approvalRequestId, decision);
      const snapshot = await requestPublicationStatus().catch(() => undefined);
      setState({ status: 'RESULT', result, ...(snapshot ? { snapshot } : {}) });
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

  const phases = phasesFor(state);
  const result = state.status === 'RESULT' ? state.result : undefined;
  const snapshot =
    state.status === 'IDLE' || state.status === 'RESULT' ? state.snapshot : undefined;

  return (
    <section className="inspection-panel publication-panel" aria-labelledby="publication-heading">
      <div className="inspection-header">
        <div>
          <p className="card-label">MC-04 governed mutation · MC-06 denial demo</p>
          <h2 id="publication-heading">publish_document</h2>
        </div>
        <div className="approval-actions">
          <button
            type="button"
            onClick={submitRequest}
            disabled={state.status === 'REQUESTED' || approvalBusy}
          >
            {state.status === 'REQUESTED' ? 'Requesting…' : 'Request publication'}
          </button>
          <button
            type="button"
            onClick={runRestrictedDenyDemo}
            disabled={state.status === 'REQUESTED' || approvalBusy}
          >
            Run restricted DENY demo
          </button>
        </div>
      </div>

      <p className="inspection-copy">
        Publication is fixed to the demonstration document and one host-side destination. Fates
        authorizes the exact effect; the Console host performs and verifies the bounded write.
      </p>

      <ol className="lifecycle" aria-label="Governed publication lifecycle">
        {phases.map((phase) => (
          <li key={phase.name} className="lifecycle-step">
            <span>{phase.name}</span>
            <small>{phase.source}</small>
          </li>
        ))}
      </ol>

      {state.status === 'REQUESTED' && <p className="result-note">REQUESTED · {state.requestId}</p>}
      {state.status === 'ERROR' && (
        <p className="result-note">
          NOT PUBLISHED · {state.message} · {state.requestId}
        </p>
      )}
      {state.status === 'RESULT' && state.message && (
        <p className="result-note">DECISION NOT CONFIRMED · {state.message}</p>
      )}
      {snapshot && <PublicationStatusView snapshot={snapshot} />}
      {result && (
        <PublicationResultView
          result={result}
          approvalBusy={approvalBusy}
          onApprovalDecision={decideApproval}
        />
      )}
    </section>
  );
}

function PublicationResultView({
  result,
  approvalBusy,
  onApprovalDecision,
}: {
  readonly result: PublicationResult;
  readonly approvalBusy: boolean;
  readonly onApprovalDecision: (decision: 'APPROVE' | 'REJECT') => void;
}) {
  return (
    <div className="inspection-result">
      <dl className="evidence-grid">
        <div>
          <dt>Request</dt>
          <dd>{result.request.requestId}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{result.request.action}</dd>
        </div>
        <div>
          <dt>Decision</dt>
          <dd>{result.outcome.status}</dd>
        </div>
        <div>
          <dt>Agent</dt>
          <dd>{result.outcome.evidence.authenticatedWorkloadIdentity?.actingPrincipalId ?? '—'}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>{result.approval?.state ?? '—'}</dd>
        </div>
        <div>
          <dt>Publication</dt>
          <dd>{result.publication.state}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{result.outcome.evidence.evidenceId}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd>{result.outcome.evidence.receiptId ?? '—'}</dd>
        </div>
        <div>
          <dt>Decision ID</dt>
          <dd>{result.outcome.evidence.decisionId ?? '—'}</dd>
        </div>
        <div>
          <dt>Outcome ID</dt>
          <dd>{result.outcome.evidence.outcomeId ?? result.outcome.outcomeId}</dd>
        </div>
        <div>
          <dt>Audit ID</dt>
          <dd>{result.outcome.evidence.auditId ?? '—'}</dd>
        </div>
        <div>
          <dt>Fates action</dt>
          <dd>{result.outcome.evidence.canonicalAction ?? '—'}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{result.outcome.evidence.destinationId ?? result.publication.destinationId}</dd>
        </div>
        <div>
          <dt>Source digest</dt>
          <dd>{result.outcome.evidence.expectedSha256 ?? '—'}</dd>
        </div>
        <div>
          <dt>Canonical request digest</dt>
          <dd>{result.outcome.evidence.canonicalRequestDigest ?? '—'}</dd>
        </div>
        <div>
          <dt>Authority binding</dt>
          <dd>{result.outcome.evidence.authorityBindingDigest ?? '—'}</dd>
        </div>
        <div>
          <dt>Authority receipt digest</dt>
          <dd>{result.outcome.evidence.authorityReceiptDigest ?? '—'}</dd>
        </div>
        <div>
          <dt>Effect semantics</dt>
          <dd>{result.outcome.evidence.effectSemantics ?? '—'}</dd>
        </div>
        <div>
          <dt>Fates publication attempts</dt>
          <dd>{result.outcome.evidence.fatesPublicationAttemptCount ?? '—'}</dd>
        </div>
        <div>
          <dt>Fates publication</dt>
          <dd>{String(result.outcome.evidence.documentPublicationByFates ?? '—')}</dd>
        </div>
        <div>
          <dt>Host execution</dt>
          <dd>{result.publication.hostPublicationState ?? '—'}</dd>
        </div>
        <div>
          <dt>Host executor calls</dt>
          <dd>{result.publication.hostPublicationExecutorInvocationCount ?? '—'}</dd>
        </div>
        <div>
          <dt>Provenance</dt>
          <dd>{formatProvenance(result.outcome.evidence.provenance)}</dd>
        </div>
      </dl>
      {result.approval?.state === 'WAITING_FOR_APPROVAL' && (
        <div className="approval-card" aria-label="Human publication approval">
          <p className="card-label">Fates-authoritative approval request</p>
          <dl className="evidence-grid">
            <div>
              <dt>Action</dt>
              <dd>Publish document</dd>
            </div>
            <div>
              <dt>Document</dt>
              <dd>demo-policy-001</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>Demo publication slot</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{result.approval.expiresAt ?? '—'}</dd>
            </div>
          </dl>
          <div className="approval-actions">
            <button
              type="button"
              onClick={() => onApprovalDecision('APPROVE')}
              disabled={approvalBusy}
            >
              {approvalBusy ? 'Submitting…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => onApprovalDecision('REJECT')}
              disabled={approvalBusy}
            >
              Reject
            </button>
          </div>
        </div>
      )}
      {result.outcome.status === 'DENIED' && (
        <div className="approval-card" aria-label="Authoritative publication denial">
          <p className="card-label">Fates-authoritative denial · host not executed</p>
          <dl className="evidence-grid">
            <div>
              <dt>Agent</dt>
              <dd>
                {result.outcome.evidence.authenticatedWorkloadIdentity?.actingPrincipalId ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>
                {result.outcome.evidence.policyReason ?? result.outcome.reasonCode ?? 'DENIED'}
              </dd>
            </div>
            <div>
              <dt>Approval request</dt>
              <dd>{result.outcome.evidence.approvalRequestId ?? 'none'}</dd>
            </div>
            <div>
              <dt>Host effect</dt>
              <dd>NOT EXECUTED</dd>
            </div>
          </dl>
        </div>
      )}
      {result.publication.state === 'NOT_PUBLISHED' && (
        <p className="result-note">
          NOT PUBLISHED · {result.publication.reasonCode ?? result.outcome.status}
        </p>
      )}
    </div>
  );
}

function PublicationStatusView({ snapshot }: { readonly snapshot: PublicationStatusSnapshot }) {
  return (
    <p className="result-note">
      DESTINATION STATUS · {snapshot.published ? 'PUBLISHED' : 'NOT PUBLISHED'} ·{' '}
      {snapshot.destinationId} · {snapshot.sha256 ?? 'no digest'} · source reads{' '}
      {snapshot.sourceReadCount} · executor calls {snapshot.executorInvocationCount}
    </p>
  );
}

function formatProvenance(provenance: Readonly<Record<string, string>> | undefined): string {
  if (!provenance) return '—';
  return Object.entries(provenance)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

function phasesFor(state: PanelState): readonly PublicationLifecyclePhase[] {
  if (state.status === 'RESULT') return state.result.phases;
  if (state.status === 'IDLE') return [];
  return [{ name: 'REQUESTED', source: 'local-observed' }];
}
