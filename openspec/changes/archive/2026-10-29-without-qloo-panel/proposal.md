# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/166

## Why

The ideas step shows what Qloo decided, but not what it adds: a merchant (or a judge) can't tell Qloo's grounded themes from what a language model would write on its own. The offline ablation (`packages/core/src/evals/qloo-ablation.eval.ts`) measures exactly that, but its report was never committed or shown. It also aborted whenever one cross-domain call failed, and Qloo's search returns entities its own insights refuse as signals ("All of the provided signal.interests.entities were invalid" for the Pickleball video games, tried live on 2026-10-29), so the eval could not complete.

## What Changes

- The ablation report (`qloo-ablation.report.v1.json`) is committed, from a run on Nemotron with the hackathon Qloo server.
- The eval records, per seed, the cross-domain calls Qloo refused (`failedDomains`), which count as no affinities for that seed, instead of aborting. A failed theme call still fails the eval.
- The ideas step shows a greyed "Without Qloo" panel under the ideas: for each arm, the share of themes grounded in a Qloo tag, the share Qloo explains, the taste domains and the style cues, and the seeds' themes side by side. It reads the committed report through `@wovain/core/ablation-report`; it makes no call.

## Capabilities

### Modified Capabilities

- `qloo-taste`: the offline ablation records refused domains, and its report shows on the ideas step.
