# Architecture

C4-style views of wovain: who uses it and what it talks to (context), then what runs where (containers), then how the code moves from an idea to production (delivery). The code map is in [app-map.html](app-map.html), the records in [data-model.md](data-model.md), and the self-healing loop in [loop.md](loop.md).

## 1. System context

```mermaid
C4Context
  title wovain: system context
  Person(merchant, "Print-on-demand merchant", "Chats with an AI agent to design, publish and advertise a product")
  System_Ext(agent, "AI agent", "ChatGPT, Claude or any MCP client with OAuth")
  System(wovain, "wovain", "MCP server with widgets: design, publish, ads, campaign")
  System_Ext(workos, "WorkOS AuthKit", "Sign-in and OAuth for /mcp")
  System_Ext(fourthwall, "Fourthwall", "The merchant's shop (MCP, OAuth per merchant)")
  System_Ext(fal, "fal", "Video generation (MCP, OAuth per merchant)")
  System_Ext(meta, "Meta Ads", "Campaigns (the agent's Meta Ads MCP) and automated rules (Graph API)")
  System_Ext(nebius, "Nebius Token Factory", "Nemotron 3 Super for judge_design and trend ranking")
  System_Ext(tavily, "Tavily", "Web search for trends, trademarks and the market scout")
  System_Ext(gitlab, "GitLab", "Code, CI/CD, Duo Agent Platform, Observability")

  Rel(merchant, agent, "Chats")
  Rel(agent, wovain, "MCP over streamable HTTP")
  Rel(agent, meta, "Builds the campaign", "Meta Ads MCP")
  Rel(wovain, workos, "Verifies tokens")
  Rel(wovain, fourthwall, "Publishes approved products")
  Rel(wovain, fal, "Generates approved videos")
  Rel(wovain, meta, "Creates the five rules")
  Rel(wovain, nebius, "Model calls")
  Rel(wovain, tavily, "Searches")
  Rel(gitlab, wovain, "Deploys, monitors, fixes")
```

## 2. Containers

```mermaid
C4Container
  title wovain: containers
  System_Ext(agent, "AI agent", "MCP client")
  System_Boundary(gcp, "Google Cloud project wovain (us-central1)") {
    Container(server, "MCP server", "Hono on Node 24, apps/server", "Tools, playbooks, OAuth checks, connect flow; scales to zero on App Hosting")
    Container(widgets, "Widgets", "React MCP Apps, apps/widgets", "Settings, design, ad, campaign; built to single HTML files the server serves")
    ContainerDb(firestore, "Firestore", "Native mode", "Merchants' records under users/{uid}")
    ContainerDb(bucket, "Media bucket", "Cloud Storage", "Staged artwork, private")
    Container(kms, "Cloud KMS", "wovain/connections", "Encrypts merchants' Fourthwall and fal grants")
    Container(secrets, "Secret Manager", "", "API keys for App Hosting")
    Container(logs, "Cloud Logging and Monitoring", "", "Request logs, errors, instance time")
  }
  System_Boundary(gl, "GitLab project showcase") {
    Container(ci, "GitLab CI/CD", ".gitlab-ci.yml", "Verify, scan, pulumi up, deploy, smoke, release; hourly loop, weekly analysis, SCI")
    Container(ops, "Ops jobs", "apps/ops", "Scout, verify, shepherd, weekly analysis, market scout, SCI")
    Container(duo, "Duo Agent Platform", "Built-in flows", "Developer, Code Review, Fix CI/CD")
    Container(o11y, "GitLab Observability", "SigNoz", "Traces and the funnel metric over OTLP")
  }

  Rel(agent, server, "MCP, OAuth bearer")
  Rel(server, widgets, "Serves")
  Rel(server, firestore, "Reads and writes")
  Rel(server, bucket, "Artwork")
  Rel(server, kms, "Encrypt and decrypt grants")
  Rel(server, o11y, "OTLP traces and metrics")
  Rel(server, logs, "stdout and stderr")
  Rel(ci, server, "firebase deploy (Workload Identity Federation)")
  Rel(ops, logs, "Reads errors and metrics (gitlab-ops)")
  Rel(ops, o11y, "Reads error spans and logs")
  Rel(ops, firestore, "Counts (weekly job only, gitlab-analytics)")
  Rel(ops, duo, "Assigns, marks ready, requests review")
  Rel(duo, ci, "Opens merge requests")
```

## 3. Delivery

```mermaid
flowchart LR
  idea["Idea or bug: /capture, scout, market scout"] --> issue["GitLab issue: status::intent"]
  issue -->|"a person accepts"| todo["status::todo"]
  todo --> agentwork["Claude Code /issue or Duo Developer: intent, spec, plan, code"]
  agentwork --> mr["Merge request"]
  mr --> checks["CI: lint, types, knip, arch, dupes, tests, stories, SAST, secrets, dependencies"]
  mr --> review["Duo Code Review (project rules)"]
  checks & review --> merge["Merge: a person, or auto-merge for the loop's own fixes"]
  merge --> main["main: pulumi up, deploy to App Hosting, smoke, semantic-release, GitHub mirror, SCI"]
  main --> prod["Production"]
  prod --> loop["Hourly loop: scout and verify"]
  loop --> issue
  main -->|"red main"| fixci["Duo Fix CI/CD"]
  fixci --> mr
```

## Boundaries

- Everything in Google Cloud and GitLab is declared in `infra/` (Pulumi); CI applies it on `main`. What stays manual is in the README.
- Spending (Fourthwall publish, fal generation, Meta launch) happens only after the merchant approves in a widget.
- CI reaches Google Cloud with Workload Identity Federation: four service accounts, each trusted only from one GitLab environment (`production`, `infrastructure`, `operations`, `analytics`). Only the weekly analysis account can read Firestore.
