# RC7 acceptance checklist

Userscript first, 2026-09-05. Existing Reddit login; no OAuth, app registration, client ID, or API key.

## Automated checks

- [x] 99 Node tests; deterministic composition, matching versions, syntax, and SHA-256 checks
- [x] Every request paced at eight per minute or slower; low allowances slow before exhaustion
- [x] Shared request slots and cooldowns across same-origin tabs/reloads; lost responses consume a slot
- [x] Legacy speed preferences ignored; speed controls removed; cancellation during admission waits
- [x] Account-bound frozen targets, mutation-boundary ownership/editability and saved-text checks
- [x] Explicit deleted markers and acknowledged deletions followed by repeated valid absent reads
- [x] Missing data alone, mismatched IDs, malformed listings, and moderation removal rejected as deletion evidence
- [x] One bounded retry for an acknowledged no-op; no blind resend for a lost response
- [x] Unconfirmed rows continue the batch, stay separate from deleted counts, and have read-only rechecks
- [x] Login revalidation before rechecking results; HTTP 200 rejection envelopes handled as errors
- [x] Web Locks, rate limits, pause/stop, failure guard, no destructive restoration on reload
- [x] Original archive, filtering, review, privacy, and generated-script regression coverage

## Browser acceptance

Run the generated userscript in isolated Chromium and Firefox using **npm run test:browser**. All traffic is intercepted and all content is synthetic. The fixture uses the production session adapter, request scheduler, and runner, with an accelerated scheduler clock. It also shortens verification delays for uncertain/no-op cases. Obsolete fast preferences are deliberately loaded to verify migration. These checks prove the tested application behavior, not live Reddit compatibility or extension installation.

**npm run test:pacing** separately exercises the exact generated script in Chromium with real clocks and no pacing overrides. It scans an empty synthetic account and checks login in another tab, verifying spacing between all four read-only requests and the absence of speed controls. It sends no live Reddit traffic or mutations.

On 2026-09-05 that real-clock check passed: the four requests were separated by 7,501 ms, 7,503 ms, and 7,501 ms, including the request from a fresh tab. The exact generated artifact was 152,450 bytes. The old zero-delay preferences did not accelerate any request. The receipt is work/browser-rc7/real-time-pacing.json in the project handoff folder.

For local development, install optional test tooling with **npm install --no-save --package-lock=false playwright**, then **npx playwright install chromium firefox**. The script also accepts REDDIT_TOOLBOX_PLAYWRIGHT_MODULE for an existing installation and REDDIT_TOOLBOX_BROWSER_OUTPUT for an evidence directory. Screenshots/results default to ignored artifacts/browser.

| Flow | Chromium | Firefox |
| --- | --- | --- |
| Find → automatic review → one Delete action; two comments and mixed content | Pass | Pass |
| Deleted-author/removed-body live response, null author, accepted-and-absent deletion | Pass | Pass |
| Explicit No limit and Set a limit choices | Pass | Pass |
| Automatic request pacing and removal of saved speed preferences | Pass | Pass |
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

Local evidence is retained under work/browser-rc7 in the project handoff folder. The test's simulated lost response intentionally produces a browser network error.

## RC7 installed live pacing acceptance

The owner completed the RC7 Tampermonkey update on 2026-09-05. A fresh Chrome Reddit tab displayed RC7 with no speed controls. A read-only No limit scan selected 344 remaining comments. Its identity request and four listing requests returned HTTP 200; request starts were separated by 7,502 ms, 7,502 ms, 7,500 ms, and 7,501 ms. No rate-limit error occurred. Reddit reported 99 through 95 requests remaining, and the UI showed automatic pacing countdowns between requests. No edit or deletion request was sent during this acceptance check.

The old RC6 run had 16 deleted, no unconfirmed/failed items, and 344 remaining out of 360. It was first paused during its cooldown and then stopped through the UI after RC7 verification, releasing its cleanup lock while preserving the review. At that pacing checkpoint the fresh RC7 tab held the 344-item review and no new batch had been started. The subsequent authorized batch is described below. Sanitized live evidence is retained as work/rc7-live-pacing.json in the project handoff folder. It contains no identifiers, content, credentials, or full request headers.

