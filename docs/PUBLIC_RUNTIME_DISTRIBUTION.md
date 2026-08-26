# MC-10 public runtime distribution

Status: **blocked pending public source and artifact provenance approval**.

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
            │         └─ Project-Adrasteia source
            ├─ @ananke/schema, authority-engine, policy-engine
            ├─ outcome-engine, audit-engine, tool-router
            └─ Hono, better-sqlite3, jose, zod (registry dependencies)
```

Console does not import Fates packages or copy Fates policy logic. It calls
the authenticated Ananke HTTP boundary from trusted server-side code. The
same Ananke runtime supplies the real inspection ALLOW, publication
REQUIRES_APPROVAL/ALLOW, and restricted-caller DENY paths.

## Required source set

| Component | Exact source checkpoint | Runtime role | Current source status |
| --- | --- | --- | --- |
| Moirae Console | `0434c7b8e73b41c175a0b0fb3998f9c5cf4552de` plus this document commit | Browser, bounded same-origin host, WebMCP, resource/effect adapter | Local source is present; public visibility is not authorized |
| Project Ananke | `693b386218e73afaa579cb6457f054007293581b` plus MC-10 license branch `0afd16a` | Canonical authenticated Fates HTTP authority | Required; source repository is currently private |
| Project-Adrasteia / Runtime Contracts | `6aba3ef466a16292689d4afaf9f9bc40dc013301` | Runtime contract package consumed by Ananke | Required; source repository and release are currently private |

The Console commit is the accepted MC-09 remediation checkpoint. The final
Console SHA for this documentation change is recorded in the commit and
manifest after commit creation.

## Not required by the exact challenge runtime

These accepted Fates repositories were not found in the imports, workspace
dependencies, or live server startup path for this bounded demonstration:

| Repository | Classification | Reason |
| --- | --- | --- |
| Project-Fates-Integration | TEST/EVIDENCE ONLY | Compatibility and evidence files; not imported or installed by Console or Ananke runtime startup |
| Mnemosyne | NOT REQUIRED FOR CHALLENGE DISTRIBUTION | No import or package dependency in the Console → Ananke authority path |
| Horae | NOT REQUIRED FOR CHALLENGE DISTRIBUTION | No import or package dependency in the Console → Ananke authority path |
| Moirae Code | NOT REQUIRED FOR CHALLENGE DISTRIBUTION | No import or package dependency in the Console → Ananke authority path |

Their accepted checkpoints remain frozen and untouched. Their source is not
silently represented as part of the minimum public runtime.

## Consumption and provenance

Ananke consumes the contract package through the exact lockfile URL:

```text
https://github.com/hourwise/Project-Adrasteia/releases/download/
adrasteia-preflight-v0.6.2-protocol-1.4.0/project-runtime-contracts-0.6.2.tgz
```

The lockfile records package version `0.6.2`, MIT metadata, and the exact
integrity value. The accepted Runtime Contracts source checkpoint is tagged
`adrasteia-preflight-v0.6.2-protocol-1.4.0` and builds a package with the
expected 199-file package shape.

The clean source build and the downloaded release artifact are not currently
byte-for-byte identical: the archive contents differ only in line endings in
`package/LICENSE` and `package/package.json` (LF in the source build versus
CRLF in the released artifact). This is an artifact reproducibility defect to
resolve before claiming a source-only public build. No private artifact is
silently substituted in this release candidate.

## License and package policy

- Console: Apache-2.0.
- Ananke: MIT is declared by project history and README; MC-10 adds the
  standard root MIT `LICENSE` on the separate provenance branch. The package
  remains `private: true`, intentionally; source distribution does not require
  npm publication.
- Project-Adrasteia / Runtime Contracts: MIT in the accepted source package and
  root license. The package author field is empty; ownership/provenance should
  be reviewed before public publication.
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
to the reviewed checkpoint or a reviewed reproducible release artifact.

```text
# In the documented public source checkouts
npm ci --no-audit --no-fund
npm run build

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

The minimum graph is not yet publicly reproducible because the two required
Fates source/release locations are private, and the exact contract artifact is
not reproducible byte-for-byte from the accepted source checkpoint. A clean
public runtime reproduction therefore cannot honestly be marked complete.

The required follow-up is a separately reviewed public-source/release action:

1. make the required source repositories legally and operationally publishable;
2. produce a deterministic contract artifact or document an approved source
   package mapping with matching provenance;
3. run the full source-only clean-room build and real ALLOW,
   REQUIRES_APPROVAL, human-approval, and DENY smokes;
4. perform a separate visibility/release approval.

Until then, the public distribution gate remains blocked rather than falling
back to a fake authority runtime.
