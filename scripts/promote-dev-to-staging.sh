#!/usr/bin/env bash
set -euo pipefail

root_dir="$(git rev-parse --show-toplevel)"
cd "$root_dir"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required to run the staging checks. Current: $(node --version)"
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "dev" ]]; then
  echo "Refusing to publish staging from '$branch'. Switch to an up-to-date dev checkout first."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to publish staging with uncommitted changes. Commit or stash them first."
  exit 1
fi

git fetch --prune origin

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/dev)" ]]; then
  echo "Local dev is not current. Run git pull --ff-only origin dev, then retry."
  exit 1
fi

if [[ "$(git rev-parse origin/main)" != "$(git rev-parse origin/dev)" ]]; then
  echo "Dev has not completed verified promotion to main. Wait for GitHub Actions, then retry."
  exit 1
fi

if git show-ref --verify --quiet refs/remotes/origin/staging \
  && ! git merge-base --is-ancestor origin/staging HEAD; then
  echo "Staging contains work absent from dev. Reconcile staging with dev before publishing."
  exit 1
fi

npm test
npm run build

git push origin HEAD:refs/heads/staging
