# RC2 Release Checklist

## Completed

- [x] Deterministic userscript build
- [x] Platform-neutral Toolbox Family core
- [x] Profile comments and posts scanner with cursor pagination
- [x] Reddit archive CSV import
- [x] Date, amount, type, order, subreddit, score, and text filters
- [x] Reviewed-plan digest and one exact confirmation for the complete batch
- [x] Automated full-queue execution with no per-item interaction
- [x] Whole-batch state, progress, current phase, and panel-closed launcher status
- [x] Active-account revalidation before every item
- [x] Ownership verification before mutation
- [x] Random overwrite, saved-text verification, deletion, and final verification
- [x] Direct-delete opt-in for link and media posts
- [x] Automatic rate-limit waits and temporary-failure retries
- [x] Isolated-failure continuation and consecutive-failure attention guard
- [x] Pause, stop-after-current-item, and one-action retry-batch preparation
- [x] Cross-tab exclusive run lock where Web Locks is available
- [x] Navigation warning during an active batch
- [x] No automatic resume after reload
- [x] Backup and run-log exports
- [x] Automated tests and final userscript syntax/integrity check

## Authenticated acceptance still required

Use a disposable Reddit account or disposable content. Preserve a network log only after removing cookies, modhashes, tokens, and account identifiers.

- [ ] Confirm session discovery on `www.reddit.com`
- [ ] Confirm session discovery on `old.reddit.com`
- [ ] Confirm current behavior on `new.reddit.com` and `sh.reddit.com`
- [ ] Scan one comment and one self-post
- [ ] Import current-format `comments.csv` and `posts.csv`
- [ ] Confirm one typed approval starts a multi-item batch without further interaction
- [ ] Close and reopen the panel during a running batch without interrupting it
- [ ] Confirm account switching pauses before the next mutation
- [ ] Reject an archive item owned by another account before mutation
- [ ] Overwrite, verify, delete, and verify multiple disposable comments automatically
- [ ] Overwrite, verify, delete, and verify a disposable self-post
- [ ] Confirm a link post is skipped by default
- [ ] Confirm direct deletion only after its option is included in a fresh batch
- [ ] Confirm a 429 response honors `Retry-After` and resumes automatically
- [ ] Confirm a temporary 5xx before mutation retries with bounded backoff
- [ ] Confirm an isolated permanent failure advances to the next item
- [ ] Confirm five consecutive failures pause the batch
- [ ] Confirm a challenge, 401, 403, or uncertain delete pauses the batch
- [ ] Confirm Stop prevents another item from starting
- [ ] Confirm retry-batch preparation includes only failed and stopped items
- [ ] Confirm two Reddit tabs cannot run concurrent batches in supported browsers
- [ ] Confirm reloading the page cannot resume a run
- [ ] Decide whether the same-origin session adapter remains viable under Reddit's current OAuth requirements

## Stable release gate

Do not tag `v1.0.0` until the authenticated matrix passes and the supported authentication method is documented. Any OAuth implementation must use a registered application, least-privilege scopes, no embedded client secret, state validation, revocation support, and Reddit's current rules.
