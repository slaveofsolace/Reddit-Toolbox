# Changelog

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
