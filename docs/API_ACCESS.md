# Reddit API access

Checked against primary sources on 2026-09-03.

- Reddit's [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy), updated June 5, 2026, requires explicit approval before API data access. It directs developers whose use case is unsupported by Devvit to the linked support process.
- The [Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki), updated May 11, 2026, requires registered OAuth authentication. It warns that legacy technical documentation may be outdated.
- The [Data API Terms](https://redditinc.com/policies/data-api-terms) require the access information supplied by Reddit and prohibit masking OAuth identity or access methods.

The session/modhash adapter is not an accepted production connection. The application does not instantiate it by default. Synthetic tests inject it explicitly with intercepted responses; no Reddit data or credentials are used in that acceptance.

## Required before connection work can be accepted

The maintainer must supply the approval status for this specific personal-cleanup use case, the registered public/installed client ID, and its redirect URI. None is currently configured. A client secret, password, cookie, or pasted access token must not be supplied.

Implement the approved flow behind the existing adapter contract. Keep credentials out of ordinary preferences and logs, validate state, request only the necessary identity/history/read/edit scopes, handle expiry and revocation, and bind the connected account to review. Reconnection must not silently resume a batch. The connected OAuth identity must also be checked against the current tab account before a new mutation.

Reddit's [legacy OAuth documentation](https://github.com/reddit-archive/reddit/wiki/OAuth2) describes installed clients without a secret. It does not establish current PKCE support or approval of a userscript redirect. Confirm those details for the registered app before selecting and accepting a flow; do not invent support or substitute a private client.

## Disposable acceptance

After API approval and the adapter are ready, obtain one exact owner-approved disposable batch: account, fullnames, content types, and direct-delete permission. Begin with two comments and observe automatic advancement after one batch confirmation. Creating test content also requires approval of the text and location. Account-history deletion is not authorized by implementation work.

Current acceptance uses only synthetic fixtures. No live account scan, edit, delete, content creation, OAuth consent, or platform approval is claimed. Do not publish another release or enable live access until the remaining checklist is satisfied.
