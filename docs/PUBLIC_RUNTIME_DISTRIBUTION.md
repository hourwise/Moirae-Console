# MC-12 public runtime distribution

Status: **public source graph verified; anonymous clean-room execution complete**.

This document records the smallest source graph needed to run the real
hackathon authority path. It is a release-preparation document; it does not
make any repository public and it does not publish an npm package.

## Runtime graph

```text
Moirae Console
  └─ authenticated HTTP POST /api/execute
       └─ Project Ananke / @ananke/runtime-core
            ├─ @ananke/adrasteia-adapter
            │    └─ project-runtime-contracts 0.6.2
            │         └─ Project-Adrasteia `release/webmcp-runtime-v0.6.2`
            ├─ @ananke/schema, authority-engine, policy-engine
            ├─ outcome-engine, audit-engine, tool-router
            └─ Hono, better-sqlite3, jose, zod (registry dependencies)
```

Console does not import Fates packages or copy Fates policy logic. It calls
the authenticated Ananke HTTP boundary from trusted server-side code. The
same Ananke runtime supplies the real inspection ALLOW, publication
REQUIRES_APPROVAL/ALLOW, and restricted-caller DENY paths.

## Required source set

| Component                             | Exact source checkpoint                                                                                                 | Runtime role                                                       | Current source status                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Moirae Console                        | `40c85771cbd9a50c68062a0b7c2c9ee1c0c5d026` | Browser, bounded same-origin host, WebMCP, resource/effect adapter | Public source; anonymous clean-room verified |
| Project Ananke                        | `5fa868b0355c7e2f000ef80db5d27d5c6987e6f2` (runtime base `0afd16ac3827c568bf3d3a4affcaf85ada7800b2`) | Canonical authenticated Fates HTTP authority | Public source; anonymous clean-room verified |
| Project-Adrasteia / Runtime Contracts | `release/webmcp-runtime-v0.6.2` → `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210` (base `6aba3ef466a16292689d4afaf9f9bc40dc013301`) | Runtime contract package consumed by Ananke | Public source; anonymous exact-SHA fetch and clean-room build verified |

The Console commit is the accepted MC-09 remediation checkpoint. The
distribution documents are additional review material on the bounded MC-09
branch and do not alter that runtime checkpoint.

## Not required by the exact challenge runtime

These accepted Fates repositories were not found in the imports, workspace
dependencies, or live server startup path for this bounded demonstration:

| Repository                | Classification                          | Reason                                                                                           |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Project-Fates-Integration | TEST/EVIDENCE ONLY                      | Compatibility and evidence files; not imported or installed by Console or Ananke runtime startup |
| Mnemosyne                 | NOT REQUIRED FOR CHALLENGE DISTRIBUTION | No import or package dependency in the Console → Ananke authority path                           |
| Horae                     | NOT REQUIRED FOR CHALLENGE DISTRIBUTION | No import or package dependency in the Console → Ananke authority path                           |
| Moirae Code               | NOT REQUIRED FOR CHALLENGE DISTRIBUTION | No import or package dependency in the Console → Ananke authority path                           |

Their accepted checkpoints remain frozen and untouched. Their source is not
silently represented as part of the minimum public runtime.

## Consumption and provenance

Ananke consumes the contract package through this exact HTTPS Git source pin:

```text
git+https://github.com/hourwise/Project-Adrasteia.git#
a1c01bf9e6f9d6a126cfdcc1acfacd488b214210
```

The exact source commit is also exposed through the stable
`release/webmcp-runtime-v0.6.2` reference. This branch is a
source-distribution reference to the reviewed `project-runtime-contracts`
`0.6.2` implementation; it is not a new software version and does not imply
a merge into Project-Adrasteia `main`.

Project-Adrasteia `main` currently points to
`f9eeb25076e0a590f13c7bed6c8de8c9a363ce1b`, a separate older `0.4.0` lineage.
That mainline is intentionally not the Runtime Contracts source used by the
Moirae hackathon runtime. Ananke remains pinned to the exact `a1c01bf...`
commit above, not to `main` or to a floating branch.

The Project-Adrasteia package has an npm `prepare` hook which builds `dist`
from source during Git installation. The lockfile records the exact source
pin and generated package integrity. The old private release URL is no longer
in the active Ananke dependency path.

Two independent clean builds from the packaging-correction source commit
produced identical 199-file package contents and archive SHA-256:

```text
AAB38EA052AFA8C5230932510DEFB0610B96B1000EAF12A9BE55936D46B6EB40
```

Two independent clean builds from the original reviewed `6aba3ef...` source
also produced identical 199-file contents. The historical private artifact
is not used by the new release path and remains historical evidence only:

```text
HISTORICAL_PRIVATE_ARTIFACT_NOT_USED_BY_PUBLIC_RELEASE
```

## License and package policy

- Console: Apache-2.0.
- Ananke: MIT is declared by project history and README; the source-pinned
  branch contains the standard root MIT `LICENSE`. The package remains
  `private: true`, intentionally; source distribution does not require npm
  publication.
- Project-Adrasteia / Runtime Contracts: MIT in the source package and root
  license. The package author field remains empty; no value was invented.
- Registry runtime packages used by Ananke include MIT packages (`hono`,
  `@hono/node-server`, `better-sqlite3`, `jose`, `zod`) and the ISC
  `zod-to-json-schema` package. Their lockfile versions and integrity values
  are the release inputs; this is a bounded notice, not a complete legal
  certification.

Each component keeps its own license. MIT source is not relabeled as
Apache-2.0 merely because Console is Apache-2.0.

## Required judge build shape after blocker resolution

The intended source-only distribution is Option A: public Console plus the
minimum public Ananke and Project-Adrasteia source repositories, each pinned
to the reviewed source commits.

```text
# Project-Adrasteia release/webmcp-runtime-v0.6.2 at a1c01bf9e6f9d6a126cfdcc1acfacd488b214210
npm ci --no-audit --no-fund
npm run build

# Project Ananke at 5fa868b0355c7e2f000ef80db5d27d5c6987e6f2
npm ci --no-audit --no-fund
npm run verify:adrasteia-source
npm run build
npm test

# Start Ananke's real runtime-core HTTP service with server-side credentials.
# Then, in the Console checkout:
npm ci --no-audit --no-fund
npm run build
npm start
```

The Console host requires only server-side environment variable names already
documented by `docs/DEPLOYMENT_PLAN.md`, including the Ananke endpoint and
separate execution, publication, approver, and restricted credentials. Values
must be supplied by the operator and never committed, placed in URLs, or sent
to browser JavaScript.

## Current gate result

The private artifact dependency has been removed from the active source path.
The hackathon source is the exact `release/webmcp-runtime-v0.6.2` reference,
not Project-Adrasteia `main`.
The source dependency, two-build reproducibility controls, anonymous source
fetches, and source-only runtime clean-room pass. The clean-room exercised
real inspection ALLOW/DISCLOSED, publication REQUIRE_APPROVAL with rejected
agent self-approval and explicit operator approval, and restricted publication
DENY/NOT_EXECUTED.

Project Ananke and Project-Adrasteia are public source dependencies for this
bounded challenge runtime. The four other Fates repositories remain outside
the runtime graph and private. This is a source/reproducibility gate result,
not a deployment, production-readiness, or npm-publication claim.
