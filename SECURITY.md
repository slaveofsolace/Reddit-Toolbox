# Security

## Supported version

Security fixes currently target `1.0.0-rc.6` until a stable release replaces it.

## Reporting

Do not post account data, archive files, session values, or access tokens in a public issue. Use a private GitHub security advisory for vulnerabilities that could expose data or mutate the wrong content.

## Safety boundaries

- Session requests stay on the current supported HTTPS Reddit origin, include the existing login, reject redirects, and have a bounded deadline. The action token remains in memory; failed session refreshes clear cached credentials. No passwords, raw cookies, or OAuth credentials are collected.
- A finite batch is bound to exact Reddit fullnames, ordered targets, editability, and destructive options.
- The explicit Delete button authorizes the reviewed batch; no item is added after starting.
- The active Reddit account is revalidated before every item, then ownership is checked before mutation.
- Editable content must pass overwrite verification before deletion.
- Deletion requires a deleted marker, or an acknowledged deletion of a verified owned item followed by two valid absent-item reads. A comment’s verified owner changing to [deleted] after an acknowledged deletion also confirms the result when Reddit keeps [removed] as the body. Missing data or moderation removal alone never proves deletion.
- Ambiguous edit results are verified before retry, and the same replacement is reused.
- Ambiguous delete results are counted separately and are not blindly resent, including lost responses and HTTP 5xx results. Other items continue; later rechecks perform reads only and revalidate the account.
- An acknowledged no-op may receive one bounded retry after repeated reads and fresh account, ownership, editability, and replacement checks.
- Link and media posts are skipped unless direct deletion is explicitly reviewed.
- Requests are sequential and paced even though the full batch is automated.
- Rate limits and temporary failures recover automatically; repeated failures trigger an attention pause.
- A Web Locks exclusive lock prevents concurrent batches across tabs on www.reddit.com. Missing lock support blocks execution; there is no in-page fallback.
- Active runs warn before navigation and are never restored or resumed silently after reload.
- The script does not read raw cookies, collect passwords, use remote code, or use dynamic evaluation.

This project cannot remove copies held outside Reddit or guarantee how Reddit retains data internally.
