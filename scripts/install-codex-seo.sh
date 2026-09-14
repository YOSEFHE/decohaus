#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/AgriciDaniel/codex-seo.git"
REF="${CODEX_SEO_REF:-v1.9.6-codex.5}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

for cmd in git python3 bash; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Installing Codex SEO $REF into $CODEX_HOME"
git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP_DIR/codex-seo"

(
  cd "$TMP_DIR/codex-seo"
  CODEX_HOME="$CODEX_HOME" \
  CODEX_SEO_REPO="$REPO_URL" \
  CODEX_SEO_REF="$REF" \
  bash install.sh
)

if [[ ! -f "$CODEX_HOME/skills/seo/SKILL.md" ]]; then
  echo "Installation finished but $CODEX_HOME/skills/seo/SKILL.md was not found." >&2
  exit 1
fi

echo "Codex SEO installed successfully."
echo "Skill entrypoint: $CODEX_HOME/skills/seo/SKILL.md"
echo "Restart or reload Codex if the skill is not discovered immediately."
