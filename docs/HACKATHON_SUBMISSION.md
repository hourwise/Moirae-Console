# Hackathon submission

This is submission material for the bounded MC-16 candidate. It is not
submitted automatically.

## Candidate checkpoint

The exact compatibility set for the reviewed candidate is:

```text
Moirae Console @ 8c5109c52bb8065d9c1b4f4a81e0e6df9e830030
Project Ananke @ 3d76adb162a0ff07b5630700ae30a823f1419cb4
Project-Adrasteia / Runtime Contracts 0.6.2 @ a1c01bf9e6f9d6a126cfdcc1acfacd488b214210
```

The final adversarial review result is **PASS WITH LIMITATIONS**. The Console
implementation is the presentation/UI successor to the MC-14 remediation;
the provenance-only seal commit, if present, is reported separately from the
reviewed implementation checkpoint.

## Judge testing instructions

The following text can be copied into the official hackathon/Devpost testing-instructions field:

```text
JUDGE TESTING INSTRUCTIONS

Open the live Moirae Console URL.

1. Ask the agent to inspect the demonstration policy document.

Expected:
ALLOW -> DISCLOSED

2. Ask the agent to publish the demonstration policy document.

Expected initial result:
REQUIRES_APPROVAL -> NOT PUBLISHED

A human approval card will appear.

Judge approval password:
<JUDGE PASSWORD ENTERED PRIVATELY HERE>

Enter the supplied judge password and approve.

Expected:
APPROVED -> PUBLISHED

If the fixed demonstration document has already been published by an earlier judge,
the final host state may report ALREADY_PUBLISHED. This is expected idempotent
behaviour and does not indicate a failed approval.

3. Run the visible restricted-agent demonstration.

Expected:
DENY -> NOT EXECUTED

The supplied judge password is only the human demonstration step-up proof.

Fates/Ananke service credentials remain server-side and are never provided to judges.
```

## Private judge credential provisioning

Deployment-only procedure; no deployment or secret generation is performed by this repository:

1. Generate a new random secret in the deployment platform's secret manager, dedicated only to
   this hackathon demonstration.
2. Install it as the Console host environment variable
   `MOIRAE_OPERATOR_STEP_UP_SECRET=<judge-only-hackathon-secret>`.
3. Do not reuse development, Ananke, personal-account, or any other credential. Do not commit it,
   place it in documentation, or expose it to browser assets.
4. Provide the value to judges only through the official private submission credential/testing
   instructions mechanism.

The Ananke host continues to receive distinct private values for
`ANANKE_MOIRAE_EXECUTION_TOKEN`, `ANANKE_MOIRAE_PUBLISH_TOKEN`,
`ANANKE_MOIRAE_APPROVER_TOKEN`, and `ANANKE_MOIRAE_RESTRICTED_TOKEN`. Judges receive none of
these service credentials.

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
