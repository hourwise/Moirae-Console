import { InspectDocumentPanel } from './InspectDocumentPanel';
import { PublishDocumentPanel } from './PublishDocumentPanel';

export function App() {
  return (
    <main className="console-shell">
      <p className="eyebrow">MOIRAE CONSOLE · MC-02</p>
      <h1>The surface displays governance. It does not create governance.</h1>
      <p className="lede">
        Moirae Console is the human- and agent-facing governance surface for The Fates. Capability
        discovery is not execution authority.
      </p>
      <section className="status-card" aria-labelledby="status-heading">
        <div>
          <p className="card-label">Current state</p>
          <h2 id="status-heading">Live authority transport</h2>
        </div>
        <p className="status-pill">PRE-PRODUCTION</p>
        <p className="card-copy">
          The Console host submits one fixed document-authority request to Ananke and reads its own
          fixture only after authoritative evidence and an exact byte digest match. This remains a
          pre-production demonstration boundary.
        </p>
      </section>
      <InspectDocumentPanel />
      <PublishDocumentPanel />
    </main>
  );
}
