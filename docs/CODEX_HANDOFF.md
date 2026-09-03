# Codex Handoff

## Starting point

Public RC1 branch:

```text
repository: slaveofsolace/Insta-Toolbox
branch: reddit-toolbox-v1-rc1
product version: 1.0.0-rc.1
entry artifact: userscripts/reddit-toolbox.user.js
```

This branch is a standalone Reddit Toolbox tree. Do not merge it into the Insta Toolbox `main` branch as a root replacement.

Run first:

```sh
npm run check
```

## What is complete

The repository contains the extracted Toolbox Family core, Reddit model and scanner, archive import, filters, immutable review planning, strict target and ownership checks, overwrite-before-delete workflow, deletion verification, ambiguous-result protection, rate-limit pacing, local settings, backup/log exports, responsive Shadow DOM UI, deterministic build, CI, and 41 automated tests.

## Priority 1 — move to the dedicated repository

Create a public repository named `slaveofsolace/Reddit-Toolbox`, copy this branch's root to its `main` branch while preserving history where practical, then update:

- `@homepageURL`, `@supportURL`, `@downloadURL`, and `@updateURL` in `src/userscript-metadata.txt`
- install links in `README.md` and `docs/INSTALLATION.md`
- any branch-specific wording

Rebuild and commit the generated userscript after changing metadata.

## Priority 2 — settle Reddit authentication

The included `RedditSessionClient` intentionally isolates the current same-origin browser-session/modhash approach. It is unit-tested but not authenticated against a live Reddit account in this environment. Current Reddit developer documentation labels the edit and delete operations OAuth-only, and current Data API terms require registered, compliant access.

Perform a disposable-content acceptance pass before changing the adapter. If the same-origin transport is rejected or conflicts with current requirements, replace it with a user-authorized OAuth adapter rather than DOM clicking or private endpoint imitation.

OAuth requirements:

- Obtain a maintainer-owned Reddit application registration and approval where required.
- Prefer an installed/public-client flow suitable for a userscript; never embed a client secret.
- Request only the scopes needed for identity, history/read, and edit/delete operations.
- Validate state on authorization return.
- Keep access and refresh material in Tampermonkey storage only when necessary, with an explicit disconnect/revoke control.
- Send bearer requests only to Reddit's documented OAuth host.
- Add tests for token expiry, refresh, revocation, denied consent, wrong state, wrong account, 401, 403, and 429.
- Preserve the adapter interface so core, planning, and UI code remain unchanged.

Do not collect Reddit passwords, bypass rate limits, automate challenges, imitate a human to evade controls, or add a remote backend merely to hold credentials.

## Priority 3 — authenticated acceptance

Complete every unchecked item in `docs/RELEASE_CHECKLIST.md` using disposable content. Test one item before a multi-item run. Verify the actual saved replacement and final deleted state, not only HTTP status codes.

Pay special attention to:

- whether `/api/me.json` still exposes a usable modhash on each supported Reddit surface;
- whether `/api/info` returns enough state to verify ownership, overwrite, and deletion;
- current Reddit archive column names;
- eventual consistency delays after edit and delete;
- suspended, locked, archived, removed, or already-deleted items;
- full-page navigation or account challenges during a run.

Capture sanitized fixtures from accepted responses and add regression tests. Never commit live account content, cookies, modhashes, bearer tokens, or raw archive files.

## Priority 4 — release packaging

After live acceptance:

1. Remove the RC1 warning only when justified.
2. Regenerate `SHA256SUMS.txt` after any source or metadata change.
3. Tag `v1.0.0-rc.1` or the next RC.
4. Publish a GitHub release containing `reddit-toolbox.user.js` and checksums.
5. Test Tampermonkey update-in-place from the previous RC.
6. Keep the source-built artifact diff clean in CI.

## Constraints to preserve

- Scope → Review → Confirm → Run remains the primary workflow.
- No automatic start or automatic resume.
- No deletion before exact ownership and overwrite verification.
- No automatic resend after an ambiguous delete request.
- Direct deletion stays opt-in and plan-bound.
- Stop stays available during waits and between items.
- No analytics, credential collection, remote control, dynamic evaluation, or unnecessary dependencies.
- Keep code and copy direct; do not add generated filler or speculative features.
