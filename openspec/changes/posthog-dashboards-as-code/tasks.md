# Tasks

## 1. Dashboards and alerts as code (!115)

- [x] 1.1 Four dashboards and 29 insights in `infra/posthog/dashboards.ts`
- [x] 1.2 Three KPIs with `kpi:<id>` alerts in `kpis.yml` and `infra/posthog/program.ts`
- [x] 1.3 `infra/posthog/import.json` for the API-created objects
- [ ] 1.4 Merge; run the one-time `pulumi import`, then check `pnpm infra:preview` shows updates and creates, no deletes
- [ ] 1.5 Run `pnpm infra:up`, then delete `import.json` in a follow-up

## 2. Missing events

- [ ] 2.1 `run_completed` and `run_failed` with duration and failed step
- [ ] 2.2 `design_generated` and `design_rejected`
- [ ] 2.3 `campaign_activated` and `provider_disconnected`
- [ ] 2.4 Subscription and credit events (with `add-polar-billing`)
- [ ] 2.5 `agent_score` (with `migrate-runs-to-mastra`)

## 3. Close

- [ ] 3.1 Archive this change when !115 is merged and the events ship
