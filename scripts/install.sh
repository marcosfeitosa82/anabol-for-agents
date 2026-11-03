#!/bin/sh
# Anabol for Agents — installer.
#
# Copies one registered Anabol meta-skill (plus unregistered references) into
# an orchestrator's skills directory.
# The donation prompt is optional, skippable, and never blocks the install.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEFAULT_TARGET="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/skills"
TARGET="$DEFAULT_TARGET"
NO_DONATE="${ANABOL_NO_DONATE:-0}"
DONATE_URL="${ANABOL_DONATE_URL:-https://github.com/sponsors/anabol-for-agents}"
DONATE_EMAIL="${ANABOL_DONATE_EMAIL:-anabolforagent@gmail.com}"
DRY_RUN=0
COMMANDS=0
BIN_DIR=""

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Options:
  --target DIR     Skills directory to install into
                   (default: $OPENCODE_CONFIG_DIR/skills or ~/.config/opencode/skills)
  --commands       Also install or refresh the anf and anr commands
  --bin-dir DIR    Command directory for --commands (implies --commands)
                   (default: /usr/local/bin if writable, else ~/.local/bin)
  --no-donate      Skip the donation prompt
  --dry-run        Show what would be copied, change nothing
  -h, --help       Show this help

Environment:
  ANABOL_NO_DONATE=1   Skip the donation prompt
  ANABOL_DONATE_URL    Override the donation link
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || { echo "install.sh: --target needs a value" >&2; exit 2; }
      TARGET="$2"
      shift 2
      ;;
    --commands)
      COMMANDS=1
      shift
      ;;
    --bin-dir)
      [ $# -ge 2 ] || { echo "install.sh: --bin-dir needs a value" >&2; exit 2; }
      BIN_DIR="$2"
      COMMANDS=1
      shift 2
      ;;
    --no-donate)
      NO_DONATE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install.sh: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "install.sh: Node.js >= 18 is required (node not found)" >&2
  exit 1
fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  echo "install.sh: Node.js >= 18 is required (found $(node -v))" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Donation prompt: optional, time-limited, and safe to skip.
# ---------------------------------------------------------------------------
donation_prompt() {
  [ "$NO_DONATE" = "1" ] && return 0
  [ -t 0 ] || return 0

  echo ""
  echo "Anabol is free and always will be. If it saves you time, you can support"
  echo "maintenance and new adapters via:"
  echo "  • email  -> $DONATE_EMAIL  (envie seu pix)"
  echo "  • sponsors  -> $DONATE_URL"
  printf "Donate? [y/N] (auto-skips in 10s) "

  answer=""
  if read -r -t 10 answer 2>/dev/null; then :; else answer=""; fi
  echo ""

  case "$answer" in
    y|Y|yes|YES)
      echo "Thank you! Donation link: $DONATE_URL"
      ;;
    *)
      echo "No problem — continuing."
      ;;
  esac
  return 0
}

donation_prompt || true

# ---------------------------------------------------------------------------
if [ ! -d "$ROOT/skills" ]; then
  echo "install.sh: skills/ not found next to the script ($ROOT/skills)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Install one registered meta-skill. Ingest/donate are copied as unregistered
# reference documents inside it, so the skill count grows by exactly one.
# ---------------------------------------------------------------------------
META_NAME="anabol-orchestrator"
META_SRC="$ROOT/skills/$META_NAME"

if [ ! -f "$META_SRC/SKILL.md" ]; then
  echo "install.sh: $META_SRC/SKILL.md not found" >&2
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "Would install into: $TARGET"
  echo "  $META_NAME (1 registered skill)"
  echo "  $META_NAME/reference/ingest.md (unregistered)"
  echo "  $META_NAME/reference/donate.md (unregistered)"
  echo "Would remove legacy registered skills: anabol-ingest, anabol-donate"
  if [ "$COMMANDS" = "1" ]; then
    if [ -n "$BIN_DIR" ]; then
      echo "Would install anf, anr into: $BIN_DIR"
    else
      echo "Would install anf, anr into: /usr/local/bin (or ~/.local/bin)"
    fi
  fi
  exit 0
fi

mkdir -p "$TARGET"

# Migrate from the earlier 3-skill layout without leaving extra registered skills.
for legacy in anabol-ingest anabol-donate; do
  if [ -d "$TARGET/$legacy" ]; then
    rm -rf "$TARGET/$legacy"
    echo "removed legacy skill $legacy"
  fi
done

rm -rf "$TARGET/$META_NAME"
cp -R "$META_SRC" "$TARGET/$META_NAME"
mkdir -p "$TARGET/$META_NAME/reference"
cp "$ROOT/skills/anabol-ingest/SKILL.md" "$TARGET/$META_NAME/reference/ingest.md"
cp "$ROOT/skills/anabol-donate/SKILL.md" "$TARGET/$META_NAME/reference/donate.md"
echo "installed $META_NAME -> $TARGET/$META_NAME (1 registered skill)"
echo "  reference/ingest.md, reference/donate.md (not registered)"

if [ "$COMMANDS" = "1" ]; then
  echo ""
  if [ -n "$BIN_DIR" ]; then
    "$ROOT/scripts/install-commands.sh" --target "$BIN_DIR"
  else
    "$ROOT/scripts/install-commands.sh"
  fi
else
  echo ""
  echo "Tip: run $ROOT/scripts/install-commands.sh to install or refresh anf and anr."
fi

echo ""
echo "Anabol installed. Next:"
echo "  node $ROOT/src/cli.js install --source <package> --structure $TARGET --dry-run"
echo ""
echo "Tip: the orchestrator reads <skills-root>/.anabol/index.json and only the"
echo "line range of the segment it needs."
