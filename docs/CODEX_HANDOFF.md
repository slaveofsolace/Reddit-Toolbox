# Codex handoff

RC3 implements the user's userscript-first direction. The product remains one Tampermonkey installation with the extracted platform-neutral core. No backend, companion application, runtime dependency, or external scaffold code was added.

Implementation commit cfacf80 was merged to main as 55e843b through PR #1. Both main workflows passed and the public install script/checksum matched the tested build. The subsequent closeout changes documentation only; see [verification receipt](RELEASE_CHECKLIST.md).

## Current implementation

- Default userscript OAuth connection for approved installed-app client IDs; in-memory tokens, popup state/source checks, renewal, disconnect, and current-page account comparison.
- Disconnected local archive import/review; connection and fresh account-bound review are required before Run can be enabled.
- Full paginated review, optional per-item exclusion, and reset confirmation after selection changes.
- Account-bound immutable target snapshots; sequential overwrite, exact read-back, delete, and verification; preserved uncertainty across same-tab retries.
- Canonical www.reddit.com execution with mandatory Web Locks, pause/stop, automatic retry/cooldown, and closed-panel progress.
- Protection for archive items with unknown scores/subreddits when the corresponding keep filter is active.
- Restricted anonymous GM network transport, response-budget pacing, and independent deadline watchdog.

Build with npm ci and npm run check. Generated script, metadata/package/lockfile version, and SHA-256 must agree. The release checklist separates synthetic browser evidence from authenticated Reddit and extension evidence.

## External acceptance still pending

No approved client ID was supplied during this implementation. Approval of this own-account use case, the registered redirect, real consent, live identity/listing/deletion response shapes, and long-lived token behavior require acceptance with the actual registered app. See [API access](API_ACCESS.md).

The owner authorized testing and deletion of their own Reddit content on 2026-09-05. No live content was scanned, edited, created, or deleted in this pass. When a working authorized connection is available, prepare a small exact batch and observe the full script-driven flow. Deleting directly through another interface would not test this script.

Browser Use previously rejected opening Chrome's extension manager and explicitly prohibited workarounds. That action was not retried. Fixture tests in isolated Playwright browsers do not prove Tampermonkey fresh install, update-in-place, extension sandbox messaging, or granted network permissions. Actual extension acceptance needs an allowed route or owner-performed installation.

The user explicitly requested committing completed implementation to main. RC3 source distribution is a development candidate; no stable tag, production acceptance, platform approval, or perfected live cleanup is claimed. Continue through [Release Checklist](RELEASE_CHECKLIST.md) before declaring release acceptance.
