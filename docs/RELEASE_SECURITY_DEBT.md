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

These items are intentionally recorded rather than hidden or resolved by dependency churn in
this bounded slice.
