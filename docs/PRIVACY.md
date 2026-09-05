# Privacy

Reddit Toolbox is local-first.

## Stored locally

The script stores only interface and cleanup settings plus the public installed-app client ID through Tampermonkey storage, or browser local storage when the userscript APIs are unavailable.

## Kept in memory

OAuth access/refresh tokens, profile results, imported CSV rows, review plans, random replacement strings, active progress, and run outcomes remain in the current tab's memory. Reloading the page clears them and prevents an active cleanup from resuming silently.

## Explicit exports

**Export selected content** creates a local JSON backup containing the account and reviewed content. **Export run log** creates a sanitized local ledger with ordinal item numbers, type, status, and error codes. It excludes usernames, content IDs, subreddit names, permalinks, original text, and replacements. The user chooses whether and where to save these files.

## Network boundary

Authorization and token exchange use www.reddit.com; authenticated history and cleanup requests use oauth.reddit.com. Tampermonkey requests are cookie-free, restricted to these declared hosts, refuse redirects, and have a bounded deadline. A same-origin identity read checks the signed-in account against the authorized account. Cleanup starts only on www.reddit.com so its Web Lock covers all mutation tabs. There is no analytics, credential-collection, or remote-control service.

Reddit still receives and records normal account activity performed through its service. Overwriting and deleting content does not guarantee removal from third-party archives, search caches, screenshots, quotes, backups, or prior data copies.
