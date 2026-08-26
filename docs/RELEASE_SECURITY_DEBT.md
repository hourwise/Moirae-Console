# Public-release security debt register

MC-03 does not remediate unrelated dependency advisories. This register keeps the known
release-gate items visible while the repositories remain private and undeployed.

| Repository                | Current audit finding                                    | MC-03 treatment                                     |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Project Ananke            | 2 moderate and 6 high dependency advisories              | Reported; no dependency updates authorized in MC-03 |
| Project-Fates-Integration | 1 high `fast-uri` advisory                               | Reported; no dependency updates authorized in MC-03 |
| Moirae Console            | 0 reported dependency vulnerabilities at the MC-03 audit | No dependency change                                |

Additional release-gate limitations:

- no deployed production host exists;
- browser automation evidence remains environment-dependent when the prescribed Windows
  Playwright wrapper requires unavailable WSL/Bash support;
- TLS and production service identity remain deployment work;
- production durable receipt consumption and crash/restart replay recovery remain deployment
  work;
- operational monitoring, alerting, and security-log retention remain deployment work;
- the current authority receipt uses canonical digest integrity over an authenticated transport,
  not a cryptographically signed receipt.

MC-04 mutation-specific limitations:

- the fixed publication target is a host-local demonstration file store, not production storage;
- publication idempotency is bounded to the fixed document/digest/destination and does not claim
  exactly-once behavior across process crashes;
- Fates and Console replay/receipt consumption remain process-local demonstration mechanisms;
- atomic rename and final digest verification are exercised locally, but durable power-loss
  reconciliation and operational effect recovery remain deployment work;
- the Vite middleware remains a demonstration host boundary and has no deployed TLS/service
  identity or operational monitoring;
- browser-level automation remains environment-dependent and is not replaced by the host smoke.

These items are intentionally recorded rather than hidden or resolved by dependency churn in
this bounded slice.
