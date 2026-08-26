# Fates boundary and provenance

## Status

The Console consumes The Fates as an external authority through a deliberately small,
Console-facing adapter contract. MC-00 does not copy or bundle any Fates runtime source.

The authoritative local-Qwen acceptance closure is the following Integration commit:

```text
Repository: hourwise/Project-Fates-Integration
Branch: codex/fates-004b-implementation
Closure: eb0d83bdc96152a5e11c77ff56a753e6fa707c18
Commit: docs(integration): record successful local qwen acceptance
```

The actual Integration harness used for the live campaign was:

```text
a37542e30735f8385edf7cce3cd123f8ef373458
```

The closure reports:

```text
MVP implementation + local-model acceptance: achieved
Containment / security-complete seal: deferred
```

## Frozen candidate provenance

| Item                          | Identity                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| Candidate                     | `fates-pre-qwen-security-2026-08-25`                               |
| Candidate status              | provisional                                                        |
| Adrasteia / Runtime Contracts | `6aba3ef466a16292689d4afaf9f9bc40dc013301`                         |
| Ananke                        | `f5b071bb3f36a3721ca58811c74af5031c456832`                         |
| Mnemosyne                     | `24f8541ce0e0a2f56171544a249cff56e7b634d1`                         |
| Horae                         | `3a174b3f1bf791b437a22b4cfd41bf9677b9cba9`                         |
| Moirae Code                   | `b23f723fc5267c95fe9f7eccb2efa32465f8d2f1`                         |
| Runtime Contracts artifact    | `project-runtime-contracts-0.6.2.tgz`                              |
| Runtime Contracts SHA-256     | `44139c4cf1ca05ea684e122a2c4d75ff0f1a77e7020a61317e9569ae643dbd86` |

> These SHAs establish provenance for Moirae Console's initial development baseline. They
> are not credentials and do not grant browser-side authority.

## Qwen acceptance baseline

The frozen live model was `Qwen3.5-0.8B-Q4_0.gguf` with SHA-256
`57d1997790d1744fba5b40a7317df71ea5e2acee28c47e78f0cce39c0703f8cf`. The observed
configuration was GGUF, 752393024 parameters, Q4_0 quantization, context 8192,
temperature 0, seed 42, and a loopback endpoint at `http://127.0.0.1:8080/v1`.

The acceptance classification was 50 PASS, 3 KNOWN_LIMITATION, 0 FAIL, 0 FRICTION, and
0 NOT_EXERCISED across 53 validated cases. The recorded security counters were zero and
`securityFailure` was false. The 2/2 negative control passed, the governed smoke completed,
and the tampered content surface was quarantined.

This evidence supports MVP implementation and local-model integration acceptance for the
frozen candidate. It does not support production readiness, security completeness, universal
model safety, Firecracker/KVM containment, durable power-loss recovery, or resistance to
novel attacks outside the corpus.

## What the Console consumes

The Console consumes a request identity, caller identity, action, immutable parameter
snapshot, request context, and a returned outcome carrying decision/evidence identifiers. The
local types in `src/fates/` are a provisional adapter contract, not a new canonical Fates wire
protocol. Translation is isolated so a future official Fates service or SDK can replace it.

## What the Console must never own

The browser must not own Fates policy, authority keys, long-lived authority credentials,
runtime source, raw campaign evidence, model files, or a local allow/deny ruleset. The Console
must not manufacture receipts, upgrade decisions, or use a fake provider in production.

Raw local evidence is intentionally not duplicated here. The upstream closure is provenance,
not a second evidence archive.

## MC-02 transport status

MC-02 uses the real canonical Ananke transport for live mode. The Console host sends an
authenticated `POST /api/execute` request using the host-only
`ANANKE_MOIRAE_EXECUTION_TOKEN` and the fixed logical operation:

```text
inspect_document
  → fates.moirae.inspect-document.v1
  → documentId=demo-policy-001
  → expectedSha256=f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c
  → purpose=moirae.document-inspection
```

The canonical Ananke and Integration mainline checkpoints for this slice are recorded in the
MC-02 report. The historical accepted Integration evidence commit remains separate from its
mainline transplant.

The Ananke outcome is authority-only: Fates does not possess, read, or return the protected
Moirae fixture. Before disclosure the Console validates the canonical action, fixed resource,
expected digest, purpose binding, authenticated workload provenance, request/correlation
identity, canonical and authority-binding digests, decision/outcome/audit identifiers,
`COMPLETED`/`ALLOW`, `AUTHORIZATION_ONLY_NO_RESOURCE_READ`, zero Fates reads, and no Fates
disclosure. It then reads its own fixed bytes, hashes those same bytes, and discloses only on
exact equality.

Synthetic providers remain available only to deterministic tests and explicit
`synthetic-demo` tests. Synthetic evidence cannot satisfy the production predicate, and a live
configuration failure becomes unavailable/fail-closed rather than selecting a fake provider.

The Vite middleware is demonstration-only. A production deployment must replace it with an
authenticated host/service boundary, secret custody, endpoint controls, response cache policy,
TLS/service identity, and operational timeout/replay controls. No browser JavaScript receives
the token or direct access to Ananke.

## MC-03 freshness and replay boundary

The MC-03 Ananke change is limited to the existing canonical action
`fates.moirae.inspect-document.v1`; it does not copy the Moirae fixture into Fates and does not
modify Runtime Contracts, Mnemosyne, Horae, or Moirae Code. The action now issues a bounded
authority-only receipt with:

