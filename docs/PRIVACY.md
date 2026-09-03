# Privacy

Reddit Toolbox is local-first.

## Stored locally

The script stores only interface and cleanup settings through Tampermonkey storage, or browser local storage when the userscript APIs are unavailable.

## Kept in memory

Profile results, imported CSV rows, review plans, random replacement strings, active progress, and run outcomes remain in the current tab's memory. Reloading the page clears them and prevents an active cleanup from resuming silently.

## Explicit exports

**Export selected content** creates a local JSON backup of the reviewed targets. **Export run log** creates a local JSON ledger with status and error details. The user chooses whether and where to save these files.

## Network boundary

The included adapter sends only the Reddit requests needed to identify the signed-in account, list its content, verify ownership, edit, delete, and verify results. It rejects non-`reddit.com` request origins. There is no analytics endpoint, telemetry service, credential collector, or remote control service.

Reddit still receives and records normal account activity performed through its service. Overwriting and deleting content does not guarantee removal from third-party archives, search caches, screenshots, quotes, backups, or prior data copies.
