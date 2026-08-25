# Architecture

## Purpose

Moirae Console is the human- and agent-facing governance surface for The Fates. It displays
and requests governance; **The Fates owns governance**.

```text
Agent / Browser / WebMCP
          │
          ▼
     Moirae Console
       ├── UI
       └── WebMCP inbound adapter
          │
          ▼
  Host-side Moirae boundary
           │
           ▼
  Console Fates client boundary
          │
          ▼
        The Fates
       ├── Ananke
       ├── Mnemosyne
       ├── Horae
       ├── Runtime Contracts / Adrasteia
       └── Moirae runtime components where applicable
          │
          ▼
  authoritative governed outcome
          │
          ▼
  disclosure gate
           │
           ▼
  fixed host-side document source
```

The diagram intentionally does not prescribe an internal order between Fates. The canonical
Fates integration documentation remains authoritative for those runtime relationships.

## MC-00 and MC-01 boundary

The WebMCP adapter accepts an invocation, validates that the tool is registered, snapshots
the request, and submits it to the Console-facing `FatesClient`. It returns the authoritative
or fail-closed outcome to the host-side disclosure boundary. It has no database, arbitrary
filesystem, network-mutation, or mutation callback.

The React surface is presentation only. It requests one fixed, read-only demonstration
document through `/api/inspect-document`; it never imports or retrieves the fixture directly.
The host-side service reads the fixed fixture only after `mayDisclose(...)` accepts the
governance result. MC-01 adds no mutation, production authentication, database, deployment
integration, or final challenge workflow.

There is no `WebMCP → document source` shortcut and no browser-bundled protected document.
Disclosure is itself treated as an effect. A future mutable effect path must be a separate
bounded integration that accepts exact Fates evidence and preserves request identity,
context, replay, freshness, and approval bindings.

## Security invariants

MC-00 documents and structurally supports these invariants:

1. **MC-INV-001 — Surface is not authority.** UI, route, browser, and JavaScript state do not
   grant authority.
2. **MC-INV-002 — Capability is not authority.** `discoverable(tool) != authorised(caller,
tool, parameters)`.
3. **MC-INV-003 — No side-effect bypass.** Governed requests cross the Fates client boundary;
   MC-01's only effect is the fixed host-side read after the disclosure predicate.
4. **MC-INV-004 — Fail closed.** Unavailable, malformed, ambiguous, unknown, or unverifiable
   results become an error/unknown state and cause no effect.
5. **MC-INV-005 — UI cannot upgrade authority.** Presentation state cannot rewrite an outcome.
6. **MC-INV-006 — Approval is operation-bound.** The outcome shape leaves room for exact
   request/operation/parameter/context/evidence/freshness binding; approval is not implemented.
7. **MC-INV-007 — Display derives from evidence.** The view model retains the outcome and
   labels evidence as authoritative, synthetic-test-only, or unverified.
8. **MC-INV-008 — Browser origin does not weaken identity or replay rules.** Request context
   and caller identity cross the adapter unchanged and are snapshotted.
9. **MC-INV-009 — Model output is a proposal.** WebMCP input becomes a governed request, not
   ambient host authority.
10. **MC-INV-010 — Frontend compromise is not Fates compromise.** No signing keys or
    long-lived authority credentials are required by browser-delivered code.

These are boundary obligations, not a claim that MC-00 proves the upstream Fates system or
future transport secure against every threat.

## Future direction

MC-01 implements one fixed read-only `inspect_document` action. Later mutation and approval
slices must bind decisions to exact operation identity and parameters, and must not reuse this
demonstration fixture boundary as a general document store.