Implementation [6dec347](https://github.com/slaveofsolace/Reddit-Toolbox/commit/6dec347063f349c619055a828aad12496dfc2f6a) is on main. [CI](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33984334838) and [Build userscript](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33984334849) passed. The public userscript/checksum matched the 152,450-byte artifact: SHA-256 `6cd82effcb07b619cf333d15c36049b5115f295815a8ca8f505c4ebe6e6373af`.

This confirms installed Chrome read-only pacing and settings migration. The RC7 live batch checkpoint below adds partial deletion evidence; live low-budget adaptation and fresh Firefox installation are not claimed. The extension update-page policy was respected; the owner performed the Update click.

## RC7 authorized 344-comment batch: incomplete, 97 found on rescan

On 2026-09-06 Chrome CUA was available again, but the original run tab was not found. A fresh installed RC7 scan of the same signed-in account used Comments only, All time, No limit and found 97 comments: 97 selected, 0 excluded, 0 posts. No new deletion batch was started. This confirms remaining profile-visible content; it does not recover the original run's final outcome counters or establish 344 successful deletions. The aggregate rescan is preserved in work/rc7-full-batch.json alongside the earlier checkpoints.

The owner then explicitly authorized testing all 344 comments in the prepared No limit review, with no posts. One Delete 344 items action started the frozen batch at 2026-09-05 19:52:31 UTC. Background checks observed continued progress with automatic pacing. At the last successful check, 2026-09-06 02:21:27 UTC, the toolbox reported 243 deleted, 101 remaining, 0 failed, 0 unconfirmed, and 0 skipped; item 244 was in progress. The sanitized log reported overwritten-and-deleted outcomes. No second batch was started.

At the 2026-09-06 06:25 UTC follow-up, Chrome was unavailable to CUA; the browser inventory contained only the Codex in-app browser. The final batch state is unknown. The monitoring heartbeat was paused pending reconnection. This is a verification blocker, not evidence that the cleanup failed or stopped at 243. Aggregate evidence and all prior checkpoints are preserved in work/rc7-full-batch.json in the project handoff folder.

- [x] Installed RC7 sustained progress through 243 confirmed deletions without reported failures, unconfirmed outcomes, or skips
- [ ] Verify final totals: 344 deleted, 0 remaining, 0 failed, 0 unconfirmed, 0 skipped
- [ ] Independently scan current comment history read-only after completion in a fresh tab

Reconnect to the existing run and preserve its review before taking any action. Do not restart the batch or resend uncertain deletions. Terminal unconfirmed results may be rechecked using the read-only Recheck results control. The full 344-comment test is not yet accepted.

## RC6 live coverage

- [x] RC6 installed-version and current-login verification
- [x] Reproduce the owner’s actual failure response and independently verify deletion
- [x] Installed RC6 batch completion with correct deleted counts
- [x] Both completed comments independently show Comment deleted by user on Reddit
- [x] Installed No limit scan and Set a limit review updates
- [ ] Fresh Firefox Tampermonkey installation

On 2026-09-05 Chrome background control attached to the owner's RC5 run: six processed comments were incorrectly reported as unconfirmed. The run was paused and stopped at six processed, leaving 294 untouched targets stopped. A captured deletion returned HTTP 200 and an empty JSON object; the exact-target verification returned author [deleted] and body [removed]. A fresh comment page independently showed the first failed target as deleted. The old verifier deliberately rejected that combination, causing six repeated reads per item. A later response exhausted the request allowance; the next identity read returned HTTP 429 with x-ratelimit-reset but no Retry-After. These observed shapes drive the RC6 regressions.

After the owner completed the RC6 update, a fresh Chrome Reddit tab displayed RC6 and scanned through the existing login. No limit selected all 362 available comments and hid the numeric field. Switching to Set a limit with 2 rebuilt the review to the next two untouched comments from the owner's original batch.

One Delete 2 items action completed both comments in approximately eight seconds, with 2 deleted, 0 needing recheck, 0 failed, and 0 skipped. Both rows displayed Deleted; the completed Delete, Pause, and Stop controls were disabled. The request trace contained exactly edit → delete → edit → delete, with all 24 cleanup responses returning HTTP 200. Each final exact-target response contained author [deleted] and body [removed], exercising the actual RC5 failure shape. Each native Reddit comment page independently displayed Comment deleted by user and author [deleted].

The original stopped RC5 tab remains preserved. RC6 acceptance deleted only those two additional comments; the other 292 untouched targets from the original batch were not run. A sanitized receipt is retained locally as work/rc6-live-completion.json in the project handoff folder. It contains no account or target identifiers, original content, or session values.

This verifies the installed Chrome userscript's two-comment workflow and No limit control. Live post deletion, live interruption/recovery cases, and fresh Firefox installation remain separate acceptance cases. Chromium/Firefox fixtures cover simulated recovery; they do not replace those live checks.

## RC6 distribution

Implementation [b8f73f2](https://github.com/slaveofsolace/Reddit-Toolbox/commit/b8f73f239330bf666850e4360c6d08f6d6923b25) is on main. [CI](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33982026877) and [Build userscript](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33982026813) passed. The public install file and checksum matched the local 149,057-byte artifact on 2026-09-05: SHA-256 `dbf423695ab736feda82f7c6aa39390de5f5b92c62a76e61c1e254a10f131645`.

## Prior RC5 distribution

Implementation [c596861](https://github.com/slaveofsolace/Reddit-Toolbox/commit/c596861b6dd39dedbe85e457d34e8dfafd3e329d) is on main. [CI](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33979102549) and [Build userscript](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33979102633) passed. The public install file and checksum matched the local 145,407-byte artifact on 2026-09-05: SHA-256 `f90913edeb181cfc26f7a774bd6793e70e5865739052c32930c067c8451246fd`.

At the earlier RC5 distribution checkpoint, the Tampermonkey prompt required the owner's Update click because browser URL policy rejected the extension update page. The owner subsequently installed RC5 and RC6. The RC6 live coverage above supersedes that installation checkpoint; the extension-page restriction was not bypassed.

## Earlier live baseline (RC4)

On 2026-09-05, the installed RC4 script detected the existing Reddit login and scanned the owner’s profile without OAuth or keys. After the owner confirmed the exact two-comment batch, one Run entire batch action completed both comments in 14 seconds. Each row reported completed · overwritten-and-deleted; final metrics were 2 processed, 2 deleted, 0 remaining, 0 failed, and 0 skipped. Run was disabled after completion.

A read-only request trace recorded the sequence edit → delete → edit → delete, with exactly one edit and one deletion request per comment. Identity and item reads occurred around each mutation, including overwrite and deletion verification. All 24 observed cleanup responses returned HTTP 200. The script’s verified completion result, together with the ordered request trace, establishes successful automatic advancement on this live batch. No credentials, original text, replacement text, account identifiers, or target IDs are included in the saved acceptance receipt.

This live result covers the two-comment flow on the installed Chrome userscript. Self-posts, direct deletion of link/media posts, live interruption/recovery scenarios, and fresh Firefox installation remain separate acceptance cases. Website session behavior can change independently of this version; the result does not imply Reddit endorsement.
