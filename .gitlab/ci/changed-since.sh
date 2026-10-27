#!/bin/sh
# changed-since.sh BASE PATHSPEC...
# Whether a deploy job has work to do: exits 0 when PATHSPEC changed between
# BASE (the commit that is live, e.g. Pulumi's last update or the running
# docs image) and CI_COMMIT_SHA, and 1 when it didn't. Any doubt counts as a
# change: FORCE_ALL set, no BASE, or a BASE git can't fetch. Comparing with
# what is live, not with the previous push (rules: changes), means a change
# whose own pipeline was cancelled or superseded still goes out with the next.
base=$1
shift
if [ -n "$FORCE_ALL" ]; then
  echo "FORCE_ALL is set."
  exit 0
fi
case $base in
  *[!0-9a-f]* | "")
    echo "No live commit to compare with ('$base')."
    exit 0
    ;;
esac
if ! git cat-file -e "$base^{commit}" 2>/dev/null && ! git fetch -q --depth=1 origin "$base"; then
  echo "Can't fetch the live commit $base."
  exit 0
fi
if git diff --quiet "$base" "$CI_COMMIT_SHA" -- "$@"; then
  echo "Nothing in $* changed since the live commit $base."
  exit 1
fi
echo "Changed since the live commit $base:"
git diff --stat "$base" "$CI_COMMIT_SHA" -- "$@" | tail -n 20
exit 0
