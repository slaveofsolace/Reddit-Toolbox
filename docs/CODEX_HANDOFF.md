# Codex handoff

RC4 corrects RC3's connection model: the user explicitly means install-and-run against the existing Reddit browser login, with no OAuth, app registration, client ID, or API key. The production UI now constructs RedditSessionClient directly. Do not restore OAuth as a prerequisite.

The product remains one Tampermonkey userscript. The user explicitly authorized committing the implementation to main and testing deletion of their own Reddit content. Use a small exact batch for live acceptance and verify the script's own flow.

## Current implementation

- Same-origin session identity, history, edits, deletion, and verification; action token in memory; no cross-origin GM network grants.
- Optional login status check and clear-history controls. Failed identity checks invalidate review; account changes require fresh history.
- Signed-out local archive review; signing in and preparing again binds the selection to the current account.
- Paginated review, full text, per-item exclusion, and confirmation reset after changes.
- Frozen account-bound targets; sequential overwrite, exact read-back, deletion, and verification; uncertainty retained across same-tab retries.
- Canonical www.reddit.com execution with mandatory Web Locks, pause/stop, bounded retry/cooldown, and closed-panel progress.
- Unknown archive fields are protected when a corresponding keep filter is active.

Build with npm ci and npm run check. Generated script, metadata/package/lockfile/runtime version, and SHA-256 must agree. See [acceptance evidence](RELEASE_CHECKLIST.md).

## Live acceptance

Implementation e931e72 is committed and pushed to main. Both main workflows passed; the served userscript and checksum match the tested RC4 artifact. Local Node and Chromium/Firefox fixture evidence is recorded in the release checklist.

The owner completed the RC4 update and confirmed the exact two-comment live batch on 2026-09-05. The installed Chrome script scanned using the existing login, then one Run entire batch action completed both comments in 14 seconds: 2 deleted, 0 failed, 0 skipped. Both rows reported overwritten-and-deleted. Read-only network tracing observed edit → delete → edit → delete, with no duplicate mutation requests and HTTP 200 for all 24 cleanup responses. The completed batch has Run disabled; do not run it again. Local evidence is saved as work/rc4-live-completion.json in the project handoff folder.

The RC4 installation and two-comment live workflow are now verified. The earlier Chrome extension-manager rejection was specific to that manager action and must not be bypassed. No client ID is needed. Further live post or recovery cases would require their own exact target selection; the completed two-comment batch needs no further mutations.

Session requests are an unofficial website integration. The two-comment live result supplements the 73 Node tests and Chromium/Firefox fixtures. Self-post/direct-delete and live recovery cases remain unchecked in the release checklist; no broader live coverage or stable-release tag is implied.
