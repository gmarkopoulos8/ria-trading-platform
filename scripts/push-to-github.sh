#!/bin/bash
set -e

REPO="https://github.com/gmarkopoulos8/ria-trading-platform.git"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "[GitHub Push] ERROR: GITHUB_TOKEN secret is not set."
  exit 1
fi

LATEST_LOCAL=$(git rev-parse main)
LATEST_REMOTE=$(git ls-remote "https://x-token:${GITHUB_TOKEN}@github.com/gmarkopoulos8/ria-trading-platform.git" refs/heads/main | awk '{print $1}')

if [ "$LATEST_LOCAL" = "$LATEST_REMOTE" ]; then
  echo "[GitHub Push] Already up-to-date (${LATEST_LOCAL:0:8})"
  exit 0
fi

echo "[GitHub Push] Pushing ${LATEST_LOCAL:0:8} → GitHub..."
git push "https://x-token:${GITHUB_TOKEN}@github.com/gmarkopoulos8/ria-trading-platform.git" main:main 2>&1 | grep -v "x-token" | grep -v "GITHUB_TOKEN" || true
echo "[GitHub Push] Done ✓"
