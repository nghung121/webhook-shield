# Security policy

## Supported versions

Until `1.0`, only the latest published minor version receives security fixes.

## Reporting a vulnerability

Do not report suspected vulnerabilities in a public issue. Email the maintainers listed in the published package metadata with:

- a concise description and impact;
- a minimal reproduction;
- affected versions; and
- any suggested mitigation.

We will acknowledge reports within seven days and coordinate a fix and disclosure timeline with the reporter.

## Scope

This package verifies HMAC-SHA256 signatures over a raw payload and timestamp. It cannot make an application idempotent, secure an endpoint's network exposure, or validate a provider's business payload.
