import { useEffect, useState } from 'react';

import { requestInspectDocument } from '../inspection/client';
import type { InspectionResult } from '../inspection/types';
import { GovernanceSummary, type GovernanceTone } from './GovernanceSummary';
import { TechnicalEvidence } from './TechnicalEvidence';

type PanelState =
  | { readonly status: 'IDLE' }
  | { readonly status: 'REQUESTED'; readonly requestId: string }
  | { readonly status: 'RESULT'; readonly result: InspectionResult }
  | { readonly status: 'ERROR'; readonly requestId: string; readonly message: string };

export function InspectDocumentPanel() {
  const [state, setState] = useState<PanelState>({ status: 'IDLE' });

  useEffect(() => {
    const handleWebMcpResult = (event: Event) => {
      const detail = (event as CustomEvent<{ toolName?: string; result?: InspectionResult }>)
        .detail;
      if (detail?.toolName === 'inspect_document' && detail.result) {
        setState({ status: 'RESULT', result: detail.result });
      }
    };
    window.addEventListener('moirae:webmcp-result', handleWebMcpResult);
    return () => window.removeEventListener('moirae:webmcp-result', handleWebMcpResult);
  }, []);

  async function submitRequest() {
    const requestId = crypto.randomUUID();
    setState({ status: 'REQUESTED', requestId });

    try {
      const result = await requestInspectDocument(requestId);
      setState({ status: 'RESULT', result });
    } catch (error) {
      setState({
        status: 'ERROR',
        requestId,
        message: error instanceof Error ? error.message : 'INSPECT_DOCUMENT_FAILED',
      });
    }
  }

  const result = state.status === 'RESULT' ? state.result : undefined;

  return (
    <section className="inspection-panel" aria-labelledby="inspection-heading">
      <div className="inspection-header">
        <div>
          <p className="card-label">Read-only governed action</p>
          <h2 id="inspection-heading">Inspect document</h2>
          <code className="tool-name">inspect_document</code>
        </div>
        <button
          className="button-primary"
          type="button"
          onClick={submitRequest}
          disabled={state.status === 'REQUESTED'}
        >
          {state.status === 'REQUESTED' ? 'Requesting…' : 'Request inspection'}
        </button>
      </div>

      <p className="inspection-copy">
        Ask to read the fixed demonstration policy. The Console host discloses it only after The
        Fates authorises the exact request.
      </p>

      {state.status === 'IDLE' && (
        <div className="instruction-card">
          <span>1</span>
          <p>
            <strong>The agent requests a read.</strong>
            The Fates decides whether the Console host may disclose the document.
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
          NO DISCLOSURE · {state.message} · {state.requestId}
        </p>
      )}
      {result && <InspectionResultView result={result} />}
    </section>
  );
}

export function InspectionResultView({ result }: { readonly result: InspectionResult }) {
  const disclosed = result.disclosure.state === 'DISCLOSED';
  const decisionTone: GovernanceTone = result.outcome.status === 'ALLOWED' ? 'allowed' : 'denied';

  return (
    <div className="inspection-result">
      <GovernanceSummary
        label="Inspection governance result"
        steps={[
          {
            label: 'Agent request',
            value: 'INSPECT DOCUMENT',
            detail: 'The agent requested a read.',
          },
          {
            label: 'Fates decision',
            value: result.outcome.status,
            detail:
              result.outcome.status === 'ALLOWED'
                ? 'The Fates authorised it.'
                : 'The Fates did not authorise disclosure.',
            tone: decisionTone,
          },
          {
            label: 'Host result',
            value: result.disclosure.state,
            detail: disclosed
              ? 'The host disclosed the document.'
              : 'The host disclosed no document.',
            tone: disclosed ? 'allowed' : 'denied',
          },
        ]}
      />

      <p className={`outcome-explanation ${disclosed ? 'outcome-explanation--allowed' : ''}`}>
        {disclosed
          ? 'The document was disclosed only after authoritative Fates approval.'
          : `No document content was disclosed: ${result.disclosure.reasonCode ?? result.outcome.status}.`}
      </p>

      <TechnicalEvidence phases={result.phases}>
        <dl className="evidence-grid">
          <EvidenceItem label="Request ID" value={result.request.requestId} />
          <EvidenceItem label="Action" value={result.request.action} />
          <EvidenceItem
            label="Document"
            value={result.outcome.evidence.documentId ?? result.document?.documentId ?? '—'}
          />
          <EvidenceItem label="Decision" value={result.outcome.status} />
          <EvidenceItem label="Evidence ID" value={result.outcome.evidence.evidenceId} />
          <EvidenceItem label="Receipt ID" value={result.outcome.evidence.receiptId ?? '—'} />
          <EvidenceItem
            label="Decision digest"
            value={result.outcome.evidence.decisionDigest ?? '—'}
          />
          <EvidenceItem label="Decision ID" value={result.outcome.evidence.decisionId ?? '—'} />
          <EvidenceItem
            label="Outcome ID"
            value={result.outcome.evidence.outcomeId ?? result.outcome.outcomeId}
          />
          <EvidenceItem label="Audit ID" value={result.outcome.evidence.auditId ?? '—'} />
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
            label="Fates action"
            value={result.outcome.evidence.canonicalAction ?? '—'}
          />
          <EvidenceItem
            label="Fates request / correlation"
            value={`${result.outcome.evidence.fatesRequestId ?? '—'} / ${result.outcome.evidence.correlationId ?? '—'}`}
          />
          <EvidenceItem
            label="Authenticated workload identity"
            value={formatProvenance(result.outcome.evidence.authenticatedWorkloadIdentity)}
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
            label="Fates disclosure"
            value={formatBoolean(result.outcome.evidence.documentDisclosureByFates)}
          />
          <EvidenceItem label="Host document reads" value={result.hostDocumentReadCount ?? '—'} />
          <EvidenceItem label="Evidence mode" value={result.disclosure.evidenceMode} />
          <EvidenceItem
            label="Provenance"
            value={formatProvenance(result.outcome.evidence.provenance)}
          />
        </dl>
      </TechnicalEvidence>

      {result.document ? (
        <div className="document-disclosure">
          <p className="technical-section-label">Demonstration document content</p>
          <pre className="document-body">{result.document.content}</pre>
        </div>
      ) : (
        <p className="result-note result-note--blocked">
          NO DISCLOSURE · {result.disclosure.reasonCode ?? result.outcome.status}
        </p>
      )}
    </div>
  );
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
  if (!provenance) {
    return '—';
  }
  return Object.entries(provenance)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
