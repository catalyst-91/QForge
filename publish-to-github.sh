#!/bin/bash
# Uploads QForge to GitHub and creates the v1.5.0 release with the three app builds.
# Needs the GitHub CLI (https://cli.github.com) — on a Mac: brew install gh
# Usage:  ./publish-to-github.sh  [folder containing the three QForge-*.zip builds]   (default: ~/Downloads)
set -e
cd "$(dirname "$0")"
REPO="QForge"; TAG="v1.5.0"; ZIPDIR="${1:-$HOME/Downloads}"
command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login
OWNER="$(gh api user --jq .login)"
if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  echo "Repository $OWNER/$REPO already exists — pushing to it"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
else
  echo "Creating private repository $OWNER/$REPO"
  gh repo create "$OWNER/$REPO" --private --source . --remote origin --push \
    --description "QForge — QLab-style show playback for Windows and macOS by Booth Productions"
fi
ASSETS=()
for f in QForge-Windows-x64.zip QForge-mac-AppleSilicon.zip QForge-mac-Intel.zip; do
  if [ -f "$ZIPDIR/$f" ]; then ASSETS+=("$ZIPDIR/$f"); else echo "Not found (skipped): $ZIPDIR/$f"; fi
done
if gh release view "$TAG" -R "$OWNER/$REPO" >/dev/null 2>&1; then
  [ ${#ASSETS[@]} -gt 0 ] && gh release upload "$TAG" "${ASSETS[@]}" -R "$OWNER/$REPO" --clobber
else
  gh release create "$TAG" "${ASSETS[@]}" -R "$OWNER/$REPO" --title "QForge 1.5.0" --notes-file docs/release-notes-1.5.0.md
fi
echo; echo "Done: https://github.com/$OWNER/$REPO/releases/tag/$TAG"
