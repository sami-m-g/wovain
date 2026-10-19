# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "beautifulsoup4==4.12.3",
#   "markdown-it-py==3.0.0",
#   "python-frontmatter==1.1.0",
# ]
# ///
"""Compare devpost planning docs with their HTML companions.

Usage:
  uv run --script plan_sync.py [devpost_dir]
  uv run --script plan_sync.py --hook   (Stop-hook JSON on stdin)

The .md is rendered to HTML, then both sides go through the same extraction:
table rows, list items, and paragraphs. Headings, buttons, diagrams, and code
blocks are ignored. Exit 0 when every pair matches, 1 otherwise; in hook mode,
print a block decision instead (skipped if the hook already fired this turn).
"""

import difflib
import json
import sys
from pathlib import Path

import frontmatter
from bs4 import BeautifulSoup
from markdown_it import MarkdownIt

IGNORED_TAGS = ["svg", "pre", "script", "style", "button", "h1", "h2", "h3", "h4", "h5", "h6"]


def text_items(markup):
    soup = BeautifulSoup(markup, "html.parser")
    root = soup.find("main") or soup

    for tag in root.find_all(IGNORED_TAGS):
        tag.decompose()

    items = []

    for row in root.find_all("tr"):
        cells = (cell.get_text(" ", strip=True) for cell in row.find_all(["td", "th"]))
        items.append(" | ".join(cells))
        row.decompose()

    items.extend(block.get_text(" ", strip=True) for block in root.find_all(["p", "li"]))

    return [" ".join(item.split()) for item in items if item.strip()]


def md_markup(path):
    body = frontmatter.load(path).content

    return MarkdownIt("commonmark").enable("table").render(body)


def drift(devpost):
    for md_path in sorted(devpost.glob("*.md")):
        html_path = md_path.with_suffix(".html")

        if not html_path.exists():
            continue

        md_lines = sorted(set(text_items(md_markup(md_path))))
        html_lines = sorted(set(text_items(html_path.read_text())))
        diff = list(difflib.unified_diff(md_lines, html_lines, md_path.name, html_path.name, lineterm="", n=0))

        if diff:
            yield "\n".join(diff)


def main():
    hook = "--hook" in sys.argv
    args = [arg for arg in sys.argv[1:] if arg != "--hook"]

    if hook:
        payload = json.load(sys.stdin)

        if payload.get("stop_hook_active"):
            return 0

        devpost = Path(payload.get("cwd", ".")) / "devpost"
    else:
        devpost = Path(args[0]) if args else Path("devpost")

    report = "\n\n".join(drift(devpost)) if devpost.is_dir() else ""

    if not report:
        if not hook:
            print("All planning docs are in sync.")
        return 0

    if hook:
        reason = "Planning docs drifted (HTML is the source of truth). Run the sync-plan skill.\n" + report
        print(json.dumps({"decision": "block", "reason": reason}))
        return 0

    print(report)
    return 1


if __name__ == "__main__":
    sys.exit(main())
