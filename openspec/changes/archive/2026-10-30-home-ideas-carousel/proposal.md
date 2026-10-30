# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/292

## Why

Each idea card on the Home is about 620 px tall, so five of them stack to several screens before the drops in progress and the results.

## What Changes

- "What sells now" shows one card at a time in the shadcn Carousel (Embla, added with the shadcn CLI): previous and next buttons, keyboard arrows, swipe, "2 of 5" read out politely, labelled slides, no glide with reduced motion.
- The drop's ideas step keeps its list: there the merchant picks several ideas and compares them, which a one-at-a-time view would hide.

## Capabilities

### Modified Capabilities

- `app-ui`: the Home's ideas, one at a time.
