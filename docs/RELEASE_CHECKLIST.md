# Release verification

## Automated checks

Run npm ci and npm run check to build the userscript, run the Node tests, and check version, syntax, source composition, and SHA-256 consistency. Commit the userscript and checksum with source changes.

The suite covers selection and account binding, ownership checks, overwrite verification, deletion markers, uncertain results, cooldowns, cross-tab locking, archive parsing, and panel controls.

For isolated browser checks:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium firefox
npm run test:browser
npm run test:pacing
```

Browser fixtures intercept all requests and use synthetic content. The batch fixtures accelerate the scheduler; the pacing fixture uses real clocks. Neither uses a personal browser profile. Evidence defaults to artifacts/browser. Existing installations can use REDDIT_TOOLBOX_PLAYWRIGHT_MODULE and REDDIT_TOOLBOX_BROWSER_OUTPUT.

## Verified baseline

RC7 passed 99 Node tests and the Chromium/Firefox fixtures. Its real-clock fixture observed request intervals of 7,501, 7,503, and 7,501 milliseconds across four reads, including a second tab. Saved zero-delay preferences did not accelerate requests.

An installed Chrome RC7 scan observed five successful reads separated by 7,502, 7,502, 7,500, and 7,501 milliseconds, with no speed controls. A live 344-comment batch was observed through 243 confirmed deletions with zero failed, unconfirmed, or skipped results. Its original tab was later unavailable. A fresh scan found 97 comments remaining, so the 344-item run is not recorded as a complete pass.

The owner-authorized 97-comment batch completed on installed RC7 on September 6, 2026 at 09:19:55 UTC: 97 deleted, zero remaining, failed, unconfirmed, or skipped. A fresh tab independently scanned the same account with comments enabled, posts disabled, all time, no limit, and no exclusion filters. It found zero profile-visible comments. This does not establish lifetime listing completeness.

## RC8 release gate

- [x] 99 Node tests, build integrity, and isolated Chromium/Firefox checks pass for the RC8 artifact.
- [x] The authorized 97-comment run completes with 97 deleted and zero remaining, failed, unconfirmed, or skipped.
- [x] A fresh read-only history scan checks for remaining comments: zero found.
- [ ] Public userscript and checksum match the released artifact; CI passes.

RC8 changes documentation and the pre-run tab reminder; the mutation and pacing code is unchanged. Live acceptance on RC7 does not prove installation of RC8. Live post deletion, interruption recovery, and fresh Firefox installation remain unverified.

RC8 artifact: 152,493 bytes; SHA-256 a0c6839d80a75752e48e41bb4c968253d08641dc7a03511f44d288f495be588e.
