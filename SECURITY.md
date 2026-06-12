# Security Policy

## Reporting a vulnerability

Please report security issues privately — **do not open a public GitHub issue.**

Email **security@unisonlabs.ai** with:

- a description of the issue and its impact,
- steps to reproduce (a proof-of-concept if you have one),
- any suggested remediation.

We aim to acknowledge within 3 business days and to keep you updated as we
investigate. We'll credit reporters who want it once a fix ships.

## Scope

This repository is the **opencode-unison plugin** — an OpenCode plugin that connects
to the Unison brain API. It holds no secrets and is not a security boundary — all
authentication, authorization, tenant isolation, and rate limiting are enforced
**server-side** by the Unison brain API. Reports about the plugin are most useful
when they concern:

- credential handling on disk (`~/.unison-opencode/credentials.json`),
- the browser loopback auth flow as implemented client-side,
- the headless OTP flow,
- dependency or supply-chain risks.

Server-side or account issues should also go to the same address.

## Handling of credentials

The plugin stores a bearer token (`usk_live_...`) in
`~/.unison-opencode/credentials.json` with `0600` permissions, or reads it from
the `UNISON_TOKEN` environment variable. The token is never logged or transmitted
anywhere except the configured API host (`UNISON_BASE_URL`, default
`https://brain.unisonlabs.ai`).

Content wrapped in `<private>...</private>` tags is stripped before any data is
sent to the brain.
