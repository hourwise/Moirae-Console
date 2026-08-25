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

In MC-00 the route stops after the authoritative or fail-closed outcome. The adapter in
`src/webmcp/adapter.ts` has no side-effect executor and no direct database, filesystem, or
external mutation path:

```text
WebMCP invocation
      ↓
input/tool validation
      ↓
immutable governed request snapshot
      ↓
Console Fates client
      ↓
authoritative outcome or NO EFFECT error state
```

The experimental nature of WebMCP means its discovery and registration behaviour must remain
replaceable. Neither tool metadata nor browser origin may weaken caller identity, request
context, candidate binding, idempotency, replay protection, or freshness rules.

## Future slices

| Slice | Intended action       | Boundary                       |
| ----- | --------------------- | ------------------------------ |
| MC-01 | `inspect_document`    | read-only governed action      |
| MC-02 | `publish_document`    | governed mutation              |
| MC-03 | `publish_document`    | exact-operation human approval |
| MC-04 | destructive operation | hard denial and no effect      |

The eventual demonstration may show `READ → ALLOW`, `PUBLISH → APPROVAL`, and
`DELETE → DENY`, but none of those challenge workflows are implemented in MC-00.
