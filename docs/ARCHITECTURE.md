# Architecture

Reddit Toolbox is the first product built on the extracted Toolbox Family core.

```text
src/core/       platform-neutral selection, reviewed plans, automated batches, storage, CSV, and errors
src/reddit/     Reddit content model, session adapter, scanner, and overwrite/delete workflow
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

- each exact Reddit fullname;
- content kind and editability;
- whether direct deletion is allowed;
- overwrite verification and replacement length;
- continuation and consecutive-failure policy.

After the user types the single plan confirmation, one `BatchRunner.run(plan)` call processes every queued item. The user does not confirm, click, or advance individual rows.

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

A browser Web Locks request prevents another tab from acquiring the Reddit Toolbox cleanup lock while a batch is active. An in-page fallback prevents duplicate runners in environments without Web Locks.

## Per-item lifecycle

Before each selected item, the service re-fetches the signed-in Reddit session and checks that the account still matches the account that started the batch.

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

The removal service retains per-fullname mutation state for the life of the page. A retry batch therefore reuses the original replacement and delete-sent state rather than blindly repeating an ambiguous operation.

## Recovery behavior

- Reddit rate limits cause an automatic wait for the supplied retry interval, then the same item resumes.
- Retryable transport or server failures use bounded automatic backoff.
- An isolated permanent item failure is recorded and the next item starts automatically.
- Five consecutive failures pause the batch for operator review.
- Authentication changes, account changes, challenges, forbidden requests, and uncertain delete results pause the batch.
- Stop finishes the current in-flight item boundary, marks untouched items as stopped, and allows one retry batch to be prepared.
- Reloading never reconstructs or resumes an active destructive run.

## Adapter contract

The current Reddit adapter provides:

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

A lost response or HTTP 5xx after an edit or delete is ambiguous. After an edit, the service checks whether the original replacement was saved before another edit is allowed. After a delete, it records that the request may have been sent and verifies the final state. It never sends that deletion a second time automatically. If deletion cannot be proven, the batch pauses.

## Build

`scripts/source-order.mjs` is the source-order manifest. The build concatenates metadata and source into one auditable userscript. Tests load the same modules in isolated JavaScript contexts. The integrity check parses the final userscript and rejects dynamic evaluation.

## Adding another toolbox

A new product should keep `src/core` unchanged where practical and add:

1. A normalized platform content model.
2. A narrow identity, discovery, mutation, and verification adapter.
3. A platform-specific removal service.
4. A product UI that exposes finite scope, review, one batch confirmation, progress, pause, stop, and recovery.

Do not weaken the family invariants: exact targets, finite plans, one explicit batch authorization, account binding, no silent resume, no rate-limit bypass, and verified destructive outcomes.
