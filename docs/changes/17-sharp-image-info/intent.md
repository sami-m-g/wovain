# Intent: Replace the hand-rolled image header parser with sharp

Issue: #17

## Problem

`apps/server/src/lib/image.ts` parses PNG, JPEG and WebP headers by hand in 97 lines of bit fields. PNG transparency is found by searching the whole file for the text "tRNS", which can match bytes inside the image data.

## Desired outcome

`sharp(bytes).metadata()` reads the format, size and alpha. The manual parsing is gone and `put_artwork`'s checks behave as before.

## Constraints

- `sharp` is native: pin the exact version, add it to `allowBuilds`, and make sure App Hosting's Linux build gets the right prebuilt binary.
- Untrusted bytes still only reach PNG, JPEG and WebP parsing.
- No resizing or converting.

## Open questions

None. The owner approved the issue for work.
