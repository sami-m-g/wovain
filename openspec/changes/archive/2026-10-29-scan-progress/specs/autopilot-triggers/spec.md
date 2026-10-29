# Spec Delta

## ADDED Requirements

### Requirement: Scan now shows progress

After "Scan now", the button SHALL be pending and disabled while the background scan runs, the page SHALL show how long ago the scan started, and SHALL show the result or the error inline when it ends. The page SHALL poll until a scan newer than the request is saved. A request inside the 6-hour limit SHALL NOT be sent, and the page SHALL say when the next scan can run. A toast SHALL only announce completion.

#### Scenario: Scan with news

- **WHEN** the designer clicks "Scan now" and the scan finds two new suggestions
- **THEN** the page shows "Scanning, started N s ago" while it runs, then "Scan finished: 2 new suggestions" inline, with one toast

#### Scenario: Too soon

- **WHEN** the designer clicks "Scan now" two hours after their last manual scan
- **THEN** no scan is requested and the page says when the next one can run
