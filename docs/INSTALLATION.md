# Installation

## Install the userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) for a supported desktop browser.
2. Chrome users must open `chrome://extensions/?id=dhdgffkkebhmkfjojejmpbldmpobfkfo` and enable **Allow User Scripts**.
3. Open [reddit-toolbox.user.js](https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js).
4. Review the Tampermonkey metadata, then select **Install**.
5. Sign in to Reddit and reload the tab.
6. Select the orange **RT** launcher. The Tampermonkey menu also includes **Open Reddit Toolbox**.

## Prepare complete history

The profile scan is useful for currently available history. For a broader cleanup:

1. Request your Reddit data from `https://www.reddit.com/settings/data-request`.
2. Download and extract the archive when Reddit makes it available.
3. In Reddit Toolbox, choose **Import archive CSV**.
4. Select `comments.csv`, `posts.csv`, or both.

The archive is read locally. Reddit Toolbox does not upload the CSV files.

## First cleanup

1. Start with a small amount, such as one disposable comment.
2. Build the preview and inspect the target, content type, subreddit, and date.
3. Export the selected content before deleting anything important.
4. Type the exact confirmation phrase shown by the tool.
5. Keep the tab open during the run. Use **Pause** or **Stop** when needed.

Link and media posts have no editable body. They are skipped unless **Delete link/media posts directly** is enabled.

## Update

Tampermonkey checks the userscript's `@updateURL`. Installing a newer build replaces the existing RC1 copy.

## Remove

Open the Tampermonkey dashboard and delete **Reddit Toolbox**. Removing the script does not reverse completed Reddit edits or deletions.
