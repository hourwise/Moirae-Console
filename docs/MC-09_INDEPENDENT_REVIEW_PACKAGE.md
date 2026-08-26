# MC-09 Independent Review Package

This package identifies the exact release candidate and gives an independent
reviewer enough bounded context to attempt adversarial testing. It intentionally
contains no security conclusion.

## Review targets

| Component                 | Target                                     |
| ------------------------- | ------------------------------------------ |
| Moirae Console            | `77eaebe4b5a27e6f8d26e108d11afb371922dcfd` |
| Ananke                    | `693b386218e73afaa579cb6457f054007293581b` |
| Project-Fates-Integration | `b4ae41185bafa6b6dd80ff7e41b1de7a2915873f` |
| Runtime Contracts         | `6aba3ef466a16292689d4afaf9f9bc40dc013301` |
| Mnemosyne                 | `24f8541ce0e0a2f56171544a249cff56e7b634d1` |
| Horae                     | `3a174b3f1bf791b437a22b4cfd41bf9677b9cba9` |
| Moirae Code               | `b23f723fc5267c95fe9f7eccb2efa32465f8d2f1` |

The first three rows are the Console release-candidate authority path. The
remaining rows are reference checkpoints and are not vendored by Console.

## Architecture under review

```text
WebMCP client / browser
        ↓
Moirae Console bounded HTTP boundary
        ↓
trusted server-side Moirae adapter
        ↓ authenticated POST /api/execute
Ananke / The Fates
        ↓
ALLOW, REQUIRES_APPROVAL, or DENY
        ↓
Moirae-owned fixed document read or fixed publication effect
```

The WebMCP discovery surface is intended to contain exactly:

- `inspect_document` — governed inspection of `demo-policy-001`;
- `publish_document` — governed publication of that same document to the
  fixed `moirae.demo-publication-slot.v1` destination.

The browser does not choose the canonical Fates action, source digest,
destination, purpose, credential, caller profile, expiry, or receipt.

## Bounded Console routes

The review target exposes the following application routes:

- `POST /api/inspect-document`
- `POST /api/publish-document`
- `GET /api/publish-document/status`
- `POST /api/publish-document/approval`
- `POST /api/publish-document/deny-demo`

The Ananke endpoint is a server-to-server boundary at `POST /api/execute`; it
is not intended to be browser-callable. Static assets are served separately.

## Fixed operation contracts

Inspection maps to `fates.moirae.inspect-document.v1` and the fixed document
ID `demo-policy-001`.

Publication maps to `fates.moirae.publish-document.v1` with:

```json
{
  "documentId": "demo-policy-001",
  "expectedSha256": "f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c",
  "destinationId": "moirae.demo-publication-slot.v1",
  "purpose": "moirae.document-publication"
}
```

The intended effect boundary is that Fates governs the operation and Moirae
owns the document read/publication effect. Approval is a human-facing control
surface, not a third WebMCP tool.

## Threat-model starting points

Reviewers should consider capability-versus-authority confusion, confused
deputy approval, concurrent approval requests, response-status validation,
cross-request receipt substitution, stale/replayed authority, digest/TOCTOU
substitution, direct HTTP and fixture access, origin/CSRF behavior, XSS/error
rendering, cache/history leakage, secret leakage, bounded-store behavior,
restart semantics, and public dependency provenance.

Known architectural limitations to examine include process-local replay and
approval state, demonstration-grade operator identity/step-up, authenticated
transport-bound rather than signed receipts, bounded local publication storage,
and the absence of a deployed TLS/service-identity layer.

## Reproduction commands

From a clean checkout, use the repository's documented Node version and run:

```text
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
```

For the production-shaped host, configure credentials and endpoints only in
the server environment. Do not put their values in source, URLs, browser
storage, screenshots, or review artifacts. The relevant variable names are:

`ANANKE_MOIRAE_EXECUTION_URL`, `ANANKE_MOIRAE_EXECUTION_TOKEN`,
`ANANKE_MOIRAE_PUBLISH_TOKEN`, `ANANKE_MOIRAE_APPROVER_TOKEN`,
`ANANKE_MOIRAE_RESTRICTED_TOKEN`, `MOIRAE_OPERATOR_STEP_UP_SECRET`,
`MOIRAE_ALLOWED_ORIGIN`, `PORT`, and `HOST`.

## Neutral reviewer prompt

> Try to break this. Do not assume the implementation is correct. Attempt to
> cause an effect without the exact corresponding Fates decision, confuse
> proposal metadata with authenticated provenance, replay or cross-bind
> authority, race approval transitions, bypass the origin and content-type
> boundary, reach host-only resources, and extract credentials or protected
> content. Record reproducible evidence and expected-versus-observed behavior.
