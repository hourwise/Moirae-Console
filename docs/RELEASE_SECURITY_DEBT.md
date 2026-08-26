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
- the Vite middleware remains a development adapter; the Node production host boundary is
  prepared but has no deployed TLS/service identity or operational monitoring;
- browser-level automation remains environment-dependent and is not replaced by the host smoke.

These items are intentionally recorded rather than hidden or resolved by dependency churn in
this bounded slice.

MC-05 approval-specific limitations:

- the demonstration operator uses a distinct host-side bearer token and fixed operator identity;
  production operator authentication/SSO is pending;
- pending approvals, operator sessions, and replay/consumption records are process-local and
  are not restart-persistent;
- approval lifetime is host-configured (30 seconds by default, bounded to 60 seconds) and is
  not a durable workflow guarantee;
- the Console approval correlation map is bounded and local; it is not an authority store;
- Fates approval and execution receipts remain unsigned; the guarantee is
  `AUTHENTICATED_TRANSPORT_BOUND_AUTHORITY`;
- production host/service identity, TLS, durable recovery, monitoring, and browser automation
  remain deployment/release work.

MC-06 denial-specific limitations:

- `ANANKE_MOIRAE_RESTRICTED_TOKEN` is a fixed host-side demonstration credential for
  `moirae-restricted-agent`; it is not production workload identity assurance;
- the restricted-agent scenario is a bounded presentation/test orchestration route, not a
  browser-selectable policy or identity profile and not a new WebMCP tool;
- Ananke denial, approval, and replay state remain process-local demonstration state;
- the denial evidence uses canonical digest integrity over authenticated transport and does not
  claim a signed receipt;
- no deployed TLS/service identity, durable policy state, operational monitoring, or production
  operator/authentication boundary exists yet.

MC-07 release-candidate limitations:

- the Console production host is now a Node boundary for release preparation, but it is not
  deployed or backed by production TLS/service identity;
- the public-dependency distribution strategy requires the Ananke runtime and every required
  dependency to be independently public, licensed, and reproducible before visibility changes;
- process-local replay, approval, and publication reconciliation remain demonstration limits;
- no distributed exactly-once effect guarantee is claimed;
- the demonstration operator identity and restricted-agent credential are not production
  authentication;
- browser automation and WebMCP browser evidence remain release gates until verified in a usable
  Chrome/Edge environment;
- no public delete/reset operation exists, so repeated publication may report `ALREADY_PUBLISHED`
  for the fixed destination;
- dependency advisories and the inherited formatter baseline are recorded, not remediated in
  MC-07 without separate authorization;
- deployment monitoring, rollback rehearsal, secret-manager integration, and crash recovery
  remain deployment work.
