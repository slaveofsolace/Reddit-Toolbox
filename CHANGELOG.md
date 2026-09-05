# Changelog

## 1.0.0-rc.7 — 2026-09-05

- Pace every request automatically, including scans, account checks, overwrite/deletion requests, and verification reads. The fixed 7.5-second minimum interval leaves headroom below the historical non-OAuth allowance; low remaining budgets slow the tool further before exhaustion.
- Share request slots across same-origin toolbox tabs and retain anonymous timing deadlines across reloads. Honor HTTP and JSON cooldowns without sending early probes.
- Remove the between-item speed controls and ignore previously saved speed preferences. Show automatic pacing and cooldown countdowns.
- Preserve request timeouts after admission, pause checkpoints, recheck cancellation, account binding, and verified deletion behavior. Add scheduler and settings-migration regressions; 99 Node tests pass.

## 1.0.0-rc.6 — 2026-09-05

- Fix the reproduced live verification failure: Reddit returns an author of [deleted] with a body of [removed] for some successfully deleted comments. Confirm this transition only after an acknowledged deletion and verified ownership; moderation removal alone remains insufficient.
- Use Reddit's x-ratelimit-reset value when Retry-After is absent. Stop sending requests when a successful response exhausts the allowance, and let the runner show the correct automatic countdown.
- Move initial/resume identity validation into the runner's existing checked mutation path so rate limits recover automatically instead of leaving Resume blocked. Preserve account, ownership, and overwrite checks.
- Add cancellable read-only rechecks with cooldown countdowns, and preserve stopped targets and accurate totals after rechecking.
- Add explicit No limit and Set a limit choices, hiding the number field when No limit is selected. No limit applies to all discovered matches and does not promise lifetime listing completeness.
- Add regressions from the observed response shape, request-budget exhaustion, automatic initial-identity recovery, and the No limit interaction.

## 1.0.0-rc.5 — 2026-09-05

- Collapse scanning and preparation into Find matching items, automatically rebuild filtered reviews, and use one explicit Delete button without a typed phrase. Move less-used settings into More options.
- Add draggable header and launcher, two resize handles, keyboard movement/resizing, saved geometry, viewport clamping, and reset layout. Keep progress and run controls visible while history scrolls.
- Expand deletion verification for null-author and deleted-category tombstones, plus acknowledged deletions followed by repeated valid absent-item reads. Preserve rejection of moderation removal, malformed listings, and missing data alone.
- Allow more read-back time and retry an acknowledged no-op once after fresh ownership, account, editability, and replacement verification. Never blindly resend a lost deletion response.
- Mark unresolved deletion results separately, continue other items, and offer read-only rechecks. Exclude completed items from later selections and correct launcher status for unconfirmed results.
- Reject explicit Reddit error envelopes even when HTTP status is 200. Add deletion recovery and window geometry regressions.

## 1.0.0-rc.4 — 2026-09-05

- Make the existing Reddit browser session the default and only production connection. Scan and run without app registration, OAuth, a client ID, or an API key.
- Remove the OAuth adapter, popup, token exchange, client settings, and cross-origin userscript network grants. Remove obsolete saved client IDs during upgrade.
- Add optional login status and clear-history controls. Invalidate review on failed login checks and require fresh history when the account changes.
- Clear cached session action credentials when identity refresh fails; retain account binding, ownership checks, overwrite/read-back/delete verification, Web Locks, pacing, and uncertainty handling.
- Preserve local signed-out archive review and all RC3 selection improvements. Refresh installation and privacy documentation around the session-first flow.

## 1.0.0-rc.3 — 2026-09-05

Development candidate; authenticated Reddit and Tampermonkey acceptance remain pending.

- Implement userscript-only installed-app OAuth connection, state/source validation, token renewal, current-page identity binding, and disconnect. Tokens remain in memory.
- Add cookie-free narrowly scoped requests, request pacing, response-budget cooldowns, and an independent timeout watchdog.
- Make all selected items reviewable through pagination, with per-item exclusion that resets confirmation.
- Support disconnected local archive review without enabling destructive controls.
- Preserve archive items with unknown fields when score/subreddit protection is active.

- Bind review to the account as well as exact ordered targets and destructive settings; freeze the selected targets during execution.
- Pause before the next mutation after settling the active operation, with account, ownership, and replacement checks before deletion.
- Preserve uncertain mutation state across new reviews in the same tab. Missing listings, mismatched targets, malformed responses, and moderation removal do not prove deletion.
- Require a cross-tab Web Lock and one canonical mutation origin; block execution when exclusion cannot be established.
- Parse large archives incrementally, validate their headers and explicit IDs, report rejected/duplicate rows, and keep preview rendering bounded.
- Collapse Advanced controls, retain launcher completion, correct coverage disclosure, and sanitize exported run logs.
- Add generated-script and Chromium/Firefox fixture regressions; generate and verify checksums with the deterministic build.
- Keep the provisional session adapter out of the production mutation path. No authenticated acceptance is claimed.

## 1.0.0-rc.2 — 2026-09-03

- Reworked cleanup into a one-confirmation automated batch, matching the hands-off behavior of Insta Toolbox DM Unsend.
- Added explicit batch states, whole-run progress, current-phase reporting, and a compact launcher status while the panel is closed.
- Added automatic rate-limit waits and temporary-failure retries without further user input.
- Added isolated-failure continuation with a five-consecutive-failure attention guard.
- Added stop-after-current-item behavior and one-action retry-batch preparation for failed or stopped items.
- Added active-account revalidation before each item and an exclusive browser run lock.
- Added a navigation warning while a batch is active.
- Fixed the userscript support URL and expanded automated coverage for the batch flow.

## 1.0.0-rc.1 — 2026-09-03

- Extracted the platform-neutral Toolbox Family core.
- Added Reddit profile discovery and data-export CSV import.
- Added content, date, amount, order, subreddit, score, and text filters.
- Added reviewed plans with exact confirmation and mutation detection.
- Added ownership verification and overwrite-before-delete handling.
- Added deletion verification and ambiguous edit/delete result protection.
- Added sequential pacing, rate-limit handling, pause, stop, backup, and run-log export.
- Added responsive Tampermonkey UI, deterministic builds, CI, and automated tests.
