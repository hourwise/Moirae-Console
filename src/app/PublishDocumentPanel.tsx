import { useEffect, useState } from 'react';

import { requestPublicationStatus, requestPublishDocument } from '../publication/client';
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
    }
  | { readonly status: 'ERROR'; readonly requestId: string; readonly message: string };

export function PublishDocumentPanel() {
  const [state, setState] = useState<PanelState>({ status: 'IDLE' });

  useEffect(() => {
    void requestPublicationStatus()
      .then((snapshot) => setState({ status: 'IDLE', snapshot }))
      .catch(() => undefined);
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

  const phases = phasesFor(state);
  const result = state.status === 'RESULT' ? state.result : undefined;
  const snapshot =
    state.status === 'IDLE' || state.status === 'RESULT' ? state.snapshot : undefined;

  return (
    <section className="inspection-panel publication-panel" aria-labelledby="publication-heading">
      <div className="inspection-header">
        <div>
          <p className="card-label">MC-04 governed mutation</p>
          <h2 id="publication-heading">publish_document</h2>
        </div>
        <button type="button" onClick={submitRequest} disabled={state.status === 'REQUESTED'}>
          {state.status === 'REQUESTED' ? 'Publishing…' : 'Request publication'}
        </button>
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
      {snapshot && <PublicationStatusView snapshot={snapshot} />}
      {result && <PublicationResultView result={result} />}
    </section>
  );
}

function PublicationResultView({ result }: { readonly result: PublicationResult }) {
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
      {snapshot.destinationId} · {snapshot.sha256 ?? 'no digest'}
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
