# Release checklist

RC2 follow-up, unreleased. Local evidence was refreshed on 2026-09-03.

## Local verification

- [x] `npm ci` and `npm run check`: 70 passing tests
- [x] Deterministic source-order composition, matching package/metadata version, syntax, dynamic-evaluation rejection, and SHA-256 integrity
- [x] Generated-script automatic two-comment and mixed queues
- [x] Account-bound review and account changes before the next mutation
- [x] Ownership and live editability checks; direct-delete opt-in
- [x] Exact saved replacement before deletion; eventual-consistency read retries
- [x] Ambiguous edit/delete and lost response-body protection
- [x] 401/403 attention, 429 Retry-After waits, bounded transient retries/timeouts
- [x] Pause at mutation boundaries, in-flight settlement, stop, and retry construction
- [x] Five-consecutive-failure guard and isolated failure continuation
- [x] No-lock failure, same-origin two-tab exclusion, and canonical-origin mutation restriction
- [x] No default unapproved live connection; no authority reconstruction after reload
- [x] Chunked CSV import, strict headers/IDs, deduplication, rejected-row counts, and bounded previews
- [x] Preferences exclude active authority; exported run logs omit content/account identifiers

## Rendered fixture acceptance

The generated script ran in isolated Playwright profiles. Every network request was intercepted with synthetic data. This table does not claim Tampermonkey or authenticated Reddit acceptance.

| Check | Chromium 151.0.7922.34 | Firefox 153.0 |
| --- | --- | --- |
| One confirmation, automatic two-comment and mixed batch | Pass | Pass |
| Closed-panel run and persistent completion launcher | Pass | Pass |
| Second tab refused without mutations | Pass | Pass |
| Navigation warning, settings lock, no reload resume | Pass | Pass |
| Keyboard close/focus; light/dark; 390px and 320px layouts | Pass | Pass |
| 50,000-row archive; 100 rendered rows; UI timer advances | Pass | Pass |
| Relevant console errors | None | None |

## External gates still required

- [ ] Explicit Reddit API approval for this use case
- [ ] Registered public OAuth client and approved redirect/flow
- [ ] OAuth consent/state/expiry/revocation and current-tab account binding accepted
- [ ] Authenticated identity and listing response shapes accepted
- [ ] Actual behavior on `www`, `old`, `new`, and `sh` surfaces documented; only the canonical origin may mutate
- [ ] One exact owner-approved disposable two-comment batch automatically overwrites and deletes both
- [ ] Approved two-self-post, mixed, and explicitly direct-deleted disposable cases
- [ ] Live ownership, account-change, ambiguous response, pause/stop, and retry acceptance
- [ ] Tampermonkey fresh install in Chromium and Firefox
- [ ] Tampermonkey update-in-place from RC1 and RC2 to the next released version
- [ ] Exact-head CI passes on the merge/release head
- [ ] Published userscript/checksum and install/update URLs verified for that release

No new tag or release is justified until these gates are resolved. Local mocks do not prove platform approval, authentication, actual Reddit mutation semantics, or extension sandbox behavior.
