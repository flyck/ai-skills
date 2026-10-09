# review.md — Reviewer Rubric For One Subtask Diff

The rubric a single reviewer agent applies to a single repo's diff. The orchestrator owns fan-out,
synthesis, and the gate (see the "Review Gate" section of SKILL.md) — this file is only what one
reviewer needs to review one diff and return findings.

## What you (the reviewer) get

- The subtask's repo path and branch name.
- The diff: `git diff <base>...HEAD` in that repo (`<base>` is the project's base branch, default
  `main`).
- The authoritative spec for the story, including the per-subtask implementation plan.
- The repo's language skill (via the `Skill` tool): `python-coding` for Python repos. Frontend
  reviewers skip it and instead match the surrounding code's conventions.
- The project's guidelines skill (via the `Skill` tool), if it has one, for project rules such as
  test setup, layout and logging.

Read the spec section for your subtask **before** reading the diff. A change that is clean but
implements the wrong thing is the most expensive failure mode here.

## Review axes, in priority order

1. **Sound — does it actually work?** The most important axis: clean, minimal, spec-matching code
   that is *wrong* is the worst outcome. Trace the real behaviour of the changed code. Logic errors,
   off-by-one, wrong operator/comparison, mishandled null/empty/error paths, unhandled edge cases,
   race conditions, a query or migration that doesn't do what the code assumes, a test that passes
   for the wrong reason. Where you can, reason through a concrete input and confirm the output. A
   finding here is almost always `blocking`.
2. **Minimal for what the feature needs.** Flag anything that is not required by the spec:
   speculative abstraction, unused parameters, defensive code for cases that cannot occur, config
   knobs nobody asked for, helpers with one caller that read better inlined, tests asserting
   framework behaviour rather than our logic. "It might be useful later" is a finding, not a
   justification.
3. **Readable / code quality.** Would a colleague understand this without the ticket open? Naming
   that matches the domain, control flow that reads top-down, no cleverness that needs a comment to
   survive, no duplication that should be factored, sensible error messages. Comments that restate
   the code are findings; missing comments on genuinely non-obvious business rules are too.
4. **Follows the language and guidelines skills.** For Python (`python-coding`), concretely:
   `.venv/bin/python -m ...` in any documented command, module-level imports only (except
   tests), new helpers **below** their callers (except
   dataclasses/TypedDicts/enums/module constants, which must go above), type hints on signatures,
   three-line docstrings without `:param:`/`:return:` bloat, no untouched-docstring churn, constants
   not magic strings, pylint 10.00/10 across the project.
5. **Matches the spec.** Every spec requirement for the subtask implemented; nothing implemented
   that the spec does not ask for. Deviations are findings even when they look like improvements —
   they may be, but they need to be surfaced rather than smuggled in.

## Explicitly out of scope

- Do not re-litigate decisions recorded in the spec (data model shape, field naming conventions,
  where access control lives, and any other settled design choices the spec locks down). If the
  *code* contradicts a decision, that is a finding; if the *decision* looks wrong, that is a
  `notes_to_user` entry, clearly labelled, not a blocking finding.
- Do not propose renaming things for taste.
- Do not review the pre-existing code the diff sits next to, unless the change makes an existing
  problem materially worse.
- Do not suggest adding tests for code paths the spec puts out of scope.

## Required output shape

Prose is rejected. Return exactly:

```yaml
subtask: <subtask-id>
repo: <path>
verdict: ready | needs-changes
findings:
  - id: <subtask>-001
    axis: minimal | readable | skill | spec
    severity: blocking | should-fix | nit
    location: path/to/file.py:42-58
    title: <short imperative phrase>
    detail: <one paragraph max>
    suggested_fix: <optional, one paragraph>
notes_to_user:
  - <only for things the user must decide; omit if none>
```

Rules:

- `verdict: needs-changes` iff at least one `blocking` finding exists.
- Every finding needs a real `location`. "There may be issues with X" without a file:line is
  rejected.
- No finding may be raised on a file the diff does not touch.
- Empty `findings` is a valid and expected result. Do not manufacture findings to look thorough —
  a clean small diff should come back clean.
- `nit` findings are capped at three per subtask. Beyond that, pick the three that matter.

---

# Big-picture review (across all subtasks)

Runs once, **after** the per-subtask local reviews, on the first pass only (before any draft PR).
You get every subtask's diff and the full spec — not one repo. Your job is the seams a single-repo
reviewer and a per-repo review bot structurally cannot see. Rework triggered by a missed cross-repo
problem is the most expensive failure mode this whole workflow exists to prevent — this pass is
where it gets caught, while everything is still local and cheap to change.

Check, in priority order:

1. **Cross-repo contracts.** A field, endpoint, event, or enum a producer repo changed and a
   consumer repo didn't follow — renamed field, changed type, new required parameter, altered
   response shape. Both sides of every boundary the story touches must agree.
2. **Access / permission boundaries end to end.** A restriction the spec requires (e.g. a role that
   must not see a field) must actually be enforced somewhere on the path. "Repo A assumes repo B
   enforces it" with neither actually doing so is a blocking finding.
3. **Story completeness.** Taken together, do the subtasks satisfy the story? Anything in the spec
   that fell between subtasks and got implemented in none is a finding here.
4. **Shared logic drift.** The same non-trivial logic implemented slightly differently in several
   repos (e.g. a near-identical upsert), where the differences are accidental rather than intended.
   Flag the divergence; don't mandate a shared library the spec didn't ask for.

Out of scope: single-repo style/readability (the local reviewers own that), and re-flagging a
per-subtask finding a local reviewer already raised. Only raise what needs the cross-repo view.

Output the same YAML shape, with `subtask: big-picture` and `repo: "<multiple>"`. `location` may
list several `file:line` across repos for one finding. Empty findings is a valid, good result.
