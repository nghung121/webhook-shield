# Contributing

Thank you for improving webhook-shield.

## Local checks

```bash
npm ci
npm run check
npm test
npm run build
npm pack --dry-run
```

## Design rules

- Keep the default path secure and framework-agnostic.
- Treat all headers and payloads as attacker-controlled.
- Do not add network calls, telemetry, or runtime dependencies without an explicit design discussion.
- Document cryptographic formats, time units, storage assumptions, and failure behavior.
- Add behavioral tests for every public API change; include malformed and adversarial inputs for parsers.

## Pull requests

Keep pull requests focused, update the README for public API changes, and explain any security trade-off in the description.
