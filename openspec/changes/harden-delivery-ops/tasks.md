# Tasks

## 1. Status domain (!112)

- [x] 1.1 Cloud Run domain mapping for `status.wovain.com`
- [x] 1.2 Host rewrite to GitLab Pages in the web app
- [ ] 1.3 `pulumi preview` with real config, then merge

## 2. Duo Code Review on every MR (!113)

- [x] 2.1 Trigger on `merge_request` created and on reviewer request
- [ ] 2.2 Merge and confirm a new MR gets a review

## 3. Dependencies (!114)

- [x] 3.1 Renovate policy, validated with `renovate-config-validator`
- [x] 3.2 `deps-review` flow and review rule
- [ ] 3.3 Add a masked read-only `GITHUB_COM_TOKEN` CI variable
- [ ] 3.4 Confirm the flow's service account name after it is enabled

## 4. Custom flows in code (!117)

- [x] 4.1 `enableFlow()` creates a consumer per synced custom flow and adopts existing ones
- [ ] 4.2 Merge, run `pulumi up` through CI, confirm `heal` and `deps-review` triggers

## 5. Close

- [ ] 5.1 Archive this change when all four MRs are merged
