export function App() {
  return (
    <main className="console-shell">
      <p className="eyebrow">MOIRAE CONSOLE · MC-00</p>
      <h1>The surface displays governance. It does not create governance.</h1>
      <p className="lede">
        Moirae Console is the human- and agent-facing governance surface for The Fates. Capability
        discovery is not execution authority.
      </p>
      <section className="status-card" aria-labelledby="status-heading">
        <div>
          <p className="card-label">Current state</p>
          <h2 id="status-heading">Foundation stage</h2>
        </div>
        <p className="status-pill">PRE-PRODUCTION</p>
        <p className="card-copy">
          This repository contains the bounded Console/Fates and WebMCP interfaces. No governed
          side-effect implementation, production deployment, or security-complete claim is present
          in MC-00.
        </p>
      </section>
    </main>
  );
}
