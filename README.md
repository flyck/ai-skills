# personal-ai-skills

My personal AI skills. They are overlaid onto another skill directory,
for example a team or company skill repo that `~/.claude/skills` points at.

## Layout

```
skills/<name>/SKILL.md   one directory per skill
scripts/link.sh          overlay personal skills onto the target skills dir
scripts/link.target      untracked: one line, the absolute target directory
```

## Overlay (`scripts/link.sh`)

```bash
echo /path/to/team-repo/skills > scripts/link.target   # once
scripts/link.sh            # (re)link every skill; run after adding/renaming/deleting one
scripts/link.sh --unlink   # remove all overlay links
```

`SKILLS_TARGET=/path scripts/link.sh` overrides `link.target`.

For each `skills/<name>`, the script creates a symlink `<target>/<name>` that
points here. If the target is inside a git repo, it also lists the link in that
repo's `.git/info/exclude`, so the link never shows up in `git status` and is
never committed. Edits are live. If the target already has a skill with the same
name, the target's skill wins and the personal one is skipped.

The links are untracked, so switching branches in the target repo leaves them
in place.

## Validation

`SKILL.md` must start with YAML frontmatter that contains `name:` and
`description:`.
