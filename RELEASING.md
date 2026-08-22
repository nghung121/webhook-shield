# Release checklist

This project is not ready to publish until its npm package ownership and GitHub repository URL are configured.

Before each release:

1. Verify the version and package name in `package.json`.
2. Run `npm ci && npm run check && npm test && npm run build && npm pack --dry-run`.
3. Review the tarball file list; it must not include tests, source maps with secrets, local config, or credentials.
4. Update the changelog and tag the release.
5. Publish through a protected GitHub Actions workflow using npm trusted publishing and provenance; do not store a long-lived npm token in the repository.
6. Verify the published package by installing it in a clean project and running the documented example.

For security fixes, coordinate disclosure according to [SECURITY.md](./SECURITY.md) before publishing details.
