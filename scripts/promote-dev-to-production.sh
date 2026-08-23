#!/usr/bin/env bash
set -euo pipefail

root_dir="$(git rev-parse --show-toplevel)"
cd "$root_dir"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required to run the production checks. Current: $(node --version)"
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "dev" ]]; then
  echo "Refusing to publish production from '$branch'. Switch to an up-to-date dev checkout first."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to publish production with uncommitted changes. Commit or stash them first."
  exit 1
fi

git fetch --prune origin

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/dev)" ]]; then
  echo "Local dev is not current. Run git pull --ff-only origin dev, then retry."
  exit 1
fi

if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Main contains work absent from dev. Reconcile it into dev before publishing production."
  exit 1
fi

npm test
npm run build

git push origin HEAD:refs/heads/main
