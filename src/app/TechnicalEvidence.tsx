import type { ReactNode } from 'react';

interface EvidencePhase {
  readonly name: string;
  readonly source: string;
}

export function TechnicalEvidence({
  children,
  phases,
}: {
  readonly children: ReactNode;
  readonly phases: readonly EvidencePhase[];
}) {
  return (
    <details className="technical-evidence">
      <summary>
        <span>View technical evidence</span>
        <small>Request binding, authority evidence, lifecycle, and provenance</small>
      </summary>
      <div className="technical-evidence-body">
        {phases.length > 0 && (
          <div className="technical-lifecycle">
            <p className="technical-section-label">Observed lifecycle</p>
            <ol className="lifecycle" aria-label="Governed lifecycle evidence">
              {phases.map((phase) => (
                <li key={`${phase.name}-${phase.source}`} className="lifecycle-step">
                  <span>{phase.name}</span>
                  <small>{phase.source}</small>
                </li>
              ))}
            </ol>
          </div>
        )}
        {children}
      </div>
    </details>
  );
}
