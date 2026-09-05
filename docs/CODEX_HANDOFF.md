# Codex handoff

RC5 addresses the owner's report of too many setup/confirmation steps, a fixed panel, and deletion verification trapping the batch. The product remains a userscript using the existing Reddit browser login. Do not reintroduce OAuth, client IDs, API keys, or a backend.

The user authorized committing to main, installing/updating software, and testing their own Reddit content. Use a concrete exact batch for any live destructive acceptance under the applicable tool policy. The previously confirmed RC4 two-comment batch is complete and must not be repeated.

## Current implementation

- Find matching items scans and prepares the review in one action. Filters rebuild it automatically; Delete N items is the single explicit batch authorization.
- More options holds secondary controls. Local archive import prepares a review, and Check login can bind it after signing in.
- Header/launcher dragging, both bottom resize corners, keyboard handles, saved geometry, viewport clamping, and reset layout.
- Sticky run controls and honest separate deleted, unconfirmed, and failed totals; completed items excluded from later selections in the same tab.
- Expanded deleted markers and accepted-and-absent verification; missing data alone is insufficient. One bounded retry for a verified acknowledged no-op. Lost deletion responses are never blindly resent.
- Unconfirmed rows continue the batch; read-only Recheck results revalidates the account and sends no POST.
- Existing account binding, ownership/editability checks, saved-text verification, pacing, Web Locks, and reload boundaries retained.

Build with npm ci and npm run check (83 tests). npm run test:browser runs the portable isolated Chromium/Firefox acceptance fixture; optional tooling instructions and scope are in [the release checklist](RELEASE_CHECKLIST.md). No user content or credentials belong in the repository or acceptance receipts.

## Live checkpoint

The old Reddit tab holding the reported stalled run could not be attached through CUA (Debugger unattached). A fresh Reddit diagnosis tab is accessible. Preserve the old tab until the owner finishes/stops the run; do not reload away its evidence. The specific failing comment has not yet been supplied. Synthetic recovery tests do not constitute a live reproduction of that exact case.

The owner completed the RC4 update and confirmed the exact two-comment live batch on 2026-09-05. The installed Chrome script scanned using the existing login, then one Run entire batch action completed both comments in 14 seconds: 2 deleted, 0 failed, 0 skipped. Both rows reported overwritten-and-deleted. Read-only network tracing observed edit → delete → edit → delete, with no duplicate mutation requests and HTTP 200 for all 24 cleanup responses. The completed batch has Run disabled; do not run it again. Local evidence is saved as work/rc4-live-completion.json in the project handoff folder.

The RC4 installation and two-comment live workflow are now verified. The earlier Chrome extension-manager rejection was specific to that manager action and must not be bypassed. No client ID is needed. Further live post or recovery cases would require their own exact target selection; the completed two-comment batch needs no further mutations.

Session requests are an unofficial website integration. The two-comment live result supplements the 73 Node tests and Chromium/Firefox fixtures. Self-post/direct-delete and live recovery cases remain unchecked in the release checklist; no broader live coverage or stable-release tag is implied.
