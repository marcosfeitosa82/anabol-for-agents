#!/bin/sh
# Anabol for Agents — uninstaller.
#
# Removes the Anabol meta-skills from a skills directory. Merged segments that
# Anabol previously wrote into YOUR category skills are intentionally left alone.
set -eu

DEFAULT_TARGET="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/skills"
TARGET="$DEFAULT_TARGET"

usage() {
  cat <<'EOF'
Usage: uninstall.sh [--target DIR]

Removes: anabol-orchestrator (including references) and legacy
anabol-ingest/anabol-donate directories.
Merged segments and .anabol/index.json are preserved.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || { echo "uninstall.sh: --target needs a value" >&2; exit 2; }
      TARGET="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "uninstall.sh: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

removed=0
for name in anabol-orchestrator anabol-ingest anabol-donate; do
  if [ -d "$TARGET/$name" ]; then
    rm -rf "$TARGET/$name"
    echo "removed $TARGET/$name"
    removed=$((removed + 1))
  fi
done

echo ""
if [ "$removed" -eq 0 ]; then
  echo "Nothing to remove in $TARGET."
else
  echo "Removed $removed Anabol meta-skill(s)."
fi
echo "Merged segments and $TARGET/.anabol/index.json were preserved."
echo "To undo a merge, delete its <!-- ANABOL:SEGMENT id=... --> block and run reindex."
