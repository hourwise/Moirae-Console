# WebMCP challenge distribution

This repository is the Moirae Console application and is intended to be released under
Apache-2.0 after a separate visibility approval. The Console calls the canonical Ananke HTTP
boundary; it does not copy, fork, or reimplement Fates policy code.

## Distribution decision

MC-10 has traced the real runtime graph and has not yet cleared the public
distribution gate. The exact graph, license matrix, artifact comparison, and
clean-room blocker are recorded in
[`PUBLIC_RUNTIME_DISTRIBUTION.md`](PUBLIC_RUNTIME_DISTRIBUTION.md) and
[`CHALLENGE_RELEASE_MANIFEST.json`](CHALLENGE_RELEASE_MANIFEST.json).

The intended release model remains the public-dependency strategy, subject to
the separate public-source and artifact-provenance gate:

- Moirae Console is the submitted application repository.
- Project-Ananke is the required Fates runtime boundary and must be publicly reachable at the
  documented checkpoint before publication.
- Any Ananke dependency required by the selected runtime must also be publicly reachable and
  independently licensed before publication.
- The Console source contains no private Git URL, credential, protected fixture copy, or local
  machine path.

The challenge release must not depend on an untracked sibling checkout. A clean-room run must
start the Ananke boundary from a documented public checkout or from a separately published,
reviewed release package. If those prerequisites are not public and reproducible at release
review time, publication is blocked rather than replaced with a fake policy provider.

## Included source boundary

The Console repository includes the WebMCP registration boundary, the bounded same-origin host
adapter, the fixed non-sensitive fixture, the tests, and the instructions needed to run the
Console. Fates remains a separately governed dependency. Moirae does not claim that the Console
repository alone contains the Fates implementation.

## Release checks

Before publication, verify from a fresh checkout:

1. no private repository URL or machine-specific path is required;
2. the documented Ananke endpoint can be started using public source;
3. the Console can build and start with only documented environment variables;
4. both WebMCP tools register through `document.modelContext`;
5. no authority credential enters browser assets or responses;
6. the Apache-2.0 license and any required third-party notices are present.
