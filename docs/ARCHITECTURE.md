# Architecture

Reddit Toolbox is the first small product built on the extracted Toolbox Family core.

```text
src/core/       platform-neutral planning, filtering, pacing, storage, CSV, and errors
src/reddit/     Reddit content model, session adapter, scanner, and removal workflow
src/ui/         Reddit Toolbox presentation and interaction layer
src/main.js     product bootstrap
```

`ToolboxFamily.Core` is the canonical runtime namespace. `RedditToolbox.Core` aliases it so the product remains self-contained while future toolbox projects can reuse the same modules.

## Extracted family concepts

The extraction keeps the useful boundaries from Insta Toolbox without carrying Instagram-specific account or DOM logic:

| Family concern | Reddit Toolbox implementation |
| --- | --- |
| Normalize external records | `src/reddit/model.js` |
| Select a finite target set | `src/core/filters.js` |
| Bind review to exact targets | `src/core/plan.js` |
| Execute sequentially with pacing | `src/core/runner.js` |
| Separate platform calls | `src/reddit/api.js` |
| Verify destructive outcomes | `src/reddit/removal-service.js` |
| Persist only safe preferences | `src/core/storage.js` |
| Present Review → Confirm → Run | `src/ui/app.js` |

## Adapter contract

A content-removal adapter is expected to provide these operations:

```text
getSession()                    identify the signed-in account
listUserContent(kind, cursor)   return normalized content and the next cursor
verifyOwnership(fullname)       bind the target to the current account
edit(fullname, text)            save replacement text
verifyText(fullname, expected)  confirm the overwrite
remove(fullname)                platform deletion operation
isDeleted(fullname)             verify the final state
```

The Reddit client names its deletion method `delete`. The removal service is the only layer that coordinates these operations.

## Destructive lifecycle

For an editable comment or self-post:

```text
ready
  → ownership verified
  → random replacement generated
  → edit sent
  → settle delay
  → overwrite verified
  → delete sent
  → deletion verified
  → completed
```

For a link or media post, the item is skipped by default. Direct deletion requires an explicit option in the reviewed plan.

A plan digest includes the ordered fullnames, content types, editability, and destructive options. Changing any bound field invalidates the plan. Runs are sequential and in-memory only.

## Uncertain outcomes

A lost response or HTTP 5xx result after an edit or delete request is treated as ambiguous. After an edit, the service checks whether the original replacement was saved before retrying and reuses that replacement if another edit is required. After a delete, it records that deletion may have been sent, checks the final state, and never sends the deletion a second time automatically. If the final state cannot be proven, the runner pauses for manual inspection.

## Build

`scripts/source-order.mjs` is the single source-order manifest. The build concatenates metadata and source into one auditable userscript. Tests load the same source order in an isolated JavaScript context, and the integrity check parses the final build and rejects dynamic evaluation.

## Adding another toolbox

A new product should keep `src/core` unchanged where possible and add:

1. A normalized platform content model.
2. A narrow adapter implementing identity, discovery, mutation, and verification.
3. A removal workflow that defines safe platform-specific transitions.
4. A product UI that always exposes scope, review, explicit confirmation, progress, pause, stop, and export.

Platform work must not weaken the family invariants: exact targets, bounded plans, no silent resume, no rate-limit bypass, and verified outcomes.
