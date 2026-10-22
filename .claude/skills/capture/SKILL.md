---
name: capture
description: Turn the user's feedback (text plus optional screenshots) into GitLab work items. Use when the user says "/capture", pastes feedback, a bug, a complaint or an idea, or shares a screenshot with a comment.
argument-hint: "[feedback text and screenshot paths]"
---

# Capture feedback as work items

The project is `gitlab-ai-hackathon/transcend-october-2026/43085639/showcase`. Pass it to every `glab` command as `-R`. Only labels declared in `infra/gitlab.ts` may be used: never create labels, never assign Duo (`agent::duo`).

## 1. Split and classify

Split the feedback into one item per distinct point. Classify each:

- **Bug**: something is broken or looks wrong. Template `.gitlab/issue_templates/Bug.md`, label `type::bug`, `status::todo`.
- **Idea or change**: anything else. Template `.gitlab/issue_templates/Intent.md`, label `type::feature` (or `type::chore` for upkeep), `status::intent`. A human accepts it later.

## 2. Look for a duplicate

`glab issue list -R <project> --search "<keywords>"` (open issues). On a match, add the new details and screenshots as a comment (`glab issue note <n> -R <project> -m "<text>"`) and report that issue instead of creating one.

## 3. Upload screenshots

`glab api projects/:id/uploads --form "file=@<path>"` (`--form` sends the file; `-F` returns 400). Embed the returned `markdown` field in the body, in "What happened" or "Problem". For a long body, write a JSON file with `jq -n --rawfile d body.md '{title:..., labels:..., description:$d}'` and create the issue with `glab api projects/:id/issues --method POST --input <file>`.

## 4. Write the item

- Title: concise, under 70 characters, no prefix.
- Body: fill the template's sections, dropping its HTML comments and the trailing `/label` line. Quote the user's words verbatim in a `>` block under the first section. Mark anything you did not verify as unverified. Don't invent reproduction steps; write "unknown".
- Labels: the type, `priority::2` unless the user says otherwise, a `stage::` label that fits (`plan`, `create`, `verify`, `package`, `secure`, `release`, `configure`, `monitor`, `govern`), and the status above.
- Create with: `glab issue create -R <project> --title "<title>" --description "<body>" --label "<l1>,<l2>" --yes`.

## 5. Report back

One line per item: `<new|commented> #<n> <title> <url>`.
