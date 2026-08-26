# MC-10 independent review package

This is a neutral handoff package for an independent reviewer. It contains
source graph, checkpoints, and reproduction intent only. It does not contain a
pass conclusion.

## Neutral review prompt

> Try to break this source distribution. Do not assume the implementation,
> license claims, artifact provenance, or clean-room instructions are correct.
> Verify the exact source graph, attempt a fresh build without private
> dependencies, and test the real ALLOW, REQUIRES_APPROVAL/human approval, and
> DENY paths over HTTP. Report exact observed versus expected behavior.

## Exact source graph under review

```text
Moirae Console 0434c7b8e73b41c175a0b0fb3998f9c5cf4552de
        ↓ authenticated POST /api/execute
Project Ananke 693b386218e73afaa579cb6457f054007293581b
        ↓ @ananke/adrasteia-adapter
project-runtime-contracts 0.6.2
        ↓ Project-Adrasteia 6aba3ef466a16292689d4afaf9f9bc40dc013301
```

The minimum runtime source set is Console, Ananke, and Project-Adrasteia.
Project-Fates-Integration is evidence-only. Mnemosyne, Horae, and Moirae Code
are not imported or installed by the exact runtime path.

## License/provenance checkpoints

| Component         | Checkpoint                                                            | Declared license | Root license                | Public state at audit         |
| ----------------- | --------------------------------------------------------------------- | ---------------- | --------------------------- | ----------------------------- |
| Console           | `0434c7b8e73b41c175a0b0fb3998f9c5cf4552de` plus MC-10 docs            | Apache-2.0       | Present                     | public release not authorized |
| Ananke            | `693b386218e73afaa579cb6457f054007293581b` / license branch `0afd16a` | MIT              | Present on branch `0afd16a` | source repo private           |
| Project-Adrasteia | `6aba3ef466a16292689d4afaf9f9bc40dc013301`                            | MIT              | Present                     | source/release private        |

The exact Ananke lockfile points to a Project-Adrasteia release tarball. A
fresh build from the accepted source has the same package file set but differs
from the downloaded release in line endings for two package files. This must
be resolved or explicitly approved before calling the runtime source-only
reproducible.

## Commands for a future clean-room run

Use fresh checkouts and no existing sibling `node_modules` or private npm/Git
credentials:

```text
# Runtime contracts / Project-Adrasteia
npm ci --no-audit --no-fund
npm run build

# Ananke
npm ci --no-audit --no-fund
npm run build
npm test

# Console
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
npm start
```

Configure only documented server-side environment variable names. Never put
credentials in browser code, URLs, screenshots, or this package.

## Runtime evidence required

The clean-room run must exercise, using the real Ananke authority boundary:

1. `inspect_document` → ALLOW → DISCLOSED;
2. `publish_document` → REQUIRES_APPROVAL;
3. agent self-approval rejection;
4. explicit operator step-up → Fates approval → PUBLISHED;
5. restricted caller → Fates DENY → NOT EXECUTED.

The MC-09 HTTP regression set must also cover non-2xx authority bodies,
field-substitution/mayPublish checks, untrusted Origin, `text/plain`, direct
fixture routes, concurrent approval, and DENY upgrade attempts.

## Known limitations to verify

- source repositories and the contract release are currently private;
- contract release/source byte reproducibility has a line-ending mismatch;
- receipts are authenticated-transport-bound rather than signed;
- replay and approval state are process-local;
- operator identity and step-up are demonstration-grade;
- durable production host, TLS/service identity, and monitoring are pending;
- dependency advisories and formatter baseline debt remain tracked.
