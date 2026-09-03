# Codex Handoff

## Starting point

```text
repository: slaveofsolace/Reddit-Toolbox
branch: main
product version: 1.0.0-rc.2
entry artifact: userscripts/reddit-toolbox.user.js
```

Run first:

```sh
npm ci
npm run check
```

## Product intent

Reddit Toolbox should feel like Insta Toolbox DM Unsend: the operator chooses a finite scope, reviews it once, confirms once, and the tool completes the whole batch without asking the operator to advance individual items.

Sequential API requests are intentional. Do not confuse internal serialization with manual one-by-one operation.

## Complete in RC2

- Profile scanning for comments and posts with cursor pagination
- Reddit archive `comments.csv` and `posts.csv` import
- Type, date, amount, order, subreddit, score, and text filters
- Fixed reviewed batches with digest-bound destructive options
- One confirmation for the entire selected batch
- Automated queue advancement with no per-item click path
- Current phase, whole-batch progress, panel-closed launcher state, pause, and stop
- Automatic rate-limit waiting and bounded temporary-failure retries
- Continuation after isolated permanent failures
- Five-consecutive-failure attention guard
- Retry-batch construction from failed and stopped rows
- Session/account revalidation and ownership verification before every mutation
- Comment/self-post overwrite → verify → delete → verify
- Direct-delete opt-in for link and media posts
- Ambiguous edit/delete protection and same-page retry state reuse
- Cross-tab Web Locks exclusion with an in-page fallback
- Navigation warning while a batch is active
- Local-only preferences, deterministic build, CI, checksums, and automated tests

## Priority 1 — authenticated Reddit acceptance

The current `RedditSessionClient` uses the signed-in same-origin browser session and modhash. It is isolated behind the adapter and covered by mocks, but it has not been accepted against live Reddit in this environment.

Use disposable content and complete every unchecked item in `docs/RELEASE_CHECKLIST.md`. Start with a two-comment batch so the test proves automatic queue advancement rather than only a single-item mutation.

Capture sanitized fixtures for accepted response shapes. Never commit cookies, modhashes, bearer tokens, account identifiers, raw archives, or real user content.

## Priority 2 — settle authentication

Confirm whether the same-origin approach remains functional and permitted under Reddit's current API requirements. If it does not, replace only `src/reddit/api.js` with a user-authorized OAuth adapter. Preserve the scanner, normalized model, removal service, batch runner, and UI contracts.

OAuth constraints:

- Use a maintainer-owned registered Reddit application and obtain approval where required.
- Prefer a public/installed-client flow suitable for a userscript; never embed a client secret.
- Request only identity, history/read, and edit/delete scopes actually needed.
- Validate authorization state and bind the returned identity to the reviewed batch.
- Store tokens in Tampermonkey storage only when necessary and provide disconnect/revoke.
- Send bearer requests only to Reddit's documented OAuth host.
- Add tests for denied consent, wrong state, wrong account, expiry, refresh, revocation, 401, 403, and 429.

Do not collect Reddit passwords, copy cookies, imitate private clients, automate challenges, evade rate limits, or add a remote credential backend.

## Priority 3 — browser acceptance

Validate the rendered userscript on desktop Chromium and Firefox/Tampermonkey:

- one approval starts all selected items;
- closing the panel leaves the batch active;
- launcher percentage, remaining badge, attention state, and completion state remain accurate;
- pause during pacing and resume after session refresh;
- stop during pacing and during an in-flight item;
- long rate-limit countdowns;
- retry-batch preparation after mixed completed, failed, and stopped rows;
- narrow and mobile-width panel layouts;
- accidental navigation warning;
- Web Locks behavior across two Reddit tabs.

Do not add per-item confirmation or per-item Next buttons to solve UI uncertainty. Pause the batch only for a material safety ambiguity.

## Priority 4 — edge cases

Test and add sanitized regressions for:

- archived, locked, removed, or already-deleted content;
- suspended accounts and security challenges;
- Reddit eventual-consistency delays after edit and delete;
- archive rows missing a usable fullname;
- very large histories and page-cap reporting;
- account changes between items;
- network loss before a mutation versus after a mutation;
- a delete request whose response is lost;
- a retry batch that resumes an item whose overwrite already succeeded.

## Priority 5 — release packaging

After authenticated acceptance:

1. Remove the RC warning only when justified.
2. Regenerate the userscript and `SHA256SUMS.txt`.
3. Tag the next release candidate or `v1.0.0`.
4. Publish `reddit-toolbox.user.js` and checksums through GitHub Releases.
5. Test Tampermonkey update-in-place from RC1 and RC2.
6. Keep generated-artifact diffs clean in CI.

## Constraints to preserve

- Scope → Review → Confirm once → Automated batch remains the primary workflow.
- No per-item operator action during a healthy run.
- No automatic start and no silent resume after reload.
- No mutation after the signed-in account changes.
- No deletion before ownership and overwrite verification for editable content.
- No automatic resend after an ambiguous delete.
- Direct deletion stays explicit and plan-bound.
- Requests remain sequential, paced, stoppable, and observable.
- No analytics, credential collection, remote control, dynamic evaluation, or unnecessary dependencies.
- Keep copy direct and code small; do not add generated filler.
