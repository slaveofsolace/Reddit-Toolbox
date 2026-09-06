# Reddit Toolbox

Delete your Reddit comments and posts from a movable, resizable panel in your browser.

**[Install Reddit Toolbox](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js)** · [Installation guide](docs/INSTALLATION.md) · [Changelog](CHANGELOG.md)

Uses your existing Reddit login. No API key, app registration, or separate service.

## Get started

1. Install [Tampermonkey](https://www.tampermonkey.net/) and enable userscripts when prompted.
2. Open the install link above and select **Install**.
3. Sign in at [www.reddit.com](https://www.reddit.com/) and open **RT**.
4. Choose comments or posts, dates, and **No limit** or a specific count. Select **Find matching items**.
5. Review the selection. **Keep** excludes an item; **Save a copy** exports the selected content. Select **Delete N items** to begin.

Deletion is permanent. Editable text is overwritten and checked before deletion; each result is verified. **Keep the Reddit tab open and your computer awake until the batch finishes.** You can close the panel and follow progress on the RT button. Closing or reloading the tab loses the current run; it does not resume automatically.

## While it runs

- **Speed is automatic.** Every request is spaced at least 7.5 seconds apart. Reddit cooldowns can extend the wait. A comment needs several requests, so large batches take hours.
- **Pause** holds before the next mutation. **Stop** finishes the current item and stops the rest.
- **Needs recheck** means deletion is not yet confirmed. Use **Recheck results** to verify it without sending another deletion.
- **Review retries** prepares failed or stopped items for another review.

Drag the header or RT button to move them. Drag either bottom corner to resize the panel. Layout is remembered; the header reset button restores it. Move and resize handles also support arrow keys and Shift for larger changes.

## Filters and older history

**More options** includes subreddit exclusions, score protection, text matching, and archive import. Link and media posts are excluded unless explicitly enabled; they have no body to overwrite. Post titles remain unchanged.

Reddit profile listings can omit older items. Import comments.csv or posts.csv from your Reddit data archive to include more history. Files are processed locally. No limit includes all discovered matches, not necessarily every item ever posted.

## Privacy

No telemetry, backend, or remote code. Only preferences and anonymous pacing deadlines are saved automatically. Content and run progress stay in the tab unless you export them. Deleting from Reddit cannot erase third-party copies or guarantee removal from Reddit's internal backups. [Privacy details](docs/PRIVACY.md) · [Security](SECURITY.md).

## Development

Use Node.js 20 or newer:

```sh
npm ci
npm run check
```

The build combines the source into one userscript and writes its SHA-256 checksum. [Architecture](docs/ARCHITECTURE.md) · [Verification](docs/RELEASE_CHECKLIST.md) · [References](docs/SOURCES.md) · [Contributing](CONTRIBUTING.md).

MIT licensed. Copyright (c) 2026 [slaveofsolace](https://github.com/slaveofsolace). Not affiliated with Reddit.
