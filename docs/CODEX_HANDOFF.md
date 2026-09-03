# Codex Handoff

## Starting point

```text
repository: slaveofsolace/Reddit-Toolbox
branch: main
product version: 1.0.0-rc.1
entry artifact: userscripts/reddit-toolbox.user.js
```

Reddit Toolbox now lives in its own public repository. Do not merge it back into Insta Toolbox or couple Reddit-specific transport and UI code to Instagram-specific modules.

Run first:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

## What is complete

The repository contains the extracted Toolbox Family core, Reddit model and scanner, archive import, filters, immutable review planning, strict target and ownership checks, overwrite-before-delete workflow, deletion verification, ambiguous-result protection, rate-limit pacing, local settings, backup and ledger exports, responsive Shadow DOM UI, deterministic build, CI, and 41 automated tests.

The dedicated-repository migration is complete. Userscript metadata, installation links, documentation, checksums, and workflows now target `slaveofsolace/Reddit-Toolbox`. The misplaced Reddit branches in Insta Toolbox were reset to the Insta Toolbox `main` commit.

## Priority 1 — settle Reddit authentication

The included `RedditSessionClient` intentionally isolates the current same-origin browser-session and modhash approach. It is unit-tested but has not been accepted against a live Reddit account in this environment. Current Reddit developer documentation labels the edit and delete operations OAuth-only, and current Data API terms require registered, compliant access.

Perform a disposable-content acceptance pass before changing the adapter. If the same-origin transport is rejected or conflicts with current requirements, replace it with a user-authorized OAuth adapter rather than DOM clicking or private endpoint imitation.

OAuth requirements:

- Obtain a maintainer-owned Reddit application registration and approval where required.
- Prefer an installed or public-client flow suitable for a userscript; never embed a client secret.
- Request only the scopes needed for identity, history/read, and edit/delete operations.
- Validate state on authorization return.
- Keep access and refresh material in Tampermonkey storage only when necessary, with an explicit disconnect and revoke control.
- Send bearer requests only to Reddit's documented OAuth host.
- Add tests for token expiry, refresh, revocation, denied consent, wrong state, wrong account, 401, 403, and 429.
- Preserve the adapter interface so core, planning, and UI code remain unchanged.

Do not collect Reddit passwords, bypass rate limits, automate challenges, imitate a human to evade controls, or add a remote backend merely to hold credentials.

## Priority 2 — authenticated acceptance

Complete every unchecked item in `docs/RELEASE_CHECKLIST.md` using disposable content. Test one item before a multi-item run. Verify the actual saved replacement and final deleted state, not only HTTP status codes.

Pay special attention to:

- whether `/api/me.json` still exposes a usable modhash on each supported Reddit surface;
- whether `/api/info` returns enough state to verify ownership, overwrite, and deletion;
- current Reddit archive column names;
- eventual consistency delays after edit and delete;
- suspended, locked, archived, removed, or already-deleted items;
- full-page navigation or account challenges during a run.

Capture sanitized fixtures from accepted responses and add regression tests. Never commit live account content, cookies, modhashes, bearer tokens, or raw archive files.

## Priority 3 — release packaging

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
- Keep code and copy direct; do not add filler or speculative features.
