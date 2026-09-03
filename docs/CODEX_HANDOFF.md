# Codex handoff

## Checkpoint

This is an unreleased RC2 acceptance follow-up, not a stable release. The baseline was clean `main` at `1fdf36a94217e0eed233c6b3c903b74de79f80de`, version `1.0.0-rc.2`. Its 54 tests passed and the rebuilt script matched committed bytes and checksum.

The current source has 70 passing tests, including integration tests against the generated userscript. The existing core, Reddit adapter/removal service, and UI boundaries are preserved. No outside product code or assets were imported.

Run:

```sh
npm ci
npm run check
```

The build now regenerates both the userscript and its checksum; CI checks both for drift.

## Implemented fixes

- Review binds the username, ordered targets, types/editability, and destructive settings. Runtime target snapshots are frozen.
- Account, ownership, and saved replacement are checked at mutation boundaries. Pause waits before the next mutation while in-flight outcomes settle.
- Ambiguous edits and deletes are read back without blind resends. Their state survives fresh reviews for the life of the tab.
- Missing or malformed listings and mismatched targets cannot prove deletion. Live editability must match review.
- Cross-tab exclusion fails closed without Web Locks. Mutations use only the canonical `www.reddit.com` origin, because Web Locks are origin-scoped.
- Archive parsing yields to the page, validates explicit IDs and headers, and reports invalid/duplicate rows. The preview is limited to 100 DOM rows.
- Advanced controls and logs are collapsed, coverage is disclosed during review, completion remains on the launcher, and exported run logs omit content/account identifiers.

## Verified locally

Both isolated Chromium 151.0.7922.34 and Firefox 153.0 passed the generated-script UI flow: two comments, a mixed comment/self-post/direct-delete queue, one confirmation, automatic advancement, panel closure, second-tab exclusion, active navigation warning, locked settings, no reload resume, keyboard focus, and 390/320-pixel layouts. All network responses were synthetic. A 50,000-row archive imported and prepared without losing UI timer activity and rendered only 100 item rows. No relevant console errors were observed.

This was Playwright browser execution, not a Tampermonkey extension installation and not authenticated Reddit acceptance.

The browser security policy rejected opening Chrome's extension manager and explicitly prohibited indirect workarounds. Actual extension installation/update testing needs an allowed browser route or owner-performed acceptance; do not infer it from the fixture runs.

## Current blocker and next action

Reddit's current primary documentation requires explicit API approval and registered OAuth authentication. The provisional session/modhash adapter is therefore disabled by default in the UI. Archive import remains local and available; live scanning and cleanup cannot start. Details and sources are in [API access](API_ACCESS.md).

Obtain the maintainer's approval status for this use case, public/installed client ID, and registered redirect URI. Do not request secrets or copy cookies. Implement and accept the approved OAuth flow behind the current adapter contract, including current-tab account binding. Do not create a speculative private-client or credential-backend workaround.

Then obtain one exact small disposable-batch approval, beginning with two comments. Do not delete account history or create disposable public content without the corresponding owner approval. Continue through the unchecked items in [Release Checklist](RELEASE_CHECKLIST.md).

## Release boundary

Do not bump or publish another RC or stable tag on the strength of mocks. Preserve earlier releases and the published RC2 until approved authentication, real browser/Tampermonkey acceptance, and update-in-place from RC1/RC2 are complete. The source follow-up remains reviewable independently of those external gates.
