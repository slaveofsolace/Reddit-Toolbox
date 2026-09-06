# Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) and enable userscripts when prompted.
2. Open [Reddit Toolbox](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js) and select **Install**.
3. Sign in at [www.reddit.com](https://www.reddit.com/), reload once, and open **RT**.

Your existing Reddit login is all you need. [Session details](API_ACCESS.md).

## Delete a batch

Choose comments or posts, dates, and **No limit** or **Set a limit**. Select **Find matching items**, review the results, then select **Delete N items**. **Keep** excludes an item. **Save a copy** exports the selection before deletion.

Editable bodies are overwritten, checked, deleted, and verified. Deletion is permanent. Keep the Reddit tab open and your computer awake until the batch finishes. Closing the panel is fine; the RT button shows progress. Closing or reloading the tab discards the run, which never resumes automatically.

Speed is automatic and includes scans, edits, deletions, and verification. A comment takes several requests; large batches can take hours. Reddit cooldowns are handled automatically.

## Adjust the selection or panel

**More options** includes subreddit exclusions, score protection, text matching, archive import, login status, and clearing loaded history. Link and media posts are skipped unless **Also delete link and media posts** is enabled. Their bodies cannot be overwritten; titles remain unchanged.

Drag the header to move the panel or either bottom corner to resize it. The RT launcher is movable too. Layout is saved; the header reset button restores it. Arrow keys move or resize a focused handle; Shift makes larger changes.

## Recover from an interruption

**Pause** holds before the next mutation. **Stop** finishes the current item and stops the remainder. **Review retries** prepares failed and stopped items for review.

**Needs recheck** items are not counted as deleted. **Recheck results** checks them without resending deletion. If the tab was closed, reopen Reddit and scan again to review what is still present. An old progress count cannot establish the final result.

## Import older history

Reddit profile listings can omit content. Download your Reddit data archive, extract it, then select **More options → Import archive CSV** and choose comments.csv, posts.csv, or both. Files are processed locally.

You can review an archive while signed out. After signing in, select **Check login** to bind the review to your account.

## Update or uninstall

Finish or stop any active run before updating. Reopen the install link and select **Update**, then reload Reddit. Preferences are retained and speed is automatic.

Remove **Reddit Toolbox** through Tampermonkey to uninstall. This cannot reverse completed edits or deletions.
