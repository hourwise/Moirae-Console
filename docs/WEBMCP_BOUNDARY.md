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

In MC-01 the route reaches one explicit host-side disclosure gate. The adapter in
`src/webmcp/adapter.ts` has no document-source callback and no direct database, filesystem,
or external mutation path:

```text
WebMCP invocation
      ↓
input/tool validation
      ↓
immutable governed request snapshot
      ↓
Console Fates client
      ↓
authoritative outcome or NO DISCLOSURE error state
      ↓
fixed host-side document source only when `mayDisclose(...)` is true
```

The experimental nature of WebMCP means its discovery and registration behaviour must remain
replaceable. Neither tool metadata nor browser origin may weaken caller identity, request
context, candidate binding, idempotency, replay protection, or freshness rules.

Read/disclosure is an effect for governance purposes. The protected demonstration fixture is
not part of browser assets, and the browser cannot address the fixture by path or URL. Tool
discovery and tool invocation do not confer permission. `REQUIRES_APPROVAL` is not executable
in MC-01 because approval is not implemented.

## Future slices

| Slice | Intended action       | Boundary                       |
| ----- | --------------------- | ------------------------------ |
| MC-01 | `inspect_document`    | read-only governed action      |
| MC-02 | `publish_document`    | governed mutation              |
| MC-03 | `publish_document`    | exact-operation human approval |
| MC-04 | destructive operation | hard denial and no effect      |

The eventual demonstration may show `READ → ALLOW`, `PUBLISH → APPROVAL`, and
`DELETE → DENY`, but mutation, approval, and destructive challenge workflows are not
implemented in MC-01.
