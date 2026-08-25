# Security policy

Moirae Console is pre-production software. MC-00 establishes a fail-closed Console/Fates
boundary; it does not claim that The Fates is production-ready, containment-proven, or
security-complete.

## Reporting

Please do not open a public issue for a suspected vulnerability until maintainers have had
an opportunity to assess it. Use the repository's private security-reporting facility when
one is enabled. If no private reporting route is available, open a minimal issue requesting
a secure contact route without including exploit details.

Never include credentials, private keys, access tokens, personal data, raw private evidence,
or other sensitive material in a report.

## Scope

Reports about the Console surface, its adapter boundary, browser-delivered code, build
configuration, or documentation are in scope for this repository. A vulnerability in an
upstream Fates runtime should be reported to the appropriate upstream project as well; the
Console does not own or reproduce the Fates implementation.

The boundary is intentional: browser state, WebMCP discovery, and visual labels must not
mint Fates authority. Unknown, malformed, unavailable, or unverifiable governance results
must fail closed and cause no effect.

## Disclosure status

This policy does not represent a security-complete claim. Future slices must update the
threat model and reporting guidance as server-side transport, authentication, approvals,
receipts, and governed effects are introduced.
