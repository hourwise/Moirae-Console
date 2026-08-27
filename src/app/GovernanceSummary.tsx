export type GovernanceTone = 'neutral' | 'allowed' | 'attention' | 'denied';

export interface GovernanceSummaryStep {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone?: GovernanceTone;
}

export function GovernanceSummary({
  steps,
  label,
}: {
  readonly steps: readonly [GovernanceSummaryStep, GovernanceSummaryStep, GovernanceSummaryStep];
  readonly label: string;
}) {
  return (
    <div className="governance-summary" aria-label={label}>
      {steps.map((step, index) => (
        <div className="governance-summary-item" key={step.label}>
          <article className={`governance-step governance-step--${step.tone ?? 'neutral'}`}>
            <p>{step.label}</p>
            <strong>{step.value}</strong>
            <span>{step.detail}</span>
          </article>
          {index < steps.length - 1 && (
            <span className="governance-arrow" aria-hidden="true">
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
