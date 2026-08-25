# Contributing to Moirae Console

Thank you for helping build a careful governance surface for The Fates.

## Before changing code

Keep changes bounded to the requested slice. Read the relevant architecture and threat
model documents first. Do not copy source, evidence, credentials, model files, or private
history from an upstream Fates repository into this repository.

Every governed operation must cross the explicit Fates client boundary. WebMCP capability
discovery is not authorization, and frontend state must never be used as authority.

## Local checks

Use a current Node.js release supported by `package.json`, then run:

```shell
npm ci
npm run typecheck
npm run lint
npm run format
npm test
npm run build
npm audit --omit=optional
```

Do not commit `.env` files, generated output, raw evidence, model artifacts, credentials,
or local absolute paths. Keep the lockfile in sync with `package.json`.

## Pull requests

Explain the security boundary affected by the change, the tests added or updated, and any
remaining limitations. Do not describe a synthetic test provider as real Fates authority.
Avoid unrelated formatting or dependency upgrades.
