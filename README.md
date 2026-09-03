# Reddit Toolbox

A local Tampermonkey toolbox for reviewing, overwriting, and deleting your own Reddit comments and posts.

**Current release:** `1.0.0-rc.1` developer candidate

> **Access gate:** The RC1 transport uses Reddit's signed-in browser session as a local prototype. Reddit's current rules require registered OAuth and explicit approval for Data API access. Do not publish a live release or run it against a primary account until an approved OAuth transport and disposable-account acceptance matrix are complete.

## What it does

- Scans the signed-in account's comments, posts, or both
- Filters by date, amount, subreddit, score, and processing order
- Builds an exact, digest-bound preview before any destructive request
- Replaces comment and self-post bodies with cryptographically generated letters
- Deletes the reviewed item only after its overwrite succeeds
- Deletes link, image, and video posts directly because they have no editable body
- Saves per-item checkpoints so an interrupted run can resume
- Pauses on account changes, login loss, challenges, and rate limits
- Keeps state in Tampermonkey storage and sends no analytics

The script never asks for a Reddit password and does not read browser cookies. It uses the Reddit session already open in the current tab.

## Developer install

1. Install Tampermonkey.
2. Open [`dist/reddit-toolbox.user.js`](dist/reddit-toolbox.user.js) and choose **Install**.
3. Sign in to Reddit and open any page on `www.reddit.com`, `old.reddit.com`, or `new.reddit.com`.
4. Select the **RT** button in the lower-right corner.

After the repository is public, the source candidate can be opened directly. Keep the release gate above in place until Reddit access is approved:

```text
https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/dist/reddit-toolbox.user.js
```

## Use

1. Select comments, posts, or both.
2. Choose a time window and amount. `0` means every matching item found in the current scan.
3. Select **Scan and review**.
4. Review the exact batch, direct-delete warnings, and listing coverage.
5. Type the Reddit username and generated confirmation phrase.
6. Select **Overwrite and delete**.

Runs are sequential. The default delay is three to five seconds between destructive requests. Keep the Reddit tab open until the run completes or is paused.

## Item behavior

| Item | First action | Second action |
|---|---|---|
| Comment | Replace body with random letters | Delete |
| Self-post | Replace body with random letters | Delete |
| Link, image, or video post | No editable body | Delete directly |

Reddit post titles cannot be overwritten. Overwriting content is not a guarantee that third-party archives, screenshots, notifications, or prior copies will disappear.

## Coverage

Reddit Toolbox reads up to ten listing pages per selected type, with up to 100 items per page. When Reddit reports another page after that boundary, the preview says that more history may exist. Complete the reviewed batch and scan again to reveal additional items.

`All` means every matching item found by the current scan, not a guarantee of complete lifetime history. Reddit profile/API listings may omit older activity. Full-history cleanup from a user-supplied Reddit data archive is intentionally left for the next release because it needs a real sanitized export fixture and approved transport.

Every live run is limited to the exact scanned list. It never silently expands into newly discovered content.

## Safety model

- Live actions begin only after an exact account and phrase confirmation.
- Confirmation expires after ten minutes.
- A cross-tab lock permits one active run.
- The active Reddit username is rechecked immediately before every edit and delete.
- An overwrite failure leaves the item undeleted.
- Pause and stop requests survive in-flight actions.
- Deleted item labels and permalinks are scrubbed from local state.
- No concurrency, challenge bypass, or rate-limit evasion is implemented.

## Development

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run check
```

`npm run check` rebuilds the userscript, runs the test suite, parses every JavaScript file, and checks the generated bundle for unsafe or remote-loading patterns.

Repository layout:

```text
packages/toolbox-core/       Platform-neutral filters, jobs, locks, runner, state
packages/reddit-toolbox/     Reddit adapter, Tampermonkey storage, panel, app
userscripts/                 Userscript metadata
scripts/                     Dependency-free build and static checks
dist/                        Installable userscript
tests/                       Core, adapter, storage, and runner tests
```

See [Architecture](docs/ARCHITECTURE.md) and the [RC1 handoff](docs/RC1-HANDOFF.md).

## RC1 status

The core, prototype Reddit adapter, userscript UI, build, CI, guarded release workflow, automated tests, and a mocked Chromium end-to-end smoke test are complete. Two gates remain before a public live release: Reddit approval plus registered OAuth, followed by an authenticated smoke-test matrix on disposable content. Do not test destructive behavior on an account with content you need to keep.

## License

MIT
