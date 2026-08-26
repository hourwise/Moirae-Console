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
      <p className="eyebrow">MOIRAE CONSOLE · WEBMCP RELEASE CANDIDATE</p>
      <h1>The web can expose tools. The Fates decides what may happen.</h1>
      <p className="lede">
        Governed agent actions for the web. WebMCP makes capabilities discoverable; Moirae makes the
        Fates decision visible to the human.
      </p>
      <section className="status-card" aria-labelledby="status-heading">
        <div>
          <p className="card-label">Current state</p>
          <h2 id="status-heading">Fates host boundary</h2>
        </div>
        <p className="status-pill">WEBMCP {webmcpState}</p>
        <p className="card-copy">
          The Console host submits fixed requests to Ananke and performs no document disclosure or
          publication until authoritative Fates evidence passes the exact binding checks. Missing
          transport configuration fails closed.
        </p>
      </section>
      <section className="demo-overview" aria-label="Three governed demonstrations">
        <article>
          <p className="card-label">01 · Inspect</p>
          <strong>ALLOW → DISCLOSED</strong>
          <p>Read-only disclosure follows authoritative Fates approval.</p>
        </article>
        <article>
          <p className="card-label">02 · Publish</p>
          <strong>APPROVAL REQUIRED → PUBLISHED</strong>
          <p>A human decision creates the next Fates-governed step.</p>
        </article>
        <article>
          <p className="card-label">03 · Restricted agent</p>
          <strong>DENIED → NOT EXECUTED</strong>
          <p>The same publication operation is denied without a host effect.</p>
        </article>
      </section>
      <InspectDocumentPanel />
      <PublishDocumentPanel />
    </main>
  );
}
