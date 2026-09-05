# Security

## Supported version

Security fixes currently target `1.0.0-rc.3` until a stable release replaces it.

## Reporting

Do not post account data, archive files, session values, or access tokens in a public issue. Use a private GitHub security advisory for vulnerabilities that could expose data or mutate the wrong content.

## Safety boundaries

- OAuth accepts only exact www.reddit.com and oauth.reddit.com destinations and the documented cleanup operations. Tokens stay in private memory; no secrets or passwords are collected.
- A finite batch is bound to exact Reddit fullnames, ordered targets, editability, and destructive options.
- One explicit confirmation authorizes the reviewed batch; no item is added after confirmation.
- The active Reddit account is revalidated before every item, then ownership is checked before mutation.
- Editable content must pass overwrite verification before deletion.
- Deletion is verified after the request.
- Ambiguous edit results are verified before retry, and the same replacement is reused.
- Ambiguous delete results pause and are not resent automatically, including lost responses and HTTP 5xx results.
- Link and media posts are skipped unless direct deletion is explicitly reviewed.
- Requests are sequential and paced even though the full batch is automated.
- Rate limits and temporary failures recover automatically; repeated failures trigger an attention pause.
- A Web Locks exclusive lock prevents concurrent batches across tabs on www.reddit.com. Missing lock support blocks execution; there is no in-page fallback.
- Active runs warn before navigation and are never restored or resumed silently after reload.
- The script does not read raw cookies, collect passwords, use remote code, or use dynamic evaluation.

This project cannot remove copies held outside Reddit or guarantee how Reddit retains data internally.
