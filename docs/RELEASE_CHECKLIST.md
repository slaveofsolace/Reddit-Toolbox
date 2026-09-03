# RC1 Release Checklist

## Completed

- [x] Deterministic userscript build
- [x] Platform-neutral family core
- [x] Profile comments and posts scanner with cursor pagination
- [x] Reddit archive CSV import
- [x] Date, amount, type, order, subreddit, score, and text filters
- [x] Reviewed-plan digest and exact typed confirmation
- [x] Strict fullname parsing
- [x] Ownership verification before mutation
- [x] Random overwrite, saved-text verification, deletion, and final verification
- [x] Direct-delete opt-in for link and media posts
- [x] Sequential pacing, rate-limit handling, pause, and stop
- [x] No automatic resume after reload
- [x] Backup and run-log exports
- [x] 41-test automated suite and final userscript syntax/integrity check
- [x] Desktop and mobile-width static UI render smoke test

## Authenticated acceptance still required

Use a disposable Reddit account or disposable content. Preserve the network log only after removing cookies, modhashes, tokens, and account identifiers.

- [ ] Confirm session discovery on `www.reddit.com`
- [ ] Confirm session discovery on `old.reddit.com`
- [ ] Confirm current behavior on `new.reddit.com` and `sh.reddit.com`
- [ ] Scan one comment and one self-post
- [ ] Import current-format `comments.csv` and `posts.csv`
- [ ] Reject an archive item owned by another account before mutation
- [ ] Overwrite, verify, delete, and verify one disposable comment
- [ ] Overwrite, verify, delete, and verify one disposable self-post
- [ ] Confirm a link post is skipped by default
- [ ] Confirm direct deletion only after its option is included in a fresh plan
- [ ] Confirm a 429 response honors `Retry-After`
- [ ] Confirm a challenge, 401, or 403 pauses the run
- [ ] Confirm reloading the page cannot resume a run
- [ ] Confirm Stop prevents the next item from starting
- [ ] Decide whether the same-origin session adapter remains viable under Reddit's current OAuth requirements

## Stable release gate

Do not tag `v1.0.0` until the authenticated matrix passes and the supported authentication method is documented. Any OAuth implementation must use a registered application, least-privilege scopes, no embedded client secret, state validation, revocation support, and Reddit's current rules.
