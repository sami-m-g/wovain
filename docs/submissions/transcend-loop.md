# Transcend: the live DevSecOps loop

One autonomous loop on production, recorded for the GitLab Transcend video: a canary fault, the canary verdict's rollback and release-guard issue, the release-guard Duo flow's diagnosis and fix merge request, Duo Code Review, the merge, and a healthy canary promoted.

This merge request is the demo's bad deploy: its commit carries the `Canary-Demo-Fault` trailer, so `deploy:production` gives the new canary revision (10% of traffic) `FAULT_INJECTION_REVISION=checkout` (AGENTS.md, "How to roll out and roll back"). The timeline, with links, follows in a later merge request.

The first attempt (!183, merge 6a9af70) deployed without the fault: the gcloud image has no git, so the trailer check read nothing, and the healthy canary was promoted. The second attempt (!190, merge 1c7a9a7) read the trailer through the GitLab API with python3, which the image doesn't have on PATH either, so it deployed without the fault too. The third attempt runs the check with gcloud's bundled Python and carries the trailer on its own demo commit.
