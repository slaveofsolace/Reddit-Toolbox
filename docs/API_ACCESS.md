# Existing Reddit session

RC6 runs directly inside the Reddit page using the account already signed in to that tab. There is no OAuth registration, consent popup, client ID, API key, client secret, password field, or external service to configure.

## Use

1. Install or update Reddit Toolbox and reload **www.reddit.com**.
2. Sign in normally. Open **RT**, choose a scope, and select **Find matching items**.
3. Review the detected account and matches, then select **Delete N items**.

**Check login** is optional; scanning and each mutation check the session themselves. Local filter changes update the review without another network setup step. **Clear loaded history** removes the local scan, imports, and review without signing you out of Reddit. A failed login check invalidates a prepared batch. An account change requires fresh history and review.

## Request model

The script sends same-origin requests with the browser's normal login credentials. It reads the signed-in username and Reddit's session action token (modhash) from /api/me.json; the token is held in tab memory and supplied with edits/deletions. The script never reads or copies raw cookies and never asks for a token to be pasted.

History comes from the account's comments/submitted JSON listings. Item checks use /api/info.json; editable bodies use /api/editusertext; deletion uses /api/del. Every mutation remains bound to the reviewed account and exact item, with ownership and saved-text verification.

This is an unofficial integration with Reddit's website session endpoints. It depends on the logged-in website continuing to accept those requests; a fixture test cannot establish live compatibility. It is not a claim of Reddit endorsement or API approval.

## If a request fails

- Expired login or missing session action token: refresh the page, sign in normally, then find matching items again.
- Account changed: return to the reviewed account or load fresh history for the new account.
- Forbidden request, challenge, or unrecognized response: check Reddit's page notice. The batch pauses.
- Unconfirmed deletion: the item is marked for read-only rechecking while the next item proceeds. Missing data alone never proves deletion. See [recovery semantics](ARCHITECTURE.md#uncertain-outcomes).
- Rate limit: the runner waits for Retry-After or x-ratelimit-reset. An exhausted allowance prevents further requests until reset. Initial and resumed batch identity checks use this same automatic recovery path. Uncertain mutations are read back instead of blindly resent.

All destructive actions use **www.reddit.com**, where an exclusive Web Lock prevents concurrent batches. Other supported Reddit origins can show the panel and review archives; the panel links to the canonical site for cleanup. No cross-origin userscript network permission is requested.
