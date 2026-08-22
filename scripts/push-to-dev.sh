#!/usr/bin/env bash
set -euo pipefail

root_dir="$(git rev-parse --show-toplevel)"
cd "$root_dir"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required to run the promotion checks. Current: $(node --version)"
  exit 1
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" || "$branch" == "main" || "$branch" == "dev" ]]; then
  echo "Refusing to promote from '$branch'. Push a committed task branch to dev."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to promote with uncommitted changes. Commit or stash them first."
  exit 1
fi

git fetch --prune origin

if ! git merge-base --is-ancestor origin/dev HEAD; then
  echo "Task branch is behind origin/dev. Rebase onto origin/dev, resolve conflicts, then retry."
  exit 1
fi

if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Task branch does not include origin/main. Reconcile dev with main before promoting."
  exit 1
fi

npm test
npm run build

git push origin HEAD:refs/heads/dev
