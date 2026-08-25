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
