# Userscript connection

The product is one Tampermonkey script. RC3 includes a public installed-app OAuth connection in the script; no hosted callback, companion server, password, or client secret is used.

## Setup

1. Obtain Reddit API approval for the own-account cleanup use case and an **installed app** public client ID. A confidential script/web app is not interchangeable.
2. Register this exact redirect for that app:

   https://www.reddit.com/?reddit-toolbox=oauth-callback

3. On **www.reddit.com**, open RT → **Connect Reddit**, enter the public client ID, and connect.
4. Review Reddit's consent screen. Return to the original tab after authorization and check the connected username.
5. Scan or import, prepare a fresh batch, and review its account and targets before confirming.

Approval of this use case and redirect has not been established for this project. The documented installed-app code flow is implemented and fixture-tested; current Reddit acceptance of the registered app/redirect must be verified with the actual app. A working local fixture is not platform approval.

## Implementation

The authorization code flow requests only identity, history, read, and edit scopes. A cryptographically random state, exact Reddit origin, and exact popup source are checked. The callback immediately removes code/state from its URL. The original tab exchanges the one-use code directly with Reddit using the public client ID and an empty installed-app secret.

Access/refresh tokens live in private in-memory fields. API calls use cookie-free Tampermonkey requests to oauth.reddit.com. A separate same-origin identity read checks the current Reddit page account against the OAuth account; reviewed account changes pause mutations. Token renewal happens before expiry. Reconnecting does not press Resume or start another batch.

Disconnect clears tokens and loaded history. It does not revoke Reddit's grant; revoke that separately in Reddit's authorized-app preferences if desired. Reload clears the connection and all destructive run authority. The public client ID is the only saved connection value.

The legacy session/modhash adapter remains a fixture adapter and supplies the same-origin identity read. It is never the production mutation fallback. Invalid destinations, operations, redirects, missing scopes, unavailable userscript permissions, and expired/revoked authorization produce actionable errors.

## Primary sources checked 2026-09-05

- [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy): explicit API approval and respect for access limits.
- [Reddit OAuth documentation](https://github.com/reddit-archive/reddit/wiki/OAuth2): installed clients without a secret, authorization code exchange, refresh, state, and scopes. This is legacy documentation; no PKCE support is asserted.
- [Tampermonkey documentation](https://www.tampermonkey.net/documentation.php): narrow connection grants and userscript requests.

Live account verification and deletion acceptance remain pending. The owner has authorized testing their own content; choose an exact small batch when a working authorized connection is available and observe overwrite, read-back, deletion, and automatic advancement.
