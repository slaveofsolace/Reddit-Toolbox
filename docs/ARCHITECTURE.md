# Architecture

Reddit Toolbox is the first product built on the extracted Toolbox Family core.

```text
src/core/       platform-neutral selection, reviewed plans, automated batches, storage, CSV, and errors
src/reddit/     Reddit content model, same-origin session adapter, scanner, and overwrite/delete workflow
src/ui/         Reddit Toolbox presentation and batch controls
src/main.js     product bootstrap
```

`ToolboxFamily.Core` is the canonical runtime namespace. `RedditToolbox.Core` aliases it so the userscript stays self-contained while future toolbox products can reuse the same modules.

## Family boundaries

| Concern | Implementation |
| --- | --- |
| Normalize external records | `src/reddit/model.js` |
| Select a finite target set | `src/core/filters.js` |
| Bind review to exact targets and options | `src/core/plan.js` |
| Execute the complete queue automatically | `src/core/runner.js` |
| Isolate platform requests | `src/reddit/api.js` |
| Coordinate overwrite and deletion | `src/reddit/removal-service.js` |
| Persist only safe preferences | `src/core/storage.js` |
| Present Scope → Review → Confirm once → Automate | `src/ui/*` |

## Automated batch model

A reviewed plan has `mode: automated-batch` and contains a fixed ordered list. Its digest includes:

- the account selected during review;
- each exact Reddit fullname;
- content kind and editability;
- whether direct deletion is allowed;
- overwrite verification and replacement length;
- continuation and consecutive-failure policy.

After the user types the single plan confirmation, one `BatchRunner.run(plan)` call processes every queued item. The user does not confirm, click, or advance individual rows.

The short digest is a display identifier. Validation also compares the complete canonical binding retained in a private in-memory map, so digest collisions cannot authorize a different batch. Target snapshots and execution options are frozen when execution begins. Deserialized plans are not authorized after reload.

Requests remain sequential. Automation means hands-off orchestration, not concurrent destructive calls.

### Batch states

```text
ready
  → running
  ↔ waiting       pacing, retry backoff, or Reddit rate limit
  ↔ paused        user pause or explicit attention requirement
  → stopping      finish the current operation safely
  → stopped | completed
```

The runner publishes whole-batch progress, current item, item phase, processed count, remaining count, failures, and wait countdowns. Closing the toolbox panel does not stop the active JavaScript run. The compact launcher displays progress and signals attention.

A browser Web Locks request prevents another tab on the same origin from acquiring the cleanup lock while a batch is active. Because these locks do not span subdomains, all destructive requests require `www.reddit.com`. Missing Web Locks support blocks execution. There is no page-only fallback that could silently permit a second tab.

## Per-item lifecycle

Before each selected item and each new mutation, the service revalidates the account against the account captured during review. Ownership and live editability are checked again at mutation boundaries. After a pause, the replacement is read again immediately before deletion.

For an editable comment or self-post:

```text
session revalidated
  → ownership verified
  → random replacement generated
  → edit sent
  → settle delay
  → overwrite verified
  → delete sent
  → deletion verified
  → completed
```

For a link or media post, the item is skipped by default. Direct deletion requires an explicit option in the reviewed batch.

The removal service retains per-account, per-fullname mutation state for the life of the page, including across fresh reviews. A retry batch reuses the original replacement and delete-sent state rather than blindly repeating an ambiguous operation. Completed entries cannot be accidentally sent again by preparing a fresh review in the same page.

## Recovery behavior

- Reddit rate limits cause an automatic wait for the supplied retry interval, then the same item resumes.
- Retryable transport or server failures use bounded automatic backoff.
- An isolated permanent item failure is recorded and the next item starts automatically.
- Five consecutive failures pause the batch for operator review.
- Authentication changes, account changes, challenges, forbidden requests, and uncertain delete results pause the batch.
- Stop finishes the current in-flight item boundary, marks untouched items as stopped, and allows one retry batch to be prepared.
- Reloading never reconstructs or resumes an active destructive run.

## Adapter contract

The production UI instantiates `RedditSessionClient` directly. It uses the existing browser login and a same-origin identity/action-token read; there is no OAuth adapter or setup gate. All requests include normal browser credentials, reject redirects, and have a bounded deadline. See [session access](API_ACCESS.md).

```text
getSession()                       identify the signed-in account
assertSession(expectedUsername)    revalidate account and action token
listUserContent(kind, cursor)      return normalized content and the next cursor
verifyOwnership(fullname)          bind the target to the expected account
edit(fullname, text)               save replacement text
verifyText(fullname, expected)     confirm the overwrite
remove/full delete(fullname)       platform deletion operation
isDeleted(fullname)                verify the final state
```

`RedditRemovalService` is the only layer that coordinates destructive transitions. `BatchRunner` knows nothing about Reddit and can be reused by another toolbox.

## Uncertain outcomes

A lost response, malformed response, or HTTP 5xx after an edit or delete is ambiguous. After an edit, the service reads back the original replacement. If that cannot be verified, it pauses without resending. After a delete, it records that the request may have been sent and verifies the final state. It never sends that deletion a second time automatically. Missing, malformed, or mismatched item listings do not prove deletion. Unresolved results pause for attention.

## Build

`scripts/source-order.mjs` is the source-order manifest. The build concatenates metadata and source and writes its SHA-256 checksum. Tests cover both individual modules and the complete generated script. Integrity checks compare the exact source composition, metadata version, and checksum, parse the script, and reject dynamic evaluation. CI rejects uncommitted generated-script or checksum changes.

## Adding another toolbox

A new product should keep `src/core` unchanged where practical and add:

1. A normalized platform content model.
2. A narrow identity, discovery, mutation, and verification adapter.
3. A platform-specific removal service.
4. A product UI that exposes finite scope, review, one batch confirmation, progress, pause, stop, and recovery.

Do not weaken the family invariants: exact targets, finite plans, one explicit batch authorization, account binding, no silent resume, no rate-limit bypass, and verified destructive outcomes.
