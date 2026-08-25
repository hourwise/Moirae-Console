# Moirae Console

Moirae Console is the human- and agent-facing governance surface for The Fates.

As applications expose structured actions to AI agents, discovering an action does not
mean that the agent possesses authority to execute it. Moirae Console is intended to
make that distinction visible and usable.

```text
Capability ≠ Authority
```

## Architecture

```text
Agent / WebMCP
      ↓
Moirae Console
      ↓
The Fates
      ↓
governed outcome
```

The Console is a surface, not an authority. WebMCP is an inbound adapter: a discovered or
invoked tool becomes a governed request at the Console/Fates boundary. MC-00 contains no
direct WebMCP-to-side-effect path and no governed mutation implementation.

## Current state

This repository is at the **MC-01 first governed read-only disclosure stage**:

- pre-production;
- private development repository;
- independently buildable and testable with a deterministic synthetic governance provider;
- no production deployment;
- no containment or security-complete claim;
- one bounded, read-only `inspect_document` demonstration path;
- no final WebMCP challenge workflow.

The MC-01 demonstration uses a fixed host-side fixture and keeps production Fates transport
unavailable/fail-closed until a separately approved integration is available. Mutation,
approval, and destructive workflows are later slices and are not implemented here.

## Development

Requirements: Node.js 22.12 or newer and npm.

```shell
npm ci
npm run typecheck
npm run lint
npm run format
npm test
npm run build
npm run check:bundle
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/FATES_BOUNDARY.md`](docs/FATES_BOUNDARY.md),
[`docs/WEBMCP_BOUNDARY.md`](docs/WEBMCP_BOUNDARY.md), and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
for the MC-00 boundaries and limitations.

## Licence

Moirae Console is released under the Apache License 2.0. See [`LICENSE`](LICENSE).
