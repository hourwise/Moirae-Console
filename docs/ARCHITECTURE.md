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

## MC-00 through MC-03 boundary

The WebMCP adapter accepts an invocation, validates that the tool is registered, snapshots
the request, and submits it to the Console-facing `FatesClient`. It returns the authoritative
or fail-closed outcome to the host-side disclosure boundary. It has no database, arbitrary
filesystem, network-mutation, or mutation callback.

The React surface is presentation only. It requests one fixed, read-only demonstration
document through `/api/inspect-document`; it never imports or retrieves the fixture directly.
The trusted host adapter maps that request to the fixed Fates action
`fates.moirae.inspect-document.v1`, injects the expected digest and purpose, and calls the
authenticated Ananke `POST /api/execute` endpoint. The host-side service reads the fixed
fixture only after authoritative evidence passes `mayDisclose(...)`, then hashes and returns
the same bytes. MC-02 adds no mutation, approval workflow, database, deployment integration,
or final challenge workflow.

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
   MC-02's only effect is the fixed host-side read after the authoritative disclosure predicate.
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
11. **MC-INV-011 — Authority-only is not document access.** Fates authorizes the exact
    document identity and content digest but does not possess or read the Console fixture.
12. **MC-INV-012 — Same-byte disclosure.** The host hashes the exact immutable byte snapshot
    that it converts into the disclosed response body; a digest mismatch discloses nothing.
13. **MC-INV-013 — Fresh authority.** The host rejects future, malformed, inverted, expired,
    or overlong Fates authority timestamps and never extends them.
14. **MC-INV-014 — One-use receipt.** A successfully consumed authoritative receipt cannot be
    reused by the same host process for another disclosure.
15. **MC-INV-015 — Receipt-bound freshness.** Freshness and nonce fields are included in the
    canonical receipt digest and are rejected when altered without a matching digest.
16. **MC-INV-016 — Cache minimisation.** Governed success and failure responses carry bounded
    no-store cache controls; credentials and receipt material are not placed in URLs.

MC-03 adds bounded freshness and one-use semantics to the same path. Ananke issues
`issuedAt`, `expiresAt` (5 seconds, with a 10-second maximum), `receiptId`, `nonce`, and a
canonical `authorityReceiptDigest` in its authority-only evidence. The receipt digest is a
cross-field integrity checksum, not a signature. The current guarantee is therefore
`AUTHENTICATED_TRANSPORT_BOUND_AUTHORITY`; cryptographic signed-receipt verification is not
claimed. Ananke also rejects the same canonical replay key once per running gateway process.

The consuming Console claims the receipt ID in a bounded host-local store before reading the
fixture. Expired entries are cleaned up and the store has a fixed capacity. This demonstration
store is intentionally not restart-persistent; a production deployment must replace it with a
durable authenticated store before claiming replay protection across host restarts. Browser
input cannot choose the lifetime, nonce, receipt ID, or consumed state. Governed responses use
`Cache-Control: no-store` and related no-cache controls.

These are boundary obligations, not a claim that MC-00 proves the upstream Fates system or
future transport secure against every threat.

## Future direction

MC-03 hardens the existing live authoritative transport for one fixed read-only
`inspect_document` action with fresh, one-use authority. A later slice may address a separate,
explicitly authorized operation, but it must not reuse this demonstration fixture boundary as a
general document store or treat an
authorization-only Fates outcome as a document read.
