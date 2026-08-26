# WebMCP boundary

> **WebMCP capability exposure is not execution authority.**

WebMCP is treated as an inbound adapter around a governed request. Discovery exposes metadata;
it does not authorize the caller.

```text
discover
  → request
  → govern
  → decide
  → execute only if authorised
```

In MC-02 the route reaches one explicit host-side disclosure gate. The adapter in
`src/webmcp/adapter.ts` has no document-source callback and no direct database, filesystem,
or external mutation path:

```text
WebMCP invocation
      ↓
input/tool validation
      ↓
immutable governed request snapshot
      ↓
trusted host adapter
      ↓
authenticated `POST /api/execute`
      ↓
canonical Fates action `fates.moirae.inspect-document.v1`
      ↓
authoritative ALLOW evidence or NO DISCLOSURE error state
      ↓
fixed host-side document source only when `mayDisclose(...)` is true and its bytes match
the authorized SHA-256
```

The experimental nature of WebMCP means its discovery and registration behaviour must remain
replaceable. Neither tool metadata nor browser origin may weaken caller identity, request
context, candidate binding, idempotency, replay protection, or freshness rules.

Read/disclosure is an effect for governance purposes. The protected demonstration fixture is
not part of browser assets, and the browser cannot address the fixture by path or URL. Tool
discovery does not call Ananke, and tool invocation does not itself confer permission. The
browser cannot choose the Fates action, expected digest, purpose, endpoint, or credential.
`REQUIRES_APPROVAL` is not executable because approval is not implemented. Fates' completed
transaction is explicitly authorization-only; the Console host owns the later document read.

## MC-04 bounded mutation

The second and only new descriptor is `publish_document`. Its public input remains exactly
`{ documentId: "demo-policy-001" }`; discovery exposes no digest, destination, purpose,
receipt, nonce, expiry, path, URL, content, or credential. The trusted host maps it to:

```text
publish_document
  → fates.moirae.publish-document.v1
  → documentId=demo-policy-001
  → expectedSha256=f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c
  → destinationId=moirae.demo-publication-slot.v1
  → purpose=moirae.document-publication
```

The host injects the canonical action, source digest, purpose, fixed destination, endpoint,
and separate `ANANKE_MOIRAE_PUBLISH_TOKEN`. The browser cannot choose or receive any of them.
Fates returns `AUTHORIZATION_ONLY_NO_PUBLICATION` with zero Fates reads and zero Fates
publication attempts. Only after fresh, one-use authoritative evidence passes does the host
read its own fixed bytes once, verify the authorized digest, and atomically publish to the
fixed host store. Fates authorization is not publication completion; host execution is shown
as a separate lifecycle phase.

Mutation responses use no-store controls. Existing identical target bytes are an idempotent
success, while a different target digest is a conflict. The demonstration file store is
process-local and host-side; it is not a production storage, crash-recovery, or deployment
boundary.

## Future slices

| Slice | Intended action    | Boundary                                      |
| ----- | ------------------ | --------------------------------------------- |
| MC-01 | `inspect_document` | bounded disclosure prototype                  |
| MC-02 | `inspect_document` | live authoritative transport                  |
| MC-03 | `inspect_document` | fresh, one-use authoritative receipt          |
| MC-04 | `publish_document` | fixed, governed, host-executed publication    |
| MC-05 | `publish_document` | Fates-owned human approval before publication |

MC-03 keeps the exact one-tool surface and adds no mutation, approval, or destructive challenge
workflow. Freshness and receipt consumption are host/Fates controls, not WebMCP input. The
browser cannot choose `issuedAt`, `expiresAt`, `receiptId`, `nonce`, or consumed state; a failed
or replayed request remains `NOT_DISCLOSED`; a denied, stale, replayed, or mismatched
publication remains `NOT_PUBLISHED`.

## MC-05 approval boundary

Approval is not a third WebMCP capability. The exposed surface remains exactly
`inspect_document` and `publish_document`. The publish proposal may receive an authoritative
`REQUIRES_APPROVAL` result, but that result is not executable authority and the UI cannot turn it
into `ALLOW`.

The human-facing Console sends only a bounded object containing an opaque Console
`approvalHandle`, an explicit `APPROVE` or `REJECT` decision, and the operator's step-up proof.
The canonical Fates `approvalRequestId` never crosses into the browser; the host resolves the
opaque handle to its pending record. The browser cannot choose the action, document, digest,
destination, purpose, caller, expiry, receipt, nonce, or Ananke credential. An approve click is
therefore a request for a new authoritative Fates transition, not a local state update. Only
after Fates reports the exact pending request approved does the host submit the same immutable
request with the host-held canonical approval ID to obtain fresh one-use execution authority.

Reject and expiry are terminal and publish nothing. Approval identifiers and authority material
do not enter browser URLs. Approval endpoints and responses use the existing no-store controls.
The Ananke operator credential and the Console's step-up secret remain host-only; the
demonstration operator model is not a production authentication boundary. The approval endpoint
also requires the configured same-origin JSON boundary and rejects non-success upstream
responses before considering an approval transition.

## MC-06 denial demonstration

The WebMCP discovery surface remains exactly:

```text
inspect_document
publish_document
```

There is no `approve_publication` or `deny_publication` WebMCP tool. The human-facing Console
may expose a fixed `deny-demo` presentation route, but that route is not discovered as a tool,
does not accept identity/action/policy/credential parameters, and does not confer authority.
It merely asks the trusted host to run the fixed restricted-agent scenario. The host injects the
restricted Ananke credential, and the UI can display only the authoritative result.

For MC-06 the exact `publish_document` operation reaches Fates and is denied by authenticated
scope policy. A denial is not a pending approval and cannot be upgraded by React state, a browser
parameter mutation, a previous receipt, or a local approval request. Tool discovery remains
metadata-only and performs no Fates call, source read, or publication.
