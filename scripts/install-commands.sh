#!/bin/sh
# Install the short Anabol commands (anf, anr) into a bin directory.
#
#   ./scripts/install-commands.sh                 # /usr/local/bin if writable
#   ./scripts/install-commands.sh --target DIR
#
# The commands read ANABOL_STRUCTURE (default ~/.config/opencode/skills) and
# ANABOL_CLI (default <repo>/src/cli.js).
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TARGET=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "install-commands.sh: unknown argument $1" >&2; exit 1 ;;
  esac
done

if [ -z "$TARGET" ]; then
  if [ -w /usr/local/bin ]; then
    TARGET=/usr/local/bin
  else
    TARGET="$HOME/.local/bin"
  fi
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "Would install into: $TARGET"
  for f in "$ROOT"/scripts/bin/*; do echo "  $(basename "$f")"; done
  exit 0
fi

mkdir -p "$TARGET"
for f in "$ROOT"/scripts/bin/*; do
  name=$(basename "$f")
  cp "$f" "$TARGET/$name"
  chmod 755 "$TARGET/$name"
  echo "installed $name -> $TARGET/$name"
done

echo ""
echo "Try: anf \"design a database schema\" && anr database-schema-designer"
