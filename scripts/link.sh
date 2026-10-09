#!/usr/bin/env bash
# Overlay personal skills onto another skill directory (e.g. a team repo).
#
# For every skills/<name>/ here, create a symlink
#   $SKILLS_TARGET/<name> -> <this repo>/skills/<name>
# and, if the target is inside a git repo, list it in that repo's
# .git/info/exclude, so Claude Code sees it but git never does.
#
# The target comes from $SKILLS_TARGET, else from the untracked file
# scripts/link.target (one line: the absolute target directory).
#
# Idempotent: re-run after adding, renaming or deleting a personal skill.
# Stale links into this repo are removed. An existing skill with the same name
# in the target always wins; the personal one is skipped with a warning.
#
#   scripts/link.sh            link all personal skills
#   scripts/link.sh --unlink   remove all links and exclude entries
set -o errexit -o nounset -o pipefail

PERSONAL_ROOT=$(cd "$(dirname "$0")/.." && pwd)
CONF=$PERSONAL_ROOT/scripts/link.target
if [[ -z "${SKILLS_TARGET:-}" && -f "$CONF" ]]; then
  SKILLS_TARGET=$(head -n 1 "$CONF")
fi
[[ -n "${SKILLS_TARGET:-}" ]] || { echo "set SKILLS_TARGET or write the target dir to $CONF" >&2; exit 1; }
TARGET=${SKILLS_TARGET/#\~/$HOME}
TARGET=${TARGET%/}
MARK_BEGIN="# >>> personal-ai-skills (managed by $PERSONAL_ROOT/scripts/link.sh)"
MARK_END="# <<< personal-ai-skills"

[[ -d "$TARGET" ]] || { echo "skills dir not found: $TARGET" >&2; exit 1; }
TARGET=$(cd "$TARGET" && pwd -P)

# Exclude file and target path relative to the repo root, if the target is in a git repo.
EXCLUDE=""
if REPO_ROOT=$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null); then
  REPO_ROOT=$(cd "$REPO_ROOT" && pwd -P)
  SKILLS_REL=${TARGET#"$REPO_ROOT"}
  EXCLUDE=$(git -C "$REPO_ROOT" rev-parse --git-path info/exclude)
  [[ "$EXCLUDE" = /* ]] || EXCLUDE=$REPO_ROOT/$EXCLUDE
fi

# Remove our symlinks (only those pointing into this repo).
for link in "$TARGET"/*; do
  [[ -L "$link" ]] || continue
  case "$(readlink "$link")" in
    "$PERSONAL_ROOT"/skills/*) rm "$link" ;;
  esac
done

# Drop the managed block from the exclude file.
if [[ -n "$EXCLUDE" ]]; then
  mkdir -p "$(dirname "$EXCLUDE")"
  touch "$EXCLUDE"
  awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
    $0 == b {skip=1; next}
    $0 == e {skip=0; next}
    !skip' "$EXCLUDE" > "$EXCLUDE.tmp" && mv "$EXCLUDE.tmp" "$EXCLUDE"
fi

if [[ "${1:-}" == "--unlink" ]]; then
  echo "Removed all personal skill links."
  exit 0
fi

entries=()
for dir in "$PERSONAL_ROOT"/skills/*/; do
  [[ -f "$dir/SKILL.md" ]] || continue
  name=$(basename "$dir")
  target=$TARGET/$name
  if [[ -e "$target" || -L "$target" ]]; then
    echo "skip  $name (target already has it; target wins)" >&2
    continue
  fi
  ln -s "${dir%/}" "$target"
  [[ -n "$EXCLUDE" ]] && entries+=("$SKILLS_REL/$name")
  echo "link  $name"
done

if (( ${#entries[@]} )) && [[ -n "$EXCLUDE" ]]; then
  { echo "$MARK_BEGIN"; printf '%s\n' "${entries[@]}"; echo "$MARK_END"; } >> "$EXCLUDE"
fi
