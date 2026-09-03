# Privacy

Reddit Toolbox is local-first.

## Stored locally

The script stores only interface and cleanup settings through Tampermonkey storage, or browser local storage when the userscript APIs are unavailable.

## Kept in memory

Profile results, imported CSV rows, review plans, random replacement strings, active progress, and run outcomes remain in the current tab's memory. Reloading the page clears them and prevents an active cleanup from resuming silently.

## Explicit exports

**Export selected content** creates a local JSON backup containing the account and reviewed content. **Export run log** creates a sanitized local ledger with ordinal item numbers, type, status, and error codes. It excludes usernames, content IDs, subreddit names, permalinks, original text, and replacements. The user chooses whether and where to save these files.

## Network boundary

The default live connection is disabled pending approved OAuth access. The provisional adapter remains for synthetic acceptance and rejects requests outside its exact HTTPS Reddit origin, rejects redirects, and bounds request timeouts. Destructive requests are restricted to `www.reddit.com` so the Web Lock covers every supported mutation tab. There is no analytics endpoint, telemetry service, credential collector, or remote control service.

Reddit still receives and records normal account activity performed through its service. Overwriting and deleting content does not guarantee removal from third-party archives, search caches, screenshots, quotes, backups, or prior data copies.
