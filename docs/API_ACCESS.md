# Existing Reddit session

RC4 runs directly inside the Reddit page using the account already signed in to that tab. There is no OAuth registration, consent popup, client ID, API key, client secret, password field, or external service to configure.

## Use

1. Install or update Reddit Toolbox and reload **www.reddit.com**.
2. Sign in normally. Open **RT**, choose a scope, and select **Scan history**.
3. Review the detected account and selected items, confirm the batch, and run it.

**Check Reddit login** is optional; scanning, preparing, running, and resuming all check the session themselves. **Clear loaded history** removes the local scan, imports, and review without signing you out of Reddit. A failed login check invalidates a prepared batch. An account change requires fresh history and review.

## Request model

The script sends same-origin requests with the browser's normal login credentials. It reads the signed-in username and Reddit's session action token (modhash) from /api/me.json; the token is held in tab memory and supplied with edits/deletions. The script never reads or copies raw cookies and never asks for a token to be pasted.

History comes from the account's comments/submitted JSON listings. Item checks use /api/info.json; editable bodies use /api/editusertext; deletion uses /api/del. Every mutation remains bound to the reviewed account and exact item, with ownership and saved-text verification.

This is an unofficial integration with Reddit's website session endpoints. It depends on the logged-in website continuing to accept those requests; a fixture test cannot establish live compatibility. It is not a claim of Reddit endorsement or API approval.

## If a request fails

- Expired login or missing session action token: refresh the page, sign in normally, then prepare again.
- Account changed: return to the reviewed account or load fresh history for the new account.
- Forbidden request, challenge, or unrecognized response: check Reddit's page notice. The batch pauses.
- Rate limit: the runner waits for Reddit's supplied interval. Uncertain mutations are read back instead of blindly resent.

All destructive actions use **www.reddit.com**, where an exclusive Web Lock prevents concurrent batches. Other supported Reddit origins can show the panel and review archives; the panel links to the canonical site for cleanup. No cross-origin userscript network permission is requested.
