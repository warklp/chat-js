---
"@chatjs/electron": patch
"@chat-js/cli": patch
"@chat-js/registry": patch
---

Unify package releases around Changesets by removing the dedicated registry
deploy workflow and switching the CLI's default registry source to the
published `@chat-js/registry` package on npm.
