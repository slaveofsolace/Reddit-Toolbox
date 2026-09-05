# Privacy

Reddit Toolbox runs in your Reddit tab. It has no backend, telemetry, external cleanup service, or remote code dependency.

## Stored locally

Interface preferences (including window and launcher geometry), cleanup preferences, and two anonymous request timing deadlines are saved through Tampermonkey storage, with browser local storage as a fallback. The timing values contain no account, content, endpoint, or session data; they prevent reloads and other toolbox tabs from restarting at full speed during a cooldown. Old speed preferences are ignored. The obsolete public client ID saved by RC3 is removed.

## Kept in memory

The detected username, Reddit session action token, profile results, imported CSV rows, review plans, random replacements, progress, and run outcomes remain in the current tab. Reload clears them and never resumes cleanup automatically. The script does not read raw cookies, collect passwords, or request OAuth access/refresh tokens. Your normal Reddit login is managed by Reddit and the browser.

**Clear loaded history** removes scans, imports, and the current review. Minimal per-item mutation state is retained until reload so clearing and preparing again cannot blindly resend an uncertain mutation.

## Explicit exports

**Save a copy** creates a local JSON backup containing the account and reviewed content. **Save run log** creates a sanitized local ledger with ordinal item numbers, type, status, and error codes. It excludes usernames, content IDs, subreddit names, permalinks, original text, and replacements. You choose whether and where to save these files.

## Network boundary

Requests go only to the same supported HTTPS Reddit origin as the page and use its existing login. Cleanup is restricted to www.reddit.com so one Web Lock covers all mutation tabs. No cross-origin Tampermonkey request grants are used. Imported archives are parsed locally, not uploaded.

Reddit receives normal account activity performed through its service. Overwriting/deleting does not guarantee removal from third-party archives, search caches, screenshots, quotes, backups, or Reddit's internal retained copies.
