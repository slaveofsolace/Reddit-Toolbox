# Contributing

Use Node.js 20 or newer and run:

```sh
npm run check
```

Keep platform-neutral logic in `src/core` and Reddit-specific behavior in `src/reddit`. Add tests for every target-selection or destructive-state change. Never commit credentials, account exports, live user content, or sanitized-looking fixtures derived from private data.

Changes to mutation behavior must preserve exact ownership checks, reviewed-plan binding, sequential execution, verification, stop handling, and no automatic resume.
