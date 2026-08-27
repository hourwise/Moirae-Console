import { useEffect, useState } from 'react';

import { registerWebMcpTools, type WebMcpRegistrationState } from '../webmcp/browser';
import { InspectDocumentPanel } from './InspectDocumentPanel';
import { PublishDocumentPanel } from './PublishDocumentPanel';

export function App() {
  const [webmcpState, setWebmcpState] = useState<WebMcpRegistrationState>('UNAVAILABLE');

  useEffect(() => {
    void registerWebMcpTools().then((result) => setWebmcpState(result.state));
  }, []);

  return (
    <main className="console-shell">
      <header className="product-header">
        <div className="product-header-row">
          <div>
            <p className="eyebrow">MOIRAE CONSOLE</p>
            <h1>Governed agent actions for the web</h1>
          </div>
          <p className={`connection-status connection-status--${webmcpState.toLowerCase()}`}>
            <span aria-hidden="true" /> WebMCP {registrationLabel(webmcpState)}
          </p>
        </div>
        <p className="lede">
          <strong>WebMCP exposes capabilities.</strong>
          <span>The Fates decides authority.</span>
        </p>
        <div className="boundary-story" aria-label="Governed action boundary">
          <span>Agent request</span>
          <b aria-hidden="true">→</b>
          <span>The Fates decides</span>
          <b aria-hidden="true">→</b>
          <span>Console host acts</span>
        </div>
      </header>

      <section className="demo-overview" aria-label="Three governed demonstration outcomes">
        <article>
          <p className="card-label">Inspect</p>
          <strong>ALLOWED → DISCLOSED</strong>
        </article>
        <article>
          <p className="card-label">Publish</p>
          <strong>APPROVAL REQUIRED → HUMAN DECISION</strong>
        </article>
        <article>
          <p className="card-label">Restricted publish</p>
          <strong>DENIED → NOT EXECUTED</strong>
        </article>
      </section>
      <InspectDocumentPanel />
      <PublishDocumentPanel />
    </main>
  );
}

function registrationLabel(state: WebMcpRegistrationState): string {
  if (state === 'REGISTERED') return 'Connected';
  if (state === 'FAILED') return 'Failed';
  return 'Unavailable';
}
