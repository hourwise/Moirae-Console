# Public release checklist

MC-00 does not change repository visibility, publish a release, deploy the application, or
claim public-release readiness. Complete this checklist before a future visibility change.

- [ ] Apache-2.0 licence is present and reviewed.
- [ ] No credentials, private keys, access tokens, or unpublished configuration are tracked.
- [ ] No private repository URLs remain unless their publication is intentional and reviewed.
- [ ] No private Fates implementation, source history, fixtures, or raw evidence was copied.
- [ ] No Qwen GGUF, local model, conversation dump, or unreviewed campaign evidence is present.
- [ ] No local absolute paths or machine-specific workspace references are present.
- [ ] Dependency licences and transitive notices are reviewed for Apache-2.0 publication.
- [ ] Install scripts, network access, and telemetry behaviour are reviewed.
- [ ] A clean checkout can install, typecheck, lint, test, format-check, and build.
- [ ] Security review covers the Console/Fates and WebMCP boundaries.
- [ ] Provenance review confirms the documented Fates baseline without copying evidence.
- [ ] README and SECURITY.md describe the actual implementation stage.
- [ ] WebMCP challenge requirements are reviewed for the relevant future slice.
- [ ] A deployed URL is reviewed before it is published.
- [ ] A demo/video is reviewed for accidental private data or overclaiming.
- [ ] Repository visibility is changed only through an explicitly authorised action.

## MC-07 WebMCP challenge gate

- [ ] The official challenge requirements are rechecked: live URL, public source, open-source
      license, complete runnable source/assets/instructions, project description, and a public
      video under three minutes.
- [ ] The current imperative WebMCP API is used: `document.modelContext.registerTool(...)`.
- [ ] Discovery exposes exactly `inspect_document` and `publish_document`.
- [ ] A normal Node production host serves static assets and only the bounded same-origin APIs.
- [ ] A clean-room checkout builds, starts, and runs the documented tests without private files.
- [ ] Public Fates dependency provenance and licenses are independently confirmed before release.
- [ ] Real browser WebMCP discovery and invocation evidence is captured, or the blocker is
      explicitly recorded.
- [ ] Repeat visits have a documented bounded publication outcome and no public reset endpoint.
- [ ] The live URL, repository, video, and submission are separately approved before publishing.
