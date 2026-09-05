# RC6 acceptance checklist

Userscript first, 2026-09-05. Existing Reddit login; no OAuth, app registration, client ID, or API key.

## Automated checks

- [x] 89 Node tests; deterministic composition, matching versions, syntax, and SHA-256 checks
- [x] Account-bound frozen targets, mutation-boundary ownership/editability and saved-text checks
- [x] Explicit deleted markers and acknowledged deletions followed by repeated valid absent reads
- [x] Missing data alone, mismatched IDs, malformed listings, and moderation removal rejected as deletion evidence
- [x] One bounded retry for an acknowledged no-op; no blind resend for a lost response
- [x] Unconfirmed rows continue the batch, stay separate from deleted counts, and have read-only rechecks
- [x] Login revalidation before rechecking results; HTTP 200 rejection envelopes handled as errors
- [x] Web Locks, rate limits, pause/stop, failure guard, no destructive restoration on reload
- [x] Original archive, filtering, review, privacy, and generated-script regression coverage

## Browser acceptance

Run the generated userscript in isolated Chromium and Firefox using **npm run test:browser**. All traffic is intercepted and all content is synthetic. The fixture uses the production session adapter and runner. It shortens verification delays only for the uncertain/no-op cases and uses a one-second between-item preference. This proves the tested application behavior, not live Reddit compatibility or extension installation.

For local development, install optional test tooling with **npm install --no-save --package-lock=false playwright**, then **npx playwright install chromium firefox**. The script also accepts REDDIT_TOOLBOX_PLAYWRIGHT_MODULE for an existing installation and REDDIT_TOOLBOX_BROWSER_OUTPUT for an evidence directory. Screenshots/results default to ignored artifacts/browser.

| Flow | Chromium | Firefox |
| --- | --- | --- |
| Find → automatic review → one Delete action; two comments and mixed content | Pass | Pass |
| Deleted-author/removed-body live response, null author, accepted-and-absent deletion | Pass | Pass |
| Explicit No limit and Set a limit choices | Pass | Pass |
| Initial identity rate limit automatically recovers inside the runner | Pass | Pass |
| Lost response marks one item unconfirmed and continues the next | Pass | Pass |
| Read-only recheck, cooldown recovery and cancellation without another POST | Pass | Pass |
| Acknowledged no-op retried once after fresh checks | Pass | Pass |
| Header and launcher dragging, both resize corners, keyboard controls | Pass | Pass |
| Persisted geometry, reset, narrow viewport clamping, compact footer access | Pass | Pass |
| Filter updates and Keep immediately update the Delete count | Pass | Pass |
| Cross-tab lock, closed-panel run, unload warning, settings lock, reload | Pass | Pass |
| Account change/logout invalidation, local signed-out archive review | Pass | Pass |
| 50,000-row responsive import, 100 rendered rows/page, pagination | Pass | Pass |
| Light desktop/dark narrow rendering and keyboard focus | Pass | Pass |
| Unexpected console/runtime errors | None | None |

Local evidence is retained under work/browser-rc6 in the project handoff folder. The test's simulated lost response intentionally produces a browser network error.

## RC6 live coverage

- [ ] RC6 installed-version and current-login verification
- [x] Reproduce the owner’s actual failure response and independently verify deletion
- [ ] Installed RC6 batch completion with correct deleted counts
- [ ] Fresh Firefox Tampermonkey installation

On 2026-09-05 Chrome background control attached to the owner's RC5 run: six processed comments were incorrectly reported as unconfirmed. The run was paused and stopped at six processed, leaving 294 untouched targets stopped. A captured deletion returned HTTP 200 and an empty JSON object; the exact-target verification returned author [deleted] and body [removed]. A fresh comment page independently showed the first failed target as deleted. The old verifier deliberately rejected that combination, causing six repeated reads per item. A later response exhausted the request allowance; the next identity read returned HTTP 429 with x-ratelimit-reset but no Retry-After. These observed shapes drive the RC6 regressions.

This diagnosis establishes that the observed deletion succeeded while the RC5 result was wrong. RC6 installed-script acceptance is tracked below and must not be inferred from the fixtures.

## Prior RC5 distribution

Implementation [c596861](https://github.com/slaveofsolace/Reddit-Toolbox/commit/c596861b6dd39dedbe85e457d34e8dfafd3e329d) is on main. [CI](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33979102549) and [Build userscript](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33979102633) passed. The public install file and checksum matched the local 145,407-byte artifact on 2026-09-05: SHA-256 `f90913edeb181cfc26f7a774bd6793e70e5865739052c32930c067c8451246fd`.

The RC5 Tampermonkey update prompt was opened. Browser URL policy rejected access to the extension's update page, so the owner must complete its Update click. A fresh Reddit tab still displayed RC4 at the last check. No attempt was made to bypass the blocked extension page, and no new live deletion was performed during this repair.

## Earlier live baseline (RC4)

On 2026-09-05, the installed RC4 script detected the existing Reddit login and scanned the owner’s profile without OAuth or keys. After the owner confirmed the exact two-comment batch, one Run entire batch action completed both comments in 14 seconds. Each row reported completed · overwritten-and-deleted; final metrics were 2 processed, 2 deleted, 0 remaining, 0 failed, and 0 skipped. Run was disabled after completion.

A read-only request trace recorded the sequence edit → delete → edit → delete, with exactly one edit and one deletion request per comment. Identity and item reads occurred around each mutation, including overwrite and deletion verification. All 24 observed cleanup responses returned HTTP 200. The script’s verified completion result, together with the ordered request trace, establishes successful automatic advancement on this live batch. No credentials, original text, replacement text, account identifiers, or target IDs are included in the saved acceptance receipt.

This live result covers the two-comment flow on the installed Chrome userscript. Self-posts, direct deletion of link/media posts, live interruption/recovery scenarios, and fresh Firefox installation remain separate acceptance cases. Website session behavior can change independently of this version; the result does not imply Reddit endorsement.
