# Installation

Install the single RC3 userscript. Its OAuth flow and batch behavior are fixture-tested; real Reddit and Tampermonkey acceptance remain pending. See [connection setup](API_ACCESS.md).

## Install the userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) for a supported desktop browser.
2. Chrome users must open `chrome://extensions/?id=dhdgffkkebhmkfjojejmpbldmpobfkfo` and enable **Allow User Scripts**.
3. Open [reddit-toolbox.user.js](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js).
4. Review the Tampermonkey metadata, then select **Install**.
5. Sign in to Reddit and reload the tab.
6. Select the orange **RT** launcher. The Tampermonkey menu also includes **Open Reddit Toolbox**.

## Connect your account

Open **www.reddit.com** and use **Connect Reddit** with your approved installed-app public client ID. Register the exact redirect shown in the panel. Tokens stay in this tab; no password, secret, or backend is needed. [Full instructions](API_ACCESS.md).

## Prepare broader history

The profile scan retrieves history exposed by Reddit's profile listings. For older content:

1. Request your Reddit data from `https://www.reddit.com/settings/data-request`.
2. Download and extract the archive when Reddit makes it available.
3. In Reddit Toolbox, choose **Import archive CSV**.
4. Select `comments.csv`, `posts.csv`, or both.

The archive is read locally and is not uploaded by Reddit Toolbox.

## Run an automated cleanup

1. Select comments, posts, or both.
2. Set the date window, maximum amount, ordering, and any exclusions.
3. Select **Scan history** or import archive CSV files.
4. Select **Prepare batch** and review every page of selected rows. Use **Keep this item** to exclude an item from this batch; the confirmation resets.
5. Export the selected content before deleting anything important.
6. Type the displayed confirmation once.
7. Select **Run entire batch**.

No per-item confirmation is required. The toolbox automatically advances through the complete reviewed batch. It waits through rate limits, retries temporary failures, and continues after isolated item failures.

The panel may be closed during the run. The orange launcher becomes a progress indicator and signals when attention is required. Keep the Reddit tab open; a reload or full navigation ends the in-memory run and never resumes it automatically.

Use **Pause batch** to hold before the next operation boundary. Use **Stop after current item** to let the active item settle and stop the remainder. Then use **Prepare retry batch** to collect failed and stopped items into one new reviewed batch.

Link and media posts have no editable body. They are skipped unless **Delete link/media posts directly** is enabled before the batch is prepared.

## Update

Tampermonkey checks the userscript's `@updateURL`. Keep the script name and namespace unchanged for updates. RC3 has a higher version than RC1/RC2 and retains the same name and namespace. Review the new Reddit OAuth network grants when Tampermonkey requests them. Actual update-in-place from RC1 and RC2 remains an unchecked acceptance gate.

## Remove

Open the Tampermonkey dashboard and delete **Reddit Toolbox**. Removing the script does not reverse completed Reddit edits or deletions.
