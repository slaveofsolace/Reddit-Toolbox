# Codex handoff

RC4 corrects RC3's connection model: the user explicitly means install-and-run against the existing Reddit browser login, with no OAuth, app registration, client ID, or API key. The production UI now constructs RedditSessionClient directly. Do not restore OAuth as a prerequisite.

The product remains one Tampermonkey userscript. The user explicitly authorized committing the implementation to main and testing deletion of their own Reddit content. Use a small exact batch for live acceptance and verify the script's own flow.

## Current implementation

- Same-origin session identity, history, edits, deletion, and verification; action token in memory; no cross-origin GM network grants.
- Optional login status check and clear-history controls. Failed identity checks invalidate review; account changes require fresh history.
- Signed-out local archive review; signing in and preparing again binds the selection to the current account.
- Paginated review, full text, per-item exclusion, and confirmation reset after changes.
- Frozen account-bound targets; sequential overwrite, exact read-back, deletion, and verification; uncertainty retained across same-tab retries.
- Canonical www.reddit.com execution with mandatory Web Locks, pause/stop, bounded retry/cooldown, and closed-panel progress.
- Unknown archive fields are protected when a corresponding keep filter is active.

Build with npm ci and npm run check. Generated script, metadata/package/lockfile/runtime version, and SHA-256 must agree. See [acceptance evidence](RELEASE_CHECKLIST.md).

## Live acceptance

Implementation e931e72 is committed and pushed to main. Both main workflows passed; the served userscript and checksum match the tested RC4 artifact. Local Node and Chromium/Firefox fixture evidence is recorded in the release checklist.

RC3 was observed installed in the owner's existing Chrome Reddit tab on 2026-09-05. Opening the public RC4 userscript URL reached Tampermonkey's installation bridge, but no Update control was exposed by the browser tool. Reload still showed RC3. The owner was asked to complete the ordinary update, then reply “updated” to continue live testing. No live scan, edit, or deletion was performed in this correction.

Do not treat the earlier rejection of the Chrome extension-manager URL as evidence that no script is installed. That rejected manager action must not be retried or bypassed. After the owner updates, reload the existing tab, verify the RC4 label, then use Scan history directly; do not request a client ID.

Session requests are an unofficial website integration and require actual live compatibility checks. Synthetic tests do not prove current Reddit response behavior. No stable release or perfected live cleanup is claimed before those checks.
