# WebMCP challenge video plan

Target runtime: approximately 2:30, leaving margin under three minutes. Use only states and
interactions that have been verified in the release smoke. Do not show credentials or protected
document content unnecessarily.

## 0:00–0:20 — The problem

“WebMCP gives agents structured capabilities on the web. But discovering a capability does not
mean an agent should automatically be allowed to execute it.”

## 0:20–0:35 — The architecture

Show the page diagram: Agent → WebMCP → Moirae Console → The Fates → decision → host effect.
Explain that Fates governs and Moirae owns the resource/effect.

## 0:35–1:00 — Governed inspection

Use the actual `inspect_document` WebMCP tool. Show the exact request, Fates `ALLOW`, safe
evidence, and `DISCLOSED`. State that Fates authorized the operation but did not read the
document.

## 1:00–1:40 — Human approval

Use the actual `publish_document` WebMCP tool. Show `APPROVAL REQUIRED`, the fixed bounded
operation, and the human approval card. Approve it and show the fresh Fates authority, host
execution, and `PUBLISHED`.

## 1:40–2:05 — Authoritative deny

Run the fixed restricted-agent demonstration. Show the same publication operation, Fates
`DENIED`, and `NOT EXECUTED`. Point out zero source reads and zero publication invocations.

## 2:05–2:30 — Why it matters

“WebMCP exposes capability. The Fates determines authority. Moirae makes that boundary visible
to the human.” Show the two-tool discovery panel and the concise governance timeline.

If browser-level WebMCP execution has not been verified in the release environment, do not
present a fabricated agent interaction; use the exact reproducible manual steps instead.
