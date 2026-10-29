# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/132

## Why

Clicking "Scan now" only shows a toast. The scan runs in the background for a minute or two, and nothing on the page says it is running, when it ends or what it found. A second click inside the 6-hour limit is dropped without a word.

## What Changes

- The button goes pending ("Scanning…", disabled) while the scan runs.
- The suggestions area shows "Scanning, started 10 s ago" and a skeleton, then the result inline ("Scan finished: 2 new suggestions" or "Nothing new this time"). A request that fails shows its error inline.
- The page polls the autopilot log every 3 s (every 15 s after 3 minutes) until a scan newer than the request is saved. The log returns `lastScanAt` for this.
- A request inside the 6-hour limit isn't sent. The page says when the last scan ran and when the next can.
- The toast only announces completion.

## Capabilities

### Modified Capabilities

- `autopilot-triggers`: "Scan now" progress.

## Impact

`packages/api/src/flow/autopilot.ts` (scan request and log), `apps/web` autopilot log, messages in en, es and fr.
