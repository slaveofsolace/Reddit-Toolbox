# Reference tools and provenance

## Resource brief

Use established cleanup tools to check discovery, dry-run review, exclusion, pacing, and overwrite/delete semantics. The deliverable remains one dependency-free Tampermonkey script with the existing Toolbox Family engine. Acceptance requires exact reviewed targets, current-account ownership, verified saved text, and no blind mutation resends.

## Reference registry — 2026-09-05

| Candidate | Identity and rights evidence | Decision |
| --- | --- | --- |
| Andrew Banchich's Shreddit | [Repository at 8b14b04](https://github.com/andrewbanchich/shreddit/tree/8b14b04ce522658dea918127a8d2cc4370037f14); [MIT license](https://github.com/andrewbanchich/shreddit/blob/8b14b04ce522658dea918127a8d2cc4370037f14/LICENSE), copyright 2023 Andrew Banchich | Metadata/license verified; behavior reference only. Rust CLI and its password-based credential setup do not fit the userscript runtime. |
| Original Shreddit link | The maintained Rust project's README links to an older implementation; the original location did not resolve during this check | Unavailable; no acquisition or dependency. |
| Insta Toolbox DM Unsend | Existing project handoff and this repository's RC2 batch engine | Reference its floating launcher, movable panel, resizing, and single-start batch interaction. No changes to the separate Instagram product. |

Shreddit reference inspection covered its README, `src/sources/gdpr.rs`, and `src/things/comment.rs` at the pinned revision. Useful behavior: explicit archive filenames, dry-run selection, item exclusions, and retaining archive comments when a requested score filter cannot be evaluated. These informed RC3's disconnected archive review, per-item batch exclusion, and unknown-score protection. All selected rows can be reviewed through pagination.

RC5 also inspected the local Insta Toolbox userscript pointer controls as a behavioral reference. Its window controller is original code. Reddit’s [archived deletion handler](https://github.com/reddit-archive/reddit/blob/master/r2/r2/controllers/api.py) provides historical context for acknowledgement/no-op responses; it is not treated as a current website contract. Current response shapes are independently validated by the adapter.

No third-party code, assets, binaries, packages, or scripts were imported, executed, or redistributed. Acquisition, archive scanning, candidate integration, and redistribution stages are therefore not applicable. The implementation is original work in the existing repository; this registry credits references rather than claiming their code was incorporated. No third-party logo or UI artwork is used.

The existing engine retains stricter result verification and account binding. A tool's popularity or license does not establish Reddit approval or validate current endpoint behavior. The current product uses the [existing browser session](API_ACCESS.md); it does not copy Shreddit’s credential setup.
