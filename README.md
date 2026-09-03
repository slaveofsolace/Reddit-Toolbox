# Reddit Toolbox

**[Install Reddit Toolbox RC1 with Tampermonkey](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js)**

Local-first Reddit history cleanup for your own account. Review comments and posts, narrow them by date or amount, then overwrite eligible text with random letters before deletion.

> **RC1 status:** the build and automated safety suite are complete. The current same-origin Reddit session adapter still needs authenticated acceptance testing against disposable content before this should be treated as a stable release.

![Reddit Toolbox RC1 preview](docs/media/reddit-toolbox-preview.svg)

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. In Chrome, open `chrome://extensions/?id=dhdgffkkebhmkfjojejmpbldmpobfkfo` and enable **Allow User Scripts**.
3. Open the **[Reddit Toolbox userscript](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js)** and choose **Install**.
4. Sign in to Reddit, reload the page, then select the orange **RT** button.

Read [Installation](docs/INSTALLATION.md) before the first cleanup. Verify the userscript against `SHA256SUMS.txt` when installing a downloaded copy.

## What it does

- Scans the comments and posts available from the signed-in profile.
- Imports `comments.csv` and `posts.csv` from a Reddit data export for older history.
- Filters by content type, date window, amount, order, subreddit, score, or matching text.
- Creates a finite review plan with a digest and exact typed confirmation.
- Verifies ownership before changing an item.
- For comments and self-posts: writes a random lowercase string, waits, verifies the saved text, deletes, then verifies deletion.
- Skips link and media posts unless direct deletion is explicitly enabled.
- Pauses for authentication, account notices, uncertain results, and rate limits.
- Exports the selected content and the final run ledger on demand.

No cleanup starts automatically. Plans and active runs exist only in memory and do not resume after a reload.

## Complete history

Reddit profile listings are paginated and may not expose an account's entire lifetime history. Request a copy of your Reddit data, extract the archive, and import `comments.csv` and `posts.csv`. Profile and archive records are merged by exact Reddit fullname, with live profile data preferred when both exist.

## Data and permissions

Reddit Toolbox runs in the browser tab. It does not ask for a Reddit password, copy cookies, use remote analytics, or send archive contents anywhere other than Reddit requests required for the cleanup. Only settings are persisted locally. Imported content, review plans, replacement strings, and run state remain in memory unless you explicitly export a file.

The project is not affiliated with or endorsed by Reddit. Use it only with content owned by the account currently signed in and comply with Reddit's current terms and API rules.

See [Privacy](docs/PRIVACY.md), [Security](SECURITY.md), and [Architecture](docs/ARCHITECTURE.md).

## Develop

Requirements: Node.js 20 or newer.

```sh
npm run check
```

The current RC1 passes 41 automated tests plus final userscript syntax and integrity checks. The build has no runtime dependencies. `src/userscript-metadata.txt` and the ordered source files produce `userscripts/reddit-toolbox.user.js` deterministically.

## RC1 handoff

The remaining authenticated Reddit acceptance work and dedicated-repository split are documented in [Codex Handoff](docs/CODEX_HANDOFF.md). The required live checks are in [Release Checklist](docs/RELEASE_CHECKLIST.md).

## License

MIT licensed. Copyright (c) 2026 [slaveofsolace](https://github.com/slaveofsolace).
