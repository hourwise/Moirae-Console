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
  governed execution (future bounded integration)
```

The diagram intentionally does not prescribe an internal order between Fates. The canonical
Fates integration documentation remains authoritative for those runtime relationships.

## MC-00 boundary

The WebMCP adapter accepts an invocation, validates that the tool is registered, snapshots
the request, and submits it to the Console-facing `FatesClient`. It returns the authoritative
or fail-closed outcome to the caller. It has no database, filesystem, network-mutation, or
effect callback.

The React surface is presentation only. It renders the repository stage and does not call a
privileged effect. MC-00 intentionally has no effect executor, production authentication,
database, deployment integration, or final challenge workflow.

There is therefore no `WebMCP → governed side effect` shortcut in this slice. A future effect
path must be a separate bounded integration that accepts exact Fates evidence and preserves
request identity, context, replay, freshness, and approval bindings.

## Security invariants

MC-00 documents and structurally supports these invariants:

1. **MC-INV-001 — Surface is not authority.** UI, route, browser, and JavaScript state do not
   grant authority.
2. **MC-INV-002 — Capability is not authority.** `discoverable(tool) != authorised(caller,
tool, parameters)`.
3. **MC-INV-003 — No side-effect bypass.** Governed requests cross the Fates client boundary;
   MC-00 contains no alternate effect path.
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

The first future implementation slice should add a read-only `inspect_document` action. It
must keep the same adapter-to-Fates route and introduce no direct browser mutation. Later
mutation and approval slices must bind decisions to exact operation identity and parameters.
