# Installation

Install the single RC5 userscript. Your normal Reddit login is the only account setup.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) and follow its prompt to enable userscripts if needed.
2. Open [Install Reddit Toolbox](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js) and select **Install**.
3. Sign in normally at [www.reddit.com](https://www.reddit.com/), reload the tab, and open **RT**.

No registered app, OAuth authorization, client ID, or API key is needed. [Session details](API_ACCESS.md).

## Clean up

1. Choose comments, posts, dates, an optional limit, and order. Select **Find matching items**.
2. Review the matches. **Keep** excludes a row and **Save a copy** exports the selection. Select **Delete N items** to start.

Editable bodies are overwritten, read back, deleted, and verified automatically. Deletion is permanent. There is no typed phrase, separate preparation step, or per-item confirmation. Filter changes update the review automatically.

**More options** contains subreddit and score protection, text matching, pacing, archive import, login status, and history clearing. Link/media posts have no editable body and are skipped unless **Also delete link and media posts** is enabled. Titles stay unchanged.

## Move and resize

Drag the header to move the panel, or either bottom corner to resize it. Drag the RT launcher to reposition it. Layout is saved automatically; the header reset button restores the default. Focus a move/resize handle and use arrow keys for keyboard control; Shift moves farther.

The footer keeps Delete, progress, and run controls accessible while the history scrolls. Closing the panel leaves the batch running and the launcher shows its progress. Keep the Reddit tab open; reloading ends the in-memory run and never resumes deletion automatically.

## Recovery

**Pause** holds before the next mutation. **Stop** finishes the current item and stops the remainder. **Review retries** collects failed and stopped items into another review.

Unconfirmed deletion results show **Needs recheck**, remain separate from deleted counts, and allow other items to continue. **Recheck results** performs read-only verification. See [the result rules](ARCHITECTURE.md#uncertain-outcomes).

## Include older history

Profile listings can omit older content. Request your data from Reddit's settings, download and extract the archive, then use **More options → Import archive CSV** to select comments.csv, posts.csv, or both. Import automatically builds a paginated review. Files are parsed locally and are not uploaded by this tool.

Signed-out archive review is available. Sign in normally, then select **Check login** in More options to enable deletion for that account.

## Update or remove

Reopen the install link and select **Update**, or let Tampermonkey use the script's update URL. RC5 keeps the same name, namespace, and permissions as RC4. Reload Reddit after an update to use the new version; finish or stop any old run first because a reload discards its in-memory progress.

To uninstall, remove **Reddit Toolbox** through Tampermonkey. Uninstalling cannot reverse completed Reddit edits or deletions.
