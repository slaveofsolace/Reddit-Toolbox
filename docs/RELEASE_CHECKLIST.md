# RC3 acceptance checklist

Development candidate, 2026-09-05. Source distribution and verified live acceptance are separate.

## Automated checks

- [x] 80 passing Node tests, including generated-userscript execution
- [x] Deterministic source composition, metadata/package/lockfile/runtime versions, syntax, no dynamic evaluation, SHA-256
- [x] One-confirmation automatic two-comment and mixed queues
- [x] Account-bound frozen targets; ownership/editability checks; direct-delete opt-in
- [x] Exact replacement verification and eventual-consistency retries
- [x] No blind resend after ambiguous edit/delete/redirect results
- [x] Pause/stop/retry, account changes, 401/403, rate-limit waits, failure guard
- [x] Web Locks required and canonical origin enforced; no reload authority reconstruction
- [x] Strict CSV IDs/headers, rejected/duplicate counts, yielding imports
- [x] Score/subreddit protection retains unknown archive values
- [x] OAuth scopes, exact endpoints, state/source/origin validation, renewal, account comparison, disconnect
- [x] Anonymous GM transport, rejected redirects, serialized pacing, rate-limit budgets, independent timeout watchdog
- [x] Tokens excluded from serialization; preference and run-log boundaries

## Rendered browser fixtures

The generated script runs in isolated Playwright browsers with all traffic intercepted. The default OAuth client is used, including a synthetic consent popup, callback, and code exchange. GM network APIs are simulated; Tampermonkey is not installed in these profiles. The Browser plugin is not available, so the frontend testing skill's Playwright path is used. These are synthetic fixture pages on the exact www.reddit.com origin.

| Flow | Chromium 151 | Firefox 153 |
| --- | --- | --- |
| Default connection → scan → review → confirm → automatic two-comment/mixed run | Pass | Pass |
| Second tab blocked; panel closed completion; navigation warning; settings lock | Pass | Pass |
| Reload clears connection and run authority; disconnect clears loaded history | Pass | Pass |
| 50,000 archive rows; responsive import; 100 visible rows per page | Pass | Pass |
| Paginated review; per-item exclusion resets confirmation | Pass | Pass |
| Local disconnected archive review; Run locked; full text expansion | Pass | Pass |
| Light 1440px; dark 390px; 320px containment; keyboard close/focus | Pass | Pass |
| Page identity, meaningful content, runtime overlay/console errors | Pass, none | Pass, none |

## Live acceptance still required

- [ ] Explicit Reddit API approval for this own-account cleanup use case
- [ ] Registered installed-app client ID and accepted exact callback redirect
- [ ] Real Reddit consent, renewal/revocation, signed-in identity and listing response shapes
- [ ] Script-driven automatic two-comment and self-post cleanup on exact owner-selected content
- [ ] Live mixed/direct-delete cases and verification of actual deletion read-back semantics
- [ ] Live account-change, ownership, uncertain-result, pause/stop and retry behavior
- [ ] Tampermonkey fresh installation in Chromium and Firefox
- [ ] Actual update-in-place from RC1 and RC2, including new network grants
- [ ] Main commit CI and served userscript/checksum verified after merge

No authenticated account test or deletion has been performed. The owner authorized their own content tests, but an approved client connection has not been supplied. Browser Use also previously rejected the Chrome extension-manager route and prohibited workarounds; that route was not retried. The code is a development candidate, without a stable-release or perfected-live-behavior claim.
