# Reddit Toolbox

**Install the userscript. Sign in to Reddit. Clean up your own history.**

No OAuth setup, app registration, client ID, API key, backend, or companion app. Reddit Toolbox uses the Reddit login already active in your browser tab.

Choose comments and posts, review the matches, select Delete, and let it run. Editable bodies are overwritten with random letters, checked, then deleted. Closing the panel leaves the batch running and the floating RT button shows progress.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) and enable userscripts for your browser.
2. Open **[Install Reddit Toolbox](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js)** and choose **Install**.
3. Open [www.reddit.com](https://www.reddit.com/), sign in, and select **RT**.

RC6 fixes a deletion-verification mismatch reproduced on live Reddit and adds an explicit No limit choice. It passes 89 automated tests. Current browser and live coverage are recorded in the [acceptance checklist](docs/RELEASE_CHECKLIST.md).

## Clean up

Open RT on **www.reddit.com**. Your existing login is detected automatically. [How the session works](docs/API_ACCESS.md).

1. Choose comments, posts, dates, and **No limit** or a specific number of items. Select **Find matching items**.
2. Review the matches. **Keep** excludes individual items; **Save a copy** exports the selection. Select **Delete N items** to start the reviewed batch.

There is no typed phrase, separate preparation button, or per-item confirmation. Changing a filter updates the review automatically. Refresh history to fetch new records. **More options** holds subreddit and score protection, text matching, pacing, local archive import, login status, and history clearing.

Drag the header to move the window; drag either bottom corner to resize it. The RT launcher can also be moved. Size and position are remembered. The header reset button restores the default layout. Keyboard users can focus the move or resize handle and use arrow keys; hold Shift for larger changes.

Archive import and paginated review work while signed out. After signing in normally, **Check login** binds the local review to that account. Unknown protected archive fields are retained. Link/media posts are skipped unless **Also delete link and media posts** is enabled; their bodies cannot be overwritten, and post titles stay unchanged.

## Controls and recovery

- **Pause** holds before the next mutation. **Stop** finishes the current item, then stops the remainder.
- **Review retries** collects failed and stopped items into a new review. Completed items are excluded from later selections in this tab.
- A previously removed comment is also confirmed when our accepted deletion changes its verified owner to [deleted], even if Reddit keeps the [removed] body placeholder. A removed body alone is insufficient.
- A deletion is otherwise counted after a deleted marker, or an accepted deletion of a verified owned item followed by two consecutive valid reads that no longer return it. Missing data alone is insufficient.
- If an accepted deletion leaves the same owned, overwritten item present, the script verifies the account, ownership, and replacement again before one bounded retry. A lost response is never blindly resent.
- Unconfirmed deletions are marked **Needs recheck** and the batch continues. **Recheck results** performs reads only. These items are never counted as deleted until verified.
- Account/ownership changes, challenges, and uncertain overwrites still require attention. Rate-limit waits use Reddit’s reset headers and recover automatically, including when starting or resuming. Requests remain serialized and paced.
- Cleanup uses **www.reddit.com** and a Web Lock excludes concurrent batches. Reloading clears the run and never resumes deletion automatically.

Profile listings can omit older history. Archives broaden discovery but do not establish lifetime completeness. Overwriting/deleting cannot erase third-party copies or guarantee Reddit's internal retention.

## Privacy and development

Only preferences are saved. The session action token, imported content, reviewed batches, replacements, and progress stay in memory unless you explicitly export content or a sanitized run log. There is no telemetry, remote code, or external cleanup service. [Privacy](docs/PRIVACY.md) · [Security](SECURITY.md).

Node.js 20+ is needed only to develop the script. Run `npm ci` followed by `npm run check`; installation needs neither. The deterministic build has no runtime dependencies and generates `SHA256SUMS.txt`. [Architecture](docs/ARCHITECTURE.md) · [Reference tools](docs/SOURCES.md).

MIT licensed. Copyright (c) 2026 [slaveofsolace](https://github.com/slaveofsolace). Not affiliated with Reddit.
