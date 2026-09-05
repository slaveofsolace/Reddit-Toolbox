# Installation

Install the single RC4 userscript. Your normal Reddit login is the only account setup.

## Install the userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) for a supported desktop browser.
2. Chrome users must open `chrome://extensions/?id=dhdgffkkebhmkfjojejmpbldmpobfkfo` and enable **Allow User Scripts**.
3. Open [reddit-toolbox.user.js](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js).
4. Review the Tampermonkey metadata, then select **Install**.
5. Sign in to Reddit and reload the tab.
6. Select the orange **RT** launcher. The Tampermonkey menu also includes **Open Reddit Toolbox**.

## Use your existing login

Open **www.reddit.com**, sign in normally, and select **RT**. **Scan history** automatically detects the current account. No registered app, OAuth authorization, client ID, or API key is needed. [Session details](API_ACCESS.md).

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

Tampermonkey checks the userscript’s `@updateURL`. You can also reopen the install link and choose **Update**. RC4 keeps the same name and namespace, raises the version, and removes RC3’s cross-origin network permissions. Reload existing Reddit tabs after updating; an already running tab still contains its previous script until reload. Any saved RC3 public client ID is removed on first mount.

## Remove

Open the Tampermonkey dashboard and delete **Reddit Toolbox**. Removing the script does not reverse completed Reddit edits or deletions.
