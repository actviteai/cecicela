#!/usr/bin/env sh
# Install the skill tree into $CELA_HOME. Stage first, swap only after SKILL.md
# is present, so a failed copy cannot delete a working install.
# Prefer the repo installer (./install.sh or npx @actvite/cela) when you have the full checkout.
set -eu

SOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  echo "error: SKILL.md not found next to this installer ($SOURCE_DIR)" >&2
  exit 1
fi

TARGET="${CELA_HOME:-${HOME}/.cela}"
SKILLS="$TARGET/skills"
DEST="$SKILLS/cela"
STAGE="$SKILLS/.cela.staging.$$"
BACKUP="$SKILLS/.cela.backup.$$"

mkdir -p "$SKILLS" "$TARGET/memory" "$TARGET/projects" "$TARGET/registry"
rm -rf "$STAGE"
cp -R "$SOURCE_DIR" "$STAGE"

if [ ! -f "$STAGE/SKILL.md" ]; then
  rm -rf "$STAGE"
  echo "error: staged copy is missing SKILL.md; existing install left untouched" >&2
  exit 1
fi

moved=0
if [ -e "$DEST" ]; then
  rm -rf "$BACKUP"
  mv "$DEST" "$BACKUP"
  moved=1
fi

if ! mv "$STAGE" "$DEST"; then
  if [ "$moved" -eq 1 ]; then
    mv "$BACKUP" "$DEST"
  fi
  echo "error: failed to publish staged skill; previous install restored if it existed" >&2
  exit 1
fi

if [ "$moved" -eq 1 ]; then
  rm -rf "$BACKUP"
fi

printf 'Installed cela to %s\n' "$DEST"
