# Codex handoff

## Current checkpoint: RC6 live acceptance complete

RC6 implementation b8f73f239330bf666850e4360c6d08f6d6923b25 is committed and pushed to main. CI and Build userscript passed. The public userscript and checksum match the local 149,057-byte artifact, SHA-256 dbf423695ab736feda82f7c6aa39390de5f5b92c62a76e61c1e254a10f131645. The owner completed the Tampermonkey update, and a fresh Chrome Reddit tab displayed RC6.

Chrome background control reproduced the owner's actual RC5 failure. Six comments from their user-started 300-comment batch were reported unconfirmed even though deletion succeeded. An observed delete returned HTTP 200 {}, followed by exact-target info containing author [deleted] / body [removed]. Repeated unsuccessful verification exhausted the request allowance. The rate-limit response supplied x-ratelimit-reset without Retry-After. RC6 recognizes that specific transition only after verified ownership and an acknowledged deletion, respects the actual reset deadline, and handles start/resume validation through the runner's automatic recovery.

The installed RC6 No limit control selected all 362 available comments and hid the numeric field. Set a limit with 2 automatically rebuilt the review to the next two untouched comments from the owner's original batch. One Delete 2 items action completed both in approximately eight seconds: 2 deleted, 0 needing recheck, 0 failed, 0 skipped. Both rows displayed Deleted, and completed Delete/Pause/Stop controls were disabled. All 24 cleanup responses returned HTTP 200, with exactly edit → delete → edit → delete. Both final responses exercised the observed [deleted] author / [removed] body shape. Each native Reddit comment page independently showed Comment deleted by user and author [deleted].

The original RC5 tab remains stopped at six processed and 294 stopped rows. Two of those targets were subsequently deleted by the RC6 acceptance batch; 292 other untouched targets were not run. Preserve the old checkpoint and the successful RC6 tab. Do not rerun completed targets. Local sanitized evidence is saved as work/rc6-live-diagnosis.json, work/rc6-live-completion.json, and work/rc6-distribution.json in the project handoff folder. No account or target identifiers, original text, full request headers, or session values belong in the repository or receipts.

## Product behavior

- Userscript first with the existing Reddit browser login. No OAuth, client IDs, API keys, or backend.
- Find matching items scans and prepares the review in one action. Filters rebuild it automatically; Delete N items starts the reviewed batch.
- Explicit No limit and Set a limit choices. No limit processes all discovered matching items; it does not promise access beyond Reddit's listing limits.
- More options holds secondary controls. Local archive import prepares a review, and Check login can bind it after signing in.
- Header/launcher dragging, both bottom resize corners, keyboard handles, saved geometry, viewport clamping, and reset layout.
- Sticky controls with separate deleted, unconfirmed, and failed totals. Completed items are excluded from later selections in the same tab.
- Verified deletion markers and acknowledged repeated absence; moderation removal alone and missing data alone are insufficient. One bounded retry for an acknowledged no-op; no blind resend after a lost deletion response.
- Unconfirmed rows continue the batch. Read-only Recheck results revalidates the account, waits through rate limits, and supports Cancel recheck without sending another POST or losing stopped targets.
- Account binding, mutation-boundary ownership/editability checks, saved-text verification, pacing, Web Locks, and reload boundaries remain in place.

## Validation and remaining coverage

Build with npm ci and npm run check: 89 Node tests pass, with deterministic composition, matching versions, syntax, and SHA-256 checks. npm run test:browser runs the portable isolated Chromium/Firefox fixture; both passed. Optional tooling instructions and coverage are in [the release checklist](RELEASE_CHECKLIST.md). Synthetic fixtures include the live response shape, rate-limit recovery, recheck cancellation, resizing, persistence, keyboard controls, cross-tab locking, and large archive review.

Installed Chrome comment deletion and No limit are verified live. Live self-post/link/media deletion, live interruption/recovery, and fresh Firefox installation are not claimed. Website session behavior can change independently of this version. No stable-release tag is implied.

## Authorization and browser boundaries

The owner authorized committing to main, installs/updates, and live testing on their own Reddit content. The RC6 test used an exact two-comment subset of the 300-comment scope they had already selected and started. Previously completed RC4 and RC6 acceptance targets must not be repeated.

Chrome automation uses CUA background control. Its URL policy rejected the Tampermonkey extension update page; the owner completed Update manually. That restriction must not be bypassed using another tool, raw CDP, shell commands, or extension-manager changes. Isolated browser fixtures use synthetic traffic and never attach to the owner's profile.
