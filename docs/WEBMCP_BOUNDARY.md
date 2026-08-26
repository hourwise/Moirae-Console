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

## Future slices

| Slice | Intended action    | Boundary                             |
| ----- | ------------------ | ------------------------------------ |
| MC-01 | `inspect_document` | bounded disclosure prototype         |
| MC-02 | `inspect_document` | live authoritative transport         |
| MC-03 | `inspect_document` | fresh, one-use authoritative receipt |

MC-03 keeps the exact one-tool surface and adds no mutation, approval, or destructive challenge
workflow. Freshness and receipt consumption are host/Fates controls, not WebMCP input. The
browser cannot choose `issuedAt`, `expiresAt`, `receiptId`, `nonce`, or consumed state; a failed
or replayed request remains `NOT_DISCLOSED`.
