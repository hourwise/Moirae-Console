# Hackathon submission draft

This is draft material only. It is not submitted automatically.

## Project description

WebMCP lets a website expose structured capabilities to an AI agent. Moirae Console makes the
next boundary visible: discovering a capability is not the same as being authorized to use it.
The Console routes two fixed demonstration operations through The Fates before any disclosure or
publication effect occurs. Judges can see an authoritative `ALLOW`, a human approval transition,
and an authoritative `DENY` that produces zero host effect.

## WebMCP fit

The page registers exactly two tools through `document.modelContext.registerTool(...)`:
`inspect_document` and `publish_document`. Both accept only the fixed document identifier.
Action names, credentials, expected digest, destination, purpose, policy, and approval state are
host-controlled. Human approval is a Moirae UI action, not a third WebMCP tool.

## Human-agent experience

An agent discovers a useful operation. The human sees the request, the Fates decision, the
provenance, and the eventual host effect. Inspection demonstrates governed disclosure;
publication demonstrates approval; the restricted-agent scenario demonstrates that the same
operation can be denied without reading or publishing the document.

## Implementation

Moirae owns the fixed application resource and effect. Ananke owns the authenticated Fates
governance boundary. The Console validates exact action/resource/digest/purpose evidence, then
performs the bounded host effect only when the authoritative result permits it.

## Technologies

React, TypeScript, Vite for development/build, Node's built-in HTTP server for the production
host boundary, WebMCP's imperative registration API, and the accepted Ananke/Fates runtime.

## Challenges and accomplishments

The central challenge was keeping browser capability discovery separate from authority and
keeping protected data out of browser assets. The result is a small end-to-end demonstration of
allow, approval, deny, immutable request binding, same-byte digest checks, bounded atomic
publication, and a host boundary that fails closed when authoritative configuration is absent.

## What was learned and what is next

Governance must happen before disclosure or mutation, and UI state must remain an observation of
backend evidence. A production follow-up would add deployment-grade identity, durable state,
signed receipts, monitoring, and recovery guarantees after separate security review.

Do not describe this reference implementation as production-ready or as a guarantee of safe AI.
