"""Prints "true" when a commit this pipeline's merge brings in carries the git
trailer `Canary-Demo-Fault: true` (AGENTS.md, "Canary demo"); prints nothing
otherwise, or on any error: the safe state is no fault.

Reads the commits through the GitLab API, since deploy:production's gcloud
image has no git: the merge commit's first parent up to CI_COMMIT_SHA, or the
commit alone when it isn't a merge.
"""

import json
import os
import re
import sys
import urllib.request

TRAILER = re.compile(r"^Canary-Demo-Fault:\s*true\s*$", re.IGNORECASE)


def get(path):
    request = urllib.request.Request(
        f"{os.environ['CI_API_V4_URL']}/projects/{os.environ['CI_PROJECT_ID']}/repository/{path}",
        headers={"PRIVATE-TOKEN": os.environ["GITLAB_TOKEN"]},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def has_trailer(message):
    # Git trailers live in the message's last paragraph.
    paragraphs = [p for p in message.strip().split("\n\n") if p.strip()]
    return bool(paragraphs) and any(
        TRAILER.match(line) for line in paragraphs[-1].splitlines()
    )


def main():
    sha = os.environ["CI_COMMIT_SHA"]
    commit = get(f"commits/{sha}")
    parents = commit.get("parent_ids") or []
    if len(parents) > 1:
        commits = get(f"compare?from={parents[0]}&to={sha}&straight=true")["commits"]
    else:
        commits = [commit]
    found = [c["short_id"] for c in commits if has_trailer(c.get("message") or "")]
    print(f"Canary-Demo-Fault trailer on: {', '.join(found) or 'none'}", file=sys.stderr)
    if found:
        print("true")


try:
    main()
except Exception as error:  # noqa: BLE001 - any doubt means no fault
    print(f"Could not read the commits ({error}); no canary demo fault.", file=sys.stderr)
