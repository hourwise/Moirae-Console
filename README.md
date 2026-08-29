# Moirae Console

Governed agent actions for the web.

WebMCP tells an agent what a website can do. The Fates determines what the
agent is allowed to do. Moirae Console makes that boundary visible to the
human.

## What the demo proves

This release candidate exposes exactly two WebMCP tools:

- `inspect_document` — request governed, read-only inspection of the fixed
  `demo-policy-001` document.
- `publish_document` — request governed publication of that same fixed
  document to one fixed host-side destination.

The human-facing screen shows three outcomes:

1. `ALLOW` → `DISCLOSED`
2. `REQUIRES_APPROVAL` → human `APPROVE` → `PUBLISHED`
3. restricted caller `DENY` → `NOT EXECUTED`

Approval and restricted-agent controls are Console presentation functions;
they are not additional WebMCP tools.

## Public runtime source

The real authority path is built from these exact source checkpoints:

```text
Moirae Console @ 8c5109c52bb8065d9c1b4f4a81e0e6df9e830030
   ↓
Project Ananke @ 3d76adb162a0ff07b5630700ae30a823f1419cb4
   ↓
Project-Adrasteia / Runtime Contracts 0.6.2
   ↓
release/webmcp-runtime-v0.6.2
   ↓
a1c01bf9e6f9d6a126cfdcc1acfacd488b214210
```

The reviewed Console implementation is the MC-14 remediation successor: `204e52e...`
closed the Console red-team gaps and `8c5109c...` is its presentation/UI successor.
Ananke `3d76adb...` is the successor to the older documented `5fa868b...` runtime
authority checkpoint and closes cross-authority credential reuse. Runtime Contracts
remains pinned to the exact `a1c01bf...` source commit.

Project-Adrasteia `main` is currently a separate older `0.4.0` lineage at
`f9eeb25076e0a590f13c7bed6c8de8c9a363ce1b`; it is not the source used by the
hackathon runtime. Ananke pins the reviewed Runtime Contracts source by exact
commit, so this reference branch is a provenance pointer rather than an
authority upgrade or a merge claim.

Source links: [Project Ananke](https://github.com/hourwise/Project-Ananke) and
[Project-Adrasteia Runtime Contracts 0.6.2](https://github.com/hourwise/Project-Adrasteia/tree/release/webmcp-runtime-v0.6.2).

## Architecture

```text
AI agent
   ↓ WebMCP: document.modelContext.registerTool()
Moirae Console browser surface
   ↓ same-origin bounded Console API
Trusted Moirae host
   ↓ authenticated POST /api/execute
The Fates / Ananke
   ↓ ALLOW / REQUIRES_APPROVAL / DENY
Moirae host verifies evidence and performs the fixed effect
```

Fates governs the action and authority. Moirae owns the application document
and the host-side disclosure/publication effect. Capability discovery is not
authority.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

The Console depends on a separately running Ananke authority. The public
Ananke repository contains the runtime source; use the MC-16-reviewed
source-dependency checkpoint for this demonstration:

```shell
git clone --branch release/webmcp-runtime-v0.6.2 https://github.com/hourwise/Project-Adrasteia.git ../Project-Adrasteia
cd ../Project-Adrasteia
git checkout a1c01bf9e6f9d6a126cfdcc1acfacd488b214210
npm ci --no-audit --no-fund
npm run build

git clone https://github.com/hourwise/Project-Ananke.git ../Project-Ananke
cd ../Project-Ananke
git checkout 3d76adb162a0ff07b5630700ae30a823f1419cb4
npm ci
npm run build
npm run build -w @ananke/runtime-core
npm start -w @ananke/runtime-core
```

Configure the required Ananke credentials only in the Ananke host process.
Use local placeholder values, never values committed to a file:

```shell
ANANKE_MOIRAE_EXECUTION_TOKEN=<inspection-token>
ANANKE_MOIRAE_PUBLISH_TOKEN=<publication-token>
ANANKE_MOIRAE_APPROVER_TOKEN=<approver-token>
ANANKE_MOIRAE_RESTRICTED_TOKEN=<restricted-token>
```

In a second terminal, from this repository:

```shell
npm ci --no-audit --no-fund
npm run build
set PORT=4173
set ANANKE_MOIRAE_EXECUTION_URL=http://127.0.0.1:3000/api/execute
set MOIRAE_PUBLICATION_STORE_ROOT=%TEMP%\moirae-console-publication
npm start
```

PowerShell equivalents are:

```powershell
$env:PORT = '4173'
$env:ANANKE_MOIRAE_EXECUTION_URL = 'http://127.0.0.1:3000/api/execute'
$env:MOIRAE_PUBLICATION_STORE_ROOT = Join-Path $env:TEMP 'moirae-console-publication'
npm start
```

Open `http://127.0.0.1:4173`. The production host serves only built assets,
the bounded same-origin Console API, and `GET /healthz`. It does not serve
source directories or expose Ananke to browser JavaScript.

The host fails closed when the required Fates transport credentials are
absent. The fixed document fixture and publication target remain host-side.

## Try with an AI agent

WebMCP is experimental. In Google Chrome, enable
`chrome://flags/#enable-webmcp-testing`, relaunch Chrome, and open the live
or local Console URL. ChatGPT's in-app browser supports WebMCP, but this
repository does not claim that a ChatGPT-hosted deployment has been tested.

Ask the agent to:

1. inspect the demonstration policy document;
2. observe Fates `ALLOW` and the governed disclosure;
3. request publication of the demonstration document;
4. observe `REQUIRES_APPROVAL` and use the human approval card;
5. run the visible restricted-agent demonstration and observe Fates `DENY`
   and `NOT EXECUTED`.

The agent can discover only `inspect_document` and `publish_document`.
It cannot choose Fates actions, credentials, callers, digests, destinations,
purposes, approval states, or receipts.

## Judge quick start

Open the live Moirae Console URL provided in the official submission and ask the
agent to run these three bounded demonstrations:

1. Inspect the demonstration policy document. Expected: `ALLOW -> DISCLOSED`.
2. Publish the demonstration policy document. The first result is expected to be
   `REQUIRES_APPROVAL -> NOT PUBLISHED`; a human then uses the approval card.
   Judges receive the demonstration approval password separately through the
   official submission testing instructions. No approval password or Fates
   transport credential is stored in this repository. Successful approval is
   `APPROVED -> PUBLISHED`.
3. Run the visible restricted-agent demonstration. Expected:
   `DENY -> NOT EXECUTED`.

Because the demonstration destination is intentionally fixed, a later approved
publication may report host state `ALREADY_PUBLISHED`. This is expected
idempotent behaviour, not a failed approval.

## Development checks

```shell
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
npm audit --omit=optional
```

The inherited formatter baseline is reported separately in the release
report and is not silently repaired by this candidate.

## Security scope

This is a bounded hackathon/reference implementation, not a production
security-complete system. Known limitations include process-local replay and
approval state, demonstration-grade workload/operator identity, a bounded
local publication store, authenticated-transport-bound rather than signed
receipts, pending TLS/service identity, pending operational monitoring, and
no distributed exactly-once guarantee, and known registered dependency advisories.

See [`SECURITY.md`](SECURITY.md), [`docs/RELEASE_SECURITY_DEBT.md`](docs/RELEASE_SECURITY_DEBT.md),
and [`docs/CHALLENGE_DISTRIBUTION.md`](docs/CHALLENGE_DISTRIBUTION.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE).
