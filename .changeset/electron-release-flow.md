---
"@chatjs/electron": minor
---

Add a PR-driven desktop release flow for the Electron app. Desktop releases now follow the same Changesets version-bump pattern as the CLI: merge the generated version PR, then publish macOS and Windows installers to GitHub Releases using stable download asset names for the site.
