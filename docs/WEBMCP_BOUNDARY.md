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

| Slice | Intended action    | Boundary                                   |
| ----- | ------------------ | ------------------------------------------ |
| MC-01 | `inspect_document` | bounded disclosure prototype               |
| MC-02 | `inspect_document` | live authoritative transport               |
| MC-03 | `inspect_document` | fresh, one-use authoritative receipt       |
| MC-04 | `publish_document` | fixed, governed, host-executed publication |

MC-03 keeps the exact one-tool surface and adds no mutation, approval, or destructive challenge
workflow. Freshness and receipt consumption are host/Fates controls, not WebMCP input. The
browser cannot choose `issuedAt`, `expiresAt`, `receiptId`, `nonce`, or consumed state; a failed
or replayed request remains `NOT_DISCLOSED`; a denied, stale, replayed, or mismatched
publication remains `NOT_PUBLISHED`.
