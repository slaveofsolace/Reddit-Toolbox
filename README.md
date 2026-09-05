# Reddit Toolbox

**Install the userscript. Sign in to Reddit. Clean up your own history.**

No OAuth setup, app registration, client ID, API key, backend, or companion app. Reddit Toolbox uses the Reddit login already active in your browser tab.

Choose comments and posts, review a finite batch, confirm once, and let it run. Editable bodies are overwritten with random letters, checked, then deleted. Closing the panel leaves the batch running and the floating RT button shows progress.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) and enable userscripts for your browser.
2. Open **[Install Reddit Toolbox](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js)** and choose **Install**.
3. Open [www.reddit.com](https://www.reddit.com/), sign in, and select **RT**.

RC4 restores the intended session-based userscript flow. It has automated and isolated browser verification; live cleanup acceptance is tracked separately. See the [acceptance checklist](docs/RELEASE_CHECKLIST.md).

## Clean up

Open RT on **www.reddit.com**. **Scan history** automatically checks your existing login; **Check Reddit login** is an optional status check. [How the session works](docs/API_ACCESS.md).

1. Select content types, inclusive dates, an amount, and processing order.
2. Scan your profile or import Reddit's `comments.csv` and `posts.csv` locally.
3. Select **Prepare batch**. Review the account, actions, and every page of selected items. Use **Keep this item** to remove an item from this batch.
4. Optionally export the selected content, then type the batch confirmation once.
5. Select **Run entire batch**. It advances automatically without per-item clicks.

Archive import and paginated review also work while signed out. Sign in normally and prepare again to bind the batch to that account before running it.

Advanced controls include subreddit exclusions, score protection, text matching, random replacement length, and pacing. When a protected archive field is unknown, the item is retained. Link/media posts have no editable body and are skipped unless direct deletion is explicitly enabled; post titles are never described as overwritten.

## Controls and recovery

- **Pause batch** holds before the next mutation. **Stop after current item** lets the current item settle, then stops the remainder.
- **Prepare retry batch** collects failed and stopped items into a new review. Completed work and uncertain mutations are remembered for this tab.
- Account and ownership are checked again before mutations. Saved replacement text must match before deletion.
- Requests are serialized and paced. Rate-limit waits and bounded retries run automatically; repeated failures or uncertain outcomes require attention.
- Cleanup uses **www.reddit.com** and requires Web Locks to exclude concurrent batches. Other supported Reddit origins show the launcher and can review local archives.
- Reloading clears the reviewed batch and active run; your ordinary Reddit login remains managed by Reddit. Nothing resumes destructively on reload.

Profile listings can omit older history. Archives broaden discovery but do not establish lifetime completeness. Overwriting/deleting cannot erase third-party copies or guarantee Reddit's internal retention.

## Privacy and development

Only preferences are saved. The session action token, imported content, reviewed batches, replacements, and progress stay in memory unless you explicitly export content or a sanitized run log. There is no telemetry, remote code, or external cleanup service. [Privacy](docs/PRIVACY.md) · [Security](SECURITY.md).

Node.js 20+ is needed only to develop the script. Run `npm ci` followed by `npm run check`; installation needs neither. The deterministic build has no runtime dependencies and generates `SHA256SUMS.txt`. [Architecture](docs/ARCHITECTURE.md) · [Reference tools](docs/SOURCES.md).

MIT licensed. Copyright (c) 2026 [slaveofsolace](https://github.com/slaveofsolace). Not affiliated with Reddit.