- `issuedAt` and `expiresAt` from the Ananke host clock;
- a 5-second demonstration lifetime, never exceeding the configured 10-second maximum;
- `receiptId` and `nonce` as one-use identity material;
- `replayKeyDigest` bound to the exact action, arguments, authenticated workload context,
  purpose, and correlation;
- `authorityReceiptDigest` covering the exact semantic and freshness fields.

The Ananke replay guard rejects a repeated canonical replay key during the running gateway
process. The Console independently claims the returned `receiptId` before its own fixed-byte
read using a bounded host-local consumption store. These are one-use semantics for the
concrete governed request; browser storage is never used. Expired entries are cleaned up.

The current architecture has no production signing-key or signed-receipt verifier available
for this action. The digest is therefore canonical digest integrity transported over the
authenticated host-to-Ananke boundary, not a cryptographic signature. The exact status is:

```text
AUTHENTICATED_TRANSPORT_BOUND_AUTHORITY
```

The in-memory Console consumption store is not restart-persistent. Cross-restart replay
protection, durable receipt retention, TLS/service identity, and operational monitoring remain
deployment work and are not claimed by MC-03.

## MC-04 publication authority

MC-04 adds the distinct canonical action `fates.moirae.publish-document.v1` for the external
`publish_document` proposal. It is not an alias for `fates.moirae.inspect-document.v1` or the
historical Slice 02 action. The exact bounded authority parameters are:

```text
documentId:     demo-policy-001
expectedSha256: f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c
destinationId:  moirae.demo-publication-slot.v1
purpose:        moirae.document-publication
```

Ananke uses a separate host workload profile and `ANANKE_MOIRAE_PUBLISH_TOKEN`, scoped to the
fixed document, `publish` operation, and fixed destination. The inspection credential is not
widened. The trusted host calls the existing authenticated `POST /api/execute` endpoint; no
browser route calls Ananke directly.

Fates remains authority-only. The publication action is registered as `READ_ONLY` in Ananke
because Ananke performs no resource read or mutation. Its explicit effect semantic is
`AUTHORIZATION_ONLY_NO_PUBLICATION`, with `fatesResourceReadAttemptCount=0`,
`fatesPublicationAttemptCount=0`, and `documentPublicationByFates=false`. `COMPLETED` means
the Fates governance transaction completed, not that the document was published. Moirae
independently reads its fixed source bytes, hashes those same bytes, and performs the one fixed
host-side atomic publication only after exact authoritative evidence passes.

The MC-04 guarantee remains `AUTHENTICATED_TRANSPORT_BOUND_AUTHORITY`: canonical request,
authority-binding, and receipt digests are verified over authenticated transport, but no
cryptographically signed receipt is claimed. Fates replay state and the Console receipt store
remain the accepted MC-03 process-local demonstration mechanisms. The publication file store
is also demonstration-only; durable cross-restart effect reconciliation, TLS/service identity,
operational monitoring, and deployment hardening remain release work.

## MC-05 human approval

MC-05 uses the existing canonical Ananke approval engine; it does not add a Moirae policy
engine or a new WebMCP tool. The tracked publication composition configures the exact canonical
action `fates.moirae.publish-document.v1` to return `REQUIRE_APPROVAL` initially. The pending
result is authoritative evidence bound to the fixed action, document ID, expected digest,
destination, purpose, authenticated workload, acting principal, original request ID,
correlation ID, canonical request digest, authority-binding digest, approval identity, issue
time, and expiry.

The browser receives only the opaque `approvalRequestId` and renders the fixed operation. A
human decision is sent through the trusted Console host to Ananke's authenticated approval
endpoint with the distinct host-side `ANANKE_MOIRAE_APPROVER_TOKEN`. The tracked demonstration
operator is `moirae-demo-operator`, scoped to the publication action; this is not production
SSO or human authentication. A rejected or expired record is terminal. An approved record is
then re-submitted through the same authenticated `/api/execute` path with the exact original
request and correlation identity. Ananke validates the approval binding and only then issues a
fresh short-lived one-use publication authority.

Fates does not possess, read, or publish the Moirae document. Approval completion and publication
completion remain separate: Fates records the approval transition and authority, while the
Moirae host verifies the fixed source bytes and performs the existing atomic publication. The
integrity status remains `AUTHENTICATED_TRANSPORT_BOUND_AUTHORITY`; canonical digests and
authenticated transport are present, but MC-05 does not claim cryptographically signed
receipts. The approval store and operator sessions are process-local demonstration state and
are not restart-persistent.

## MC-06 authoritative DENY

The denied demonstration still submits the exact canonical operation:

```text
fates.moirae.publish-document.v1
documentId=demo-policy-001
expectedSha256=f00d46e0cb81f67ed7a3d516939bd86ce5401e6c01321dbc90ca3374899a2d6c
destinationId=moirae.demo-publication-slot.v1
purpose=moirae.document-publication
```

Ananke authenticates the host-held restricted workload `moirae-restricted-agent`, whose
bounded resource scope contains the document but no `publish` operation. A server-owned exact
denial rule binds that profile, purpose, scope, and canonical request digest and produces the
authoritative `DENIED` policy result before approval or execution. This is a Fates/Ananke
authority decision, not a Console blacklist, UI state, malformed request, authentication error,
or transport failure.

The denial evidence records the canonical action/resource/purpose, workload provenance, request
and correlation identity, policy decision/reason, decision and audit identity, and
`AUTHORIZATION_ONLY_NO_PUBLICATION` semantics with zero Fates resource reads and zero Fates
publication attempts. No approval request, execution receipt, or host publication authority is
issued. Fates does not possess, read, or publish the document.
