# Security

## Supported version

Security fixes currently target `1.0.0-rc.1` until a stable release replaces it.

## Reporting

Do not post account data, archive files, session values, or access tokens in a public issue. Use a private GitHub security advisory for vulnerabilities that could expose data or mutate the wrong content.

## Safety boundaries

- The adapter accepts only `reddit.com` origins.
- Every target uses a strict Reddit fullname and exact content type.
- Ownership is checked against the signed-in account before mutation.
- Editable content must pass overwrite verification before deletion.
- Deletion is verified after the request.
- Ambiguous edit results are verified before retry, and the same replacement is reused.
- Ambiguous delete results pause and are not resent automatically, including lost responses and HTTP 5xx results.
- Link and media posts are skipped unless direct deletion is explicitly reviewed.
- Runs are sequential, paced, stoppable, and never restored after reload.
- The script does not read raw cookies, collect passwords, or use dynamic code evaluation.

This project cannot remove copies held outside Reddit or guarantee how Reddit retains data internally.
