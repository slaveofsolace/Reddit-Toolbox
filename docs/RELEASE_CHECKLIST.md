# RC4 acceptance checklist

Session-first development candidate, 2026-09-05. No OAuth, registered app, client ID, or API key is required by the script.

## Automated checks

- [x] 73 passing Node tests, including generated-userscript execution with the default session client
- [x] Deterministic composition, matching versions, syntax, no dynamic evaluation, SHA-256
- [x] Same-origin browser credentials; cached action credentials cleared on failed identity reads
- [x] No OAuth adapter, popup, cross-origin GM transport, or network grants in the generated artifact
- [x] Account-bound frozen targets, ownership/editability checks, direct-delete opt-in
- [x] Replacement read-back, deletion verification, no blind resend after uncertain mutations
- [x] Pause/stop/retry, account changes, 401/403, rate-limit waits, failure guard
- [x] Mandatory Web Locks and canonical origin; no restored run authority after reload
- [x] Strict CSV records, yielding imports, duplicate/rejection counts, protection of unknown fields
- [x] Preference-only persistence and sanitized run logs

## Rendered browser fixtures

The exact generated script ran in isolated Chromium 151.0.7922.34 and Firefox 153.0. All network traffic was intercepted with synthetic Reddit responses. The default session client was used; no client injection, OAuth connection, or setup button was needed. These profiles simulate Tampermonkey preference APIs and do not prove extension or live Reddit acceptance.

| Flow | Chromium | Firefox |
| --- | --- | --- |
| Open → scan → review → confirm → automatic two-comment and mixed batches | Pass | Pass |
| Session action token attached to mutations | Pass | Pass |
| Second tab blocked; closed-panel completion; navigation warning; locked settings | Pass | Pass |
| Reload does not resume; failed login invalidates review; account change clears stale history | Pass | Pass |
| 50,000 archive rows with responsive import and 100 rendered rows per page | Pass | Pass |
| Full-text review; pagination; keeping an item resets confirmation | Pass | Pass |
| Signed-out archive review with Run disabled; sign in and prepare again | Pass | Pass |
| Clear loaded history; backup disabled when review is cleared | Pass | Pass |
| Light desktop, dark narrow layout, 320px containment, keyboard focus | Pass | Pass |
| Console and runtime errors | None | None |

Screenshots were inspected for desktop and narrow layouts. Local evidence is retained in the project's handoff folder under work/browser-rc4.

## Live and distribution acceptance

- [x] Existing RC3 installation observed in the owner's signed-in Chrome Reddit tab
- [x] Owner completed RC4 update; installed version verified on the live Reddit tab
- [x] Existing-login identity and profile scan against current Reddit
- [x] Two owner comments: script-driven overwrite, read-back, deletion, and automatic advancement
- [ ] Live direct-delete/read-back and recovery cases
- [ ] Fresh Tampermonkey install in Chromium and Firefox
- [x] RC4 main workflows and public install artifact checksum match

Implementation [e931e72](https://github.com/slaveofsolace/Reddit-Toolbox/commit/e931e728255dcd15297bf04ee2b8dc9a89ae9929) is on main. [CI](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33957277323) and [Build userscript](https://github.com/slaveofsolace/Reddit-Toolbox/actions/runs/33957277300) passed. The public install file matched the tested 128,763-byte artifact on 2026-09-05, SHA-256 `8812f4c4c459ed7d8913467699ec6f8a481cf6c61a45b17b2cb8ef1fecb77363`.

On 2026-09-05, the installed RC4 script detected the existing Reddit login and scanned the owner’s profile without OAuth or keys. After the owner confirmed the exact two-comment batch, one Run entire batch action completed both comments in 14 seconds. Each row reported completed · overwritten-and-deleted; final metrics were 2 processed, 2 deleted, 0 remaining, 0 failed, and 0 skipped. Run was disabled after completion.

A read-only request trace recorded the sequence edit → delete → edit → delete, with exactly one edit and one deletion request per comment. Identity and item reads occurred around each mutation, including overwrite and deletion verification. All 24 observed cleanup responses returned HTTP 200. The script’s verified completion result, together with the ordered request trace, establishes successful automatic advancement on this live batch. No credentials, original text, replacement text, account identifiers, or target IDs are included in the saved acceptance receipt.

This live result covers the two-comment flow on the installed Chrome userscript. Self-posts, direct deletion of link/media posts, live interruption/recovery scenarios, and fresh Firefox installation remain separate acceptance cases. Website session behavior can change independently of this version; the result does not imply Reddit endorsement.
