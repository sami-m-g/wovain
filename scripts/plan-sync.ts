// Compare devpost planning docs with their HTML companions.
//
// Usage:
//   bun scripts/plan-sync.ts [devpost_dir]
//   bun scripts/plan-sync.ts --hook   (Stop-hook JSON on stdin)
//
// The .md is rendered to HTML, then both sides go through the same extraction:
// table rows, list items, and paragraphs. Headings, buttons, diagrams, and code
// blocks are ignored. Exit 0 when every pair matches, 1 otherwise; in hook mode,
// print a block decision instead (skipped if the hook already fired this turn).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import MarkdownIt from "markdown-it";
import { NodeType, parse } from "node-html-parser";
import type { Node } from "node-html-parser";
import { z } from "zod";

const IGNORED_TAGS = "svg, pre, script, style, button, h1, h2, h3, h4, h5, h6";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u;

// Like BeautifulSoup's get_text(" ", strip=True): each text node trimmed,
// empty ones dropped, the rest joined with one space.
const textOf = (node: Node): string => {
  const parts: string[] = [];
  const walk = (current: Node) => {
    if (current.nodeType === NodeType.TEXT_NODE) {
      const value = current.text.trim();
      if (value !== "") {
        parts.push(value);
      }
      return;
    }
    for (const child of current.childNodes) {
      walk(child);
    }
  };
  walk(node);
  return parts.join(" ");
};

const textItems = (markup: string) => {
  const doc = parse(markup, { comment: false });
  const root = doc.querySelector("main") ?? doc;

  for (const tag of root.querySelectorAll(IGNORED_TAGS)) {
    tag.remove();
  }

  const items: string[] = [];

  for (const row of root.querySelectorAll("tr")) {
    items.push(row.querySelectorAll("td, th").map(textOf).join(" | "));
    row.remove();
  }

  items.push(...root.querySelectorAll("p, li").map(textOf));

  return items
    .map((item) => item.split(/\s+/u).filter(Boolean).join(" "))
    .filter((item) => item !== "");
};

const markdown = new MarkdownIt("commonmark").enable("table");

const mdMarkup = (file: string) =>
  markdown.render(readFileSync(file, "utf-8").replace(FRONTMATTER, ""));

const sortedUnique = (items: string[]) => [...new Set(items)].toSorted();

// The pair as a minimal unified diff: lines only in the .md, then lines only
// in the .html.
const drift = (devpost: string) => {
  const reports: string[] = [];
  const mdFiles = readdirSync(devpost)
    .filter((name) => name.endsWith(".md"))
    .toSorted();
  for (const mdName of mdFiles) {
    const htmlName = mdName.replace(/\.md$/u, ".html");
    const htmlPath = path.join(devpost, htmlName);
    if (!existsSync(htmlPath)) {
      continue;
    }
    const mdLines = sortedUnique(
      textItems(mdMarkup(path.join(devpost, mdName)))
    );
    const htmlLines = sortedUnique(textItems(readFileSync(htmlPath, "utf-8")));
    const inHtml = new Set(htmlLines);
    const inMd = new Set(mdLines);
    const removed = mdLines.filter((line) => !inHtml.has(line));
    const added = htmlLines.filter((line) => !inMd.has(line));
    if (removed.length > 0 || added.length > 0) {
      reports.push(
        [
          `--- ${mdName}`,
          `+++ ${htmlName}`,
          ...removed.map((line) => `-${line}`),
          ...added.map((line) => `+${line}`),
        ].join("\n")
      );
    }
  }
  return reports.join("\n\n");
};

const hookPayload = z.looseObject({
  cwd: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
});

const main = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const hook = args.includes("--hook");
  let devpost = args.find((arg) => arg !== "--hook") ?? "devpost";

  if (hook) {
    const payload = hookPayload.parse(JSON.parse(await Bun.stdin.text()));
    if (payload.stop_hook_active === true) {
      return 0;
    }
    devpost = path.join(payload.cwd ?? ".", "devpost");
  }

  const isDir = existsSync(devpost) && statSync(devpost).isDirectory();
  const report = isDir ? drift(devpost) : "";

  if (report === "") {
    if (!hook) {
      console.info("All planning docs are in sync.");
    }
    return 0;
  }

  if (hook) {
    const reason = `Planning docs drifted (HTML is the source of truth). Run the sync-plan skill.\n${report}`;
    console.info(JSON.stringify({ decision: "block", reason }));
    return 0;
  }

  console.info(report);
  return 1;
};

process.exit(await main());
