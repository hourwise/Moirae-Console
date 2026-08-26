# Deployment plan

This document prepares deployment; MC-07 does not deploy or change repository visibility.

## Runtime shape

Use a Node 22-compatible host process:

```text
Browser / WebMCP
    -> same-origin Moirae API
    -> trusted Console host runtime
    -> authenticated POST /api/execute on Ananke
```

The production host serves only the built static application and these bounded API routes:

- `POST /api/inspect-document`
- `POST /api/publish-document`
- `GET /api/publish-document/status`
- `POST /api/publish-document/approval`
- `POST /api/publish-document/deny-demo`
- `GET /healthz`

Unknown API paths, source directories, fixture paths, and publication-store paths are not
served. Responses from governed routes use `Cache-Control: no-store`.

## Build and start

```text
npm ci --no-audit --no-fund
npm run build
npm start
```

The host binds `PORT` (default `4173`) and `HOST` (default `0.0.0.0`). The health check is
`GET /healthz` and should return a bounded JSON status without credentials or protected content.

## Required configuration

Configure these values in the host secret/configuration store, never in browser code or URLs:

- `ANANKE_MOIRAE_EXECUTION_URL`
- the host-side execution credential required by the accepted Fates integration;
- approval and restricted-demo credentials when those scenarios are enabled;
- `MOIRAE_PUBLICATION_STORE_ROOT`, a private writable directory outside the static asset tree.

The host fails closed when the required authoritative transport configuration is absent. Exact
secret variable names and values are deployment-specific and must not be committed here.

## Operational boundary

Use TLS termination, a stable service identity, durable replay/approval state, monitored logs,
and a persistent publication store before treating this demonstration as production software.
The current implementation intentionally remains a bounded hackathon/reference host.

## Rollback

Stop the host, restore the previous reviewed application artifact and configuration, verify
`/healthz`, then run the smoke and bundle checks. Do not roll back by changing policy locally or
by reusing an old receipt. A new governed request is required after a failed or ambiguous effect.
