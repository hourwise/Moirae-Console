# MC-11 independent review package

This is a neutral handoff package for an independent reviewer. It contains
source graph, checkpoints, and reproduction intent only. It does not contain a
pass conclusion.

## Neutral review prompt

> Try to break this source distribution. Do not assume the implementation,
> license claims, artifact provenance, or clean-room instructions are correct.
> Verify the exact source graph, attempt a fresh source build, and test the
> real ALLOW, REQUIRES_APPROVAL/human approval, and
> DENY paths over HTTP. Report exact observed versus expected behavior.

## Exact source graph under review

```text
Moirae Console 0434c7b8e73b41c175a0b0fb3998f9c5cf4552de
        ↓ authenticated POST /api/execute
Project Ananke 5fa868b0355c7e2f000ef80db5d27d5c6987e6f2
        (runtime base 0afd16ac3827c568bf3d3a4affcaf85ada7800b2)
        ↓ @ananke/adrasteia-adapter
project-runtime-contracts 0.6.2
        ↓ Project-Adrasteia a1c01bf9e6f9d6a126cfdcc1acfacd488b214210
          (source base 6aba3ef466a16292689d4afaf9f9bc40dc013301)
```

The minimum runtime source set is Console, Ananke, and Project-Adrasteia.
Project-Fates-Integration is evidence-only. Mnemosyne, Horae, and Moirae Code
are not imported or installed by the exact runtime path.

## License/provenance checkpoints

| Component         | Checkpoint                                                                                   | Declared license | Root license | Public state at audit         |
| ----------------- | -------------------------------------------------------------------------------------------- | ---------------- | ------------ | ----------------------------- |
| Console           | `0434c7b8e73b41c175a0b0fb3998f9c5cf4552de` plus MC-11 docs                                   | Apache-2.0       | Present      | public release not authorized |
| Ananke            | `5fa868b0355c7e2f000ef80db5d27d5c6987e6f2` (base `0afd16ac3827c568bf3d3a4affcaf85ada7800b2`) | MIT              | Present      | source repo private           |
| Project-Adrasteia | `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210` (base `6aba3ef466a16292689d4afaf9f9bc40dc013301`) | MIT              | Present      | source repo private           |

The exact Ananke lockfile now points to the HTTPS Git source at
`a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`. Project-Adrasteia's `prepare`
script builds `dist` during Git installation. Two independent source builds
produced identical package contents and the same package archive SHA-256
`AAB38EA052AFA8C5230932510DEFB0610B96B1000EAF12A9BE55936D46B6EB40`.
The historical private release artifact is not used by the new path.

## Commands for a future clean-room run

Use fresh checkouts and no existing sibling `node_modules`. The exact Git
source pin requires the repository to be publicly readable for a future
no-credential run; while visibility remains private, a local authenticated
source-only run is evidence of buildability, not public reproducibility:

```text
# Runtime contracts / Project-Adrasteia
git checkout a1c01bf9e6f9d6a126cfdcc1acfacd488b214210
npm ci --no-audit --no-fund
npm run build

# Ananke
git checkout 5fa868b0355c7e2f000ef80db5d27d5c6987e6f2
npm ci --no-audit --no-fund
npm run verify:adrasteia-source
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

- Ananke and Project-Adrasteia are currently private, so a no-credential
  public clean-room cannot yet be completed;
- the historical private artifact is retained only as evidence and is not used
  by the source-pinned release path;
- receipts are authenticated-transport-bound rather than signed;
- replay and approval state are process-local;
- operator identity and step-up are demonstration-grade;
- durable production host, TLS/service identity, and monitoring are pending;
- dependency advisories and formatter baseline debt remain tracked.
