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
