import { useState } from 'react';

import { requestInspectDocument } from '../inspection/client';
import type { InspectionResult, LifecyclePhase } from '../inspection/types';

type PanelState =
  | { readonly status: 'IDLE' }
  | { readonly status: 'REQUESTED'; readonly requestId: string }
  | { readonly status: 'RESULT'; readonly result: InspectionResult }
  | { readonly status: 'ERROR'; readonly requestId: string; readonly message: string };

export function InspectDocumentPanel() {
  const [state, setState] = useState<PanelState>({ status: 'IDLE' });

  async function submitRequest() {
    const requestId = crypto.randomUUID();
    setState({ status: 'REQUESTED', requestId });

    try {
      const result = await requestInspectDocument();
      setState({ status: 'RESULT', result });
    } catch (error) {
      setState({
        status: 'ERROR',
        requestId,
        message: error instanceof Error ? error.message : 'INSPECT_DOCUMENT_FAILED',
      });
    }
  }

  const phases = phasesFor(state);
  const result = state.status === 'RESULT' ? state.result : undefined;

  return (
    <section className="inspection-panel" aria-labelledby="inspection-heading">
      <div className="inspection-header">
        <div>
          <p className="card-label">MC-01 read-only disclosure</p>
          <h2 id="inspection-heading">inspect_document</h2>
        </div>
        <button type="button" onClick={submitRequest} disabled={state.status === 'REQUESTED'}>
          {state.status === 'REQUESTED' ? 'Requesting…' : 'Request inspection'}
        </button>
      </div>

      <p className="inspection-copy">
        The fixed demonstration document is requested by canonical ID. Its body is rendered only
        when the host-side disclosure gate receives the required governance outcome.
      </p>

      <ol className="lifecycle" aria-label="Governed inspection lifecycle">
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
          NO DISCLOSURE · {state.message} · {state.requestId}
        </p>
      )}
      {result && <InspectionResultView result={result} />}
    </section>
  );
}

function InspectionResultView({ result }: { readonly result: InspectionResult }) {
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
          <dt>Evidence</dt>
          <dd>{result.outcome.evidence.evidenceId}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd>{result.outcome.evidence.receiptId ?? '—'}</dd>
        </div>
        <div>
          <dt>Decision digest</dt>
          <dd>{result.outcome.evidence.decisionDigest ?? '—'}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{result.disclosure.evidenceMode}</dd>
        </div>
        <div>
          <dt>Provenance</dt>
          <dd>{formatProvenance(result.outcome.evidence.provenance)}</dd>
        </div>
      </dl>
      {result.document ? (
        <pre className="document-body">{result.document.content}</pre>
      ) : (
        <p className="result-note">
          NO DISCLOSURE · {result.disclosure.reasonCode ?? result.outcome.status}
        </p>
      )}
    </div>
  );
}

function formatProvenance(provenance: Readonly<Record<string, string>> | undefined): string {
  if (!provenance) {
    return '—';
  }
  return Object.entries(provenance)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

function phasesFor(state: PanelState): readonly LifecyclePhase[] {
  if (state.status === 'RESULT') {
    return state.result.phases;
  }
  if (state.status === 'IDLE') {
    return [];
  }
  return [{ name: 'REQUESTED', source: 'local-observed' }];
}
