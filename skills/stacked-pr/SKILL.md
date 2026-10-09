---
name: stacked-pr
description: Create stacked pull requests of at most 400 changed lines each, as a sequential rollout of a new feature or as the full feature split into reviewable parts. Use whenever opening, creating or preparing a PR / pull request / draft PR and the change is, or will be, larger than 400 lines; when a branch or diff is too big to review; when the user asks for stacked, chained, split, dependent or smaller PRs; or when planning how to roll out a feature across several PRs. Covers measuring the diff, planning the parts, building the branches, opening the PRs and rebasing the stack after review or merge.
---

Turn one feature into a chain of small pull requests that each review in minutes. Each PR has at
most **400 changed lines**, builds and passes tests on its own, and targets the branch of the PR
below it. The bottom PR targets `main` (or the repo's default branch).

## Steps

**1. Measure the change**

Find the base and measure the full diff before planning anything:

```bash
git fetch origin
BASE=$(git merge-base origin/main HEAD)
git diff --numstat "$BASE" -- . \
  ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)poetry.lock' \
  ':(exclude)uv.lock' ':(exclude)**/__snapshots__/**' ':(exclude)**/schema.sql' \
  | awk '{a+=$1; d+=$2} END {print a+d " lines (" a " added, " d " removed)"}'
```

- A line counts when it is **added or removed** (`added + removed`). Tests count — they are
  reviewed too.
- Generated files do not count: lockfiles, snapshots, generated schemas, compiled assets. List
  every exclusion you used in the final report.
- If the total is **≤ 400**, stop: open one ordinary draft PR instead and say why.
- If the work is not written yet, estimate from the spec and plan the stack before coding, then
  build it bottom-up.

**2. Choose the split mode**

Use the mode the user named. Otherwise pick one yourself: sequential rollout when the parts will
merge and deploy one by one, feature in parts when they only make sense together. State the choice
and the reason in the report.

- **Sequential rollout** — every PR is a shippable, mergeable step; `main` stays releasable after
  each merge. New behaviour stays dark behind a feature flag, an unused code path, or an additive
  schema change until the last PR switches it on. Use when PRs will merge and deploy one by one.
  Typical order:
  1. Schema / migration (additive only: new nullable columns, new tables)
  2. Data access / models / shared types
  3. Core logic with unit tests, not yet wired in
  4. API / handler / lambda wiring behind a flag
  5. Frontend
  6. Flip the flag, remove the old path, docs
- **Feature in parts** — the stack only makes sense as a whole and is merged together (or
  top-down after all parts are approved). Parts are cut for review, not for deployment, so an
  intermediate PR may add code nothing calls yet. Each part must still build and pass its tests.
  Cut along layers or modules, e.g. `models + tests`, `service logic + tests`, `endpoints + tests`,
  `UI`.

**3. Plan the stack**

Write down the plan before creating any branch, and include it in the final report:

| # | Branch | Targets | Content | Est. lines |
|---|--------|---------|---------|------------|
| 1 | `PROJ-1111-PROJ-1112-streaming-1-schema` | `main` | migration + model | ~180 |
| 2 | `PROJ-1111-PROJ-1112-streaming-2-service` | `…-1-schema` | service + unit tests | ~350 |
| 3 | `PROJ-1111-PROJ-1112-streaming-3-api` | `…-2-service` | handler wiring behind flag | ~260 |

- Branch names: the Jira story and subtask keys (`PROJ` stands for the project key), a short
  feature slug, then the part number and a part slug. Follow the repo's own branch-naming rules where
  it has them; a `prepare-commit-msg` hook may take the Jira key prefix for commit messages from the
  branch name.
- Each part has one purpose a reviewer can state in a sentence. Keep a feature's tests in the same
  PR as the code they test.
- Aim for 200–350 lines per part. 400 is a ceiling, not a target.
- A single file larger than 400 lines (e.g. a big new module) gets split by extracting cohesive
  pieces into their own part. If it truly cannot be split, give it its own PR and call it out in
  that PR's description and in the report — never hide it.
- Do not wait for approval of the plan; continue straight to building the branches.

**4. Build the branches bottom-up**

For already-written work on one branch (`FEATURE`):

```bash
git switch -c <branch-1> "$BASE"
git checkout FEATURE -- <files for part 1>     # or: git restore -p --source=FEATURE <file>
git commit                                     # one clean commit per part, see commit skill
# repeat from the previous part's branch:
git switch -c <branch-2> <branch-1>
...
```

- Use `git restore -p --source=FEATURE` (hunk mode) when one file's changes span parts.
- After the last part, verify the stack is complete: `git diff <last-branch> FEATURE` must be
  empty. Any remaining diff is either a missing piece or an unintended change — resolve it.
- For new work, implement part 1, commit, branch part 2 from it, and so on.
- On every branch: run the build, linter and tests. A part that does not pass alone is not done.
- Re-measure every part with the command from step 1, using the previous branch as the base. Over
  400 → split it again before pushing.

**5. Open the PRs**

Push every branch, then create one **draft** PR per part, bottom-up, each with the previous
part's branch as its destination (the base or target branch, in the PR host's terms). If the work
belongs to a story, follow the `story-workflow` skill for reviewers.

Title: `<Jira IDs> (<n>/<total>) <part summary>`, e.g. `PROJ-1111 (2/3) Add service logic`.
Keep `<part summary>` concise, a few words.
When parts are added or dropped later, update `<total>` in every title of the stack.

Keep descriptions minimal: one line for the part, then
the stack overview, which is the same in every PR. Nothing else unless a reviewer could not infer
it from the diff — for example, that something missing here arrives in a later part.

```markdown
<one line: what this part does>

Stack (sequential rollout | feature in parts):

1. #101 Schema and model → main
2. **#102 Service logic** ← this PR
3. #103 API wiring
```

Create the PRs first, then fill in the numbers of later PRs by updating the descriptions.
Keep the blank line before the list; some hosts' Markdown joins a list without one into the
previous paragraph. If the host does not auto-link a bare `#101`, write each PR number as a link
(`[#101](<pr url>)`). Follow the repo's own rules for PR title and description language.

**6. Keep the stack healthy**

- **Change in a lower part** (review feedback): amend the commit on that branch, then rebase every branch above it in order and push them with `--force-with-lease`:
  ```bash
  git switch <branch-2> && git rebase <branch-1>
  git switch <branch-3> && git rebase <branch-2>
  ```
  `git rebase --update-refs` from the top branch does this in one go.
- **A lower PR merged**: the next PR must target `main` now. Check its destination and update it
  if the PR host did not retarget it. If the merge was a squash, rebase the next branch with
  `git rebase --onto origin/main <merged-branch> <next-branch>` so the merged commits drop out.
- Never merge a PR whose destination is not `main` — that would land it in the branch below
  instead of in `main`.
- Re-measure after every change. A part that grew past 400 lines gets split.
- Keep the stack section in every description current when parts are added, merged or dropped.

## Rules

- Never exceed 400 changed lines per PR (added + removed, generated files excluded). The only
  exception is a single file that cannot be split, and it must be called out.
- Run the whole flow without pausing for approval; report the plan, branches and PR links at the
  end.
- Every part must build and pass its tests on its own.
- Open every PR as a draft. Never merge, and never push to `main`.
- Never force-push without `--force-with-lease`, and never force-push a branch whose PR is merged.
- Never mix unrelated changes (refactors, formatting, dependency bumps) into a feature part; give
  them their own part at the bottom of the stack.
- Every PR title carries its position in the stack as `(<n>/<total>)` right after the Jira IDs.
