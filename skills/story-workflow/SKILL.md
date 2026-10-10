---
name: story-workflow
description: End-to-end workflow for implementing a story across one or more repos, from discovery through implementation, review gate, and PR handling. Use when starting work on a story/spec that spans subtasks across repos, when deciding whether code is ready for a PR, or when running the multi-repo review gate before opening PRs.
---

Run a multi-repo story from discovery to merge-ready PRs. Pick the flow by the state of the spec file:

- **[Flow A](#flow-a--discovery--first-pass)** — no spec file, or no subtask implemented yet:
  scaffold → discover → clarify → **spec gate** → implement → review gate → **manual gate** → PRs.
- **[Flow B](#flow-b--continuing-work)** — the spec already holds the Branch-/PR-Inventar and
  per-subtask progress: reconcile state, verify spec compliance, address PR comments, re-gate changed
  code.

Both flows link into [Shared reference](#shared-reference) rather than repeating it. Situational
detail (frontend snapshots, review bot, dev-version publishes) is in [`reference.md`](reference.md):
read a section when the step linking to it applies. Before editing this skill or its workflow
scripts, read `MAINTAINING.md`.

## Project settings

Before A1 or B1, load the project's guidelines skill (for company work, the company's) and read its
**story workflow settings**. A missing setting uses the default; a step whose default is "none" is
skipped.

| Setting | Used in | Default |
|---|---|---|
| Ticket source: how to fetch a story and its subtasks | A1 | the tracker's MCP or CLI if available, otherwise ask the user to paste the ticket |
| Repo map: what says which repos a story touches | A2 | explore the repos yourself |
| Guidelines skill: branch names, commits, PR descriptions, test setup, security scans | A3, review | the language skill and the surrounding code |
| Base branch, written `<base>` below | every diff | `main` |
| Install command | A3, fixes | the repo's documented install command |
| PR host: open PRs, read their state, descriptions and comments | PRs, B1, B3 | the host's CLI, e.g. `gh` |
| PR reviewers | Opening PRs | ask the user |
| Test deployment: how a branch reaches a shared test environment | force-push rules | none |
| AI review bot: name, comment author, delay, quirks | review-bot sections | none |

Language skills come on top (`python-coding` for Python). Pass the same values to the workflow
scripts as `args.settings` (see their headers).

---

# Flow A — Discovery & first pass

## A1. Scaffold the spec file

Skip if a spec file exists; if it has implemented subtasks, you are in Flow B. Otherwise pull the
ticket and its subtasks through the **ticket source** and write `specs.md`:

- An H1 with ticket key + summary, then a **2–3 sentence** intent — not the ticket description.
- One `## <subtask-key> — <summary>` per existing subtask, with **terse bullets, not ticket prose**:
  decisions, acceptance criteria, non-goals. Then an empty `### Implementation plan` and a
  `### Progress` block (status, branch, PR).
- An empty `## Branch-/PR-Inventar` table and `## AI Mistakes` with empty `### Major` / `### Minor`
  (see [inventory](#maintain-the-branchpr-inventory), [AI mistakes](#document-ai-mistakes-major--minor)).

Keep it lean: each reviewer gets its own subtask's section (two local, big-picture and fix agents,
every round), so bloat is paid many times over. Don't invent subtasks; Discovery surfaces missing ones.

## A2. Discovery

Use the **repo map** to find the affected repos and any missing subtasks or details. Record findings
in each subtask's `### Implementation plan` — only what is non-obvious or unexpected.

## A2.5. Clarify open questions

A misunderstanding is cheapest to fix before code exists. Don't implement a spec you're guessing at.

- List every open question: real ambiguity, a contradiction between subtasks, an unstated decision, an
  assumption you would otherwise invent. Skip what the spec already answers.
- Ask them in **one batch** (`AskUserQuestion`). If there are none, say so; don't manufacture questions.
- Write the answers into the subtask sections as settled decisions, so the gate enforces them
  (axis 5, spec) instead of re-litigating them.
- Move rejected approaches to `alternatives_<topic>.md` and leave one line in the spec: *"Considered X —
  abandoned because <one main reason>. See `alternatives_x.md`."* This keeps reviewer tokens down and
  stops a later agent re-proposing a dead approach.

## A2.6. Spec gate (before implementation)

Every reviewer later enforces the spec, so a wrong spec is cheapest to fix here.

- Present the assembled spec concisely: what changed and the decisions that carry risk, not the whole
  file.
- **Wait for explicit go-ahead before any branching or coding.** Fold requested changes into the spec
  (and `alternatives_*.md`) and re-present.

## A3. Implementation

- Load each repo's language skill and the **guidelines skill**; they own branch names, commits, PR
  descriptions, linting and test setup (e.g. shared test schemas).
- **Always reinstall with the install command after branching from `<base>`**; lockfiles may have
  changed since the last checkout.
- Frontend work: capture `before/` snapshots before editing and `after/` before review —
  [reference.md § Frontend design snapshots](reference.md#frontend-design-snapshots).
- Record each branch in the [inventory](#maintain-the-branchpr-inventory) as soon as it exists.

## A4. Review gate → manual gate → PRs

1. Once all subtasks are committed locally and tests are green, run the [review gate](#review-gate):
   two local reviews per subtask + one big-picture review.
2. **Stop at the [manual gate](#manual-gate-before-draft-prs); never open PRs automatically.** A draft
   PR is cheap; the feedback and rework it triggers are not.
3. After approval, [open PRs](#opening-prs),
   [collect review-bot comments](reference.md#waiting-on-review-bot-comments) and address the
   legitimate ones. Only then is a subtask complete.

---

# Flow B — Continuing work

**Read the spec first.** Its `## Branch-/PR-Inventar` and each `### Progress` block are the source of
truth for what exists; work the inventory instead of re-guessing the affected repos.

## B1. Reconcile state

- **First, check what's merged — this gates every write below.** Fetch each inventory PR's state. A
  merged PR is done: never force-push, redeploy, re-gate or bump it (its branch may be deleted or
  protected). A further change to a merged repo is a new branch + PR off the current `<base>`. Record
  the merged state and merge commit in the inventory.
- For each open row, confirm branch and PR still exist and the recorded hash matches what's pushed (an
  earlier force-push may have orphaned it).
- Note which subtasks are `ready`, `needs-changes` or `merged`, and which have open PR comments.

## B2. Verify spec compliance

Re-check each subtask's code against its spec section; either may have moved since. A mismatch is work
to do, not settled. This is the gate's axis-5 (spec) check; when in doubt, run that subtask's reviewer.

## B3. Address PR comments

Collect [review-bot](reference.md#waiting-on-review-bot-comments) and human comments. Address the
legitimate ones **with code, not replies**, and write no
[scope notes to a review bot](reference.md#dont-write-scope-notes-to-a-review-bot). Every code change
passes the gate before it's pushed ([below](#the-review-gate-applies-to-every-subsequent-change)).

## B4. Re-gate, push, record

- **Gate only the subtasks you changed this round.** No code change since its last `ready` → carry
  `ready` forward and continue the flow (reconcile, PR description, bot prune, report). Reviewers on an
  untouched diff waste tokens. If you're unsure (fresh session, out-of-band force-push, a suspected
  stray edit), use the [cross-check](#skip-the-gate-on-an-unchanged-diff).
- Order for any change: squash → reviewer on `git diff <base>...HEAD` → address findings → force-push →
  review bot → test deployment (the last two if the project has them).
- Frontend changes: refresh affected `after/` snapshots before re-review; keep the `before/` baseline.
- After a force-push, redeploy and update the inventory hash — both mandatory
  ([force-push rules](#force-push-rules-for-fixups-on-your-own-story-branch)).
- After the change lands, [refresh the PR description](#keep-the-pr-description-current) and
  [prune stale bot comments](reference.md#prune-outdated-review-bot-comments).
- [Clean up history](#clean-up-history-before-draft-pr-done) before calling a PR done.

---

# Shared reference

## Review gate

Run it once all subtasks are committed and tests are green. The reviewer rubric (axes, out of scope,
YAML output) is `review.md`; the coordination below is yours.

Depth depends on the flow, deliberately: a draft PR is cheap, rework after feedback is costly and slow,
so review hardest before any PR exists.

- **First pass (Flow A):**
  1. **Two independent local reviewers per subtask**, in parallel, each on its own repo's
     `git diff <base>...HEAD` with the same rubric. One reviewer misses roughly half of what two catch,
     and this is where a miss is cheapest to fix. A finding both raise is high-confidence; one raised by
     a single reviewer still counts.
  2. **One big-picture reviewer** afterwards, over all diffs together, for the seams no per-repo
     reviewer or bot can see: contract drift, a rename its consumer missed, an access boundary claimed
     in one repo and enforced nowhere, duplicated logic, and whether the subtasks together satisfy the
     story. Rubric: "Big-picture review" in `review.md`.
- **Flow B updates: one local reviewer per changed subtask.** Re-run big-picture only if the change
  alters a cross-repo contract.

For both:

- Give each reviewer `review.md`, its subtask's spec section, the guidelines skill and the language
  skill. One agent per subtask for the local pass, never one across all repos.
- **Don't re-review the code yourself**; synthesize what the reviewers return.
- **Synthesis:** dedup the two local reviews (a finding both raise ranks higher), then across subtasks
  (the same pattern in three repos is one finding with three locations). Rank by severity, then by how
  many reviewers and subtasks share it. Surface disagreement instead of averaging it. Add nothing new:
  anything only you spotted is labelled `orchestrator-observation`. Big-picture findings form their own
  group. Report a per-subtask verdict table, then ranked findings, then `notes_to_user`.
- **Gate:** all subtasks `ready` and, on first pass, big-picture clean → draft PRs. A `needs-changes`
  subtask: fix its blocking findings, re-run only its local review, re-gate; its PR waits, the others
  don't. A blocking big-picture finding holds every PR it spans.

### Optional: run the gate as a workflow

Run the fan-out by hand (spawn reviewers with the `Agent` tool, synthesize yourself) or, **only when the
user opts into multi-agent orchestration**, through the `Workflow` tool with `review-gate.workflow.js`.
Never launch it silently: it spawns two or more agents per subtask. The script runs:

- local reviewers per subtask — two (`depth: 'first-pass'`) or one (`depth: 'update'`) — schema-forced
  to the `review.md` YAML, retrying until it validates;
- a `verify` stage that adversarially re-checks each blocking finding and drops refuted ones;
- on first pass, one big-picture reviewer over all diffs;
- synthesis in code: merge per subtask, dedup by axis + title, fold in big-picture, rank, compute
  `ready` / `needs-changes`.

Args: `{ depth, specPath, settings, subtasks }`, each subtask with `id`, `repo`, `branch`, `python` and
`specSection` (its own slice of the spec). Returns `{ gate, verdictTable, findings, bigPicture,
notesToUser }`.

## Skip the gate on an unchanged diff

The gate reviews a change; with no change there is nothing to gate.

- **You already know.** You didn't edit a subtask since its last `ready` → skip its review and carry
  `ready` forward. This is the common case on a re-run, a "still good?" check, or a round that touched
  another subtask.
- **Cross-check only when your certainty is in doubt**, with a cheap identity check instead of a review:
  - `git status --porcelain` clean and `git rev-parse HEAD` equals the inventory's reviewed commit →
    skip.
  - Different commit, suspected rewrite only (squash/amend): `git diff <base>...HEAD | git hash-object
    --stdin` equals the recorded reviewed-diff hash → skip. Record that hash in the inventory row
    whenever you gate.
- Any actual edit, even a one-line fixup, gates before push. The skip covers only untouched code.

## The review gate applies to every subsequent change

- A fixup on an already reviewed and deployed branch is still unreviewed code: re-run the subtask
  reviewer before pushing, in the [B4 order](#b4-re-gate-push-record).
- **Pin-only dependency bumps skip the reviewer**, when the change is only a version pin plus its
  re-lock and `git diff <base>...HEAD --stat` shows no source file touched (dev → release and major
  jumps alike). The gate is then tests + linter + the **full branch pipeline, security scan included**
  (e.g. Trivy, `npm audit`): a re-lock can pull a different, vulnerable transitive version (a bump of X
  dragging in a vulnerable `cryptography`), so passing local tests prove nothing about it. A red scan →
  fix the CVE in the same PR, as a separate commit, before deploying. Once the bump forces a code change
  (a renamed symbol, a removed kwarg), the gate applies again. The rest of the B4 tail still runs:
  force-push → redeploy → update inventory → refresh PR description → propose bot prune.
- **A bump across many PRs starts with the [merged check](#b1-reconcile-state).** Bump only repos whose
  PR is still open and that actually depend on the package (scout the pins first). A merged repo that
  needs the new version gets a fresh branch off `<base>`. Fan the bumps out in parallel, one full cycle
  each.

## Manual gate (before draft PRs)

The automated gate is necessary, not sufficient: a human decides whether the story becomes PRs. First
pass only; in Flow B the user is already in the loop per change.

- After the gate returns `ready`, present concisely: the verdict table, ranked findings fixed and left
  unfixed, the big-picture result and `notes_to_user`.
- **Wait for explicit approval before opening any PR.**
- Requested changes are new work: implement them, then gate the delta.

## Opening PRs

- Only after the manual gate. Draft only, with the **PR reviewers** setting as reviewers (ask if
  unset).
- A subtask's PR goes out as soon as it is `ready`, independently of the others.
- A subtask diff over 400 lines (added + removed, generated files excluded) goes out as a stack via the
  `stacked-pr` skill; record every PR of the stack in the inventory.
- A red pipeline **security scan** (e.g. Trivy, `npm audit`) is a blocking finding: fix the CVE in the
  same PR. The guidelines skill has the how where the project defines one.

## Maintain the Branch/PR inventory

As soon as a branch or PR exists, record repo, branch, PR number, commit hash and purpose in
`## Branch-/PR-Inventar`. In Flow B, work from it first.

## Document AI mistakes (major / minor)

Record mistakes in `## AI Mistakes` so later agents check for the error class instead of repeating it.
One line each — every reviewer pays for this section.

- **`### Major`** — escaped and cost rework: retroactive fixes across repos/PRs, a force-push or
  redeploy to undo, a wrong decision that shipped. Write *what went wrong → the check that catches it
  next time*.
- **`### Minor`** — caught before it spread. Record only if the error class is likely to recur; promote
  it to Major once it costs rework.

## Clean up history before "draft PR done"

Squash related "feature + review-fix" commits into one clean feature-level commit per logical change
before reporting a PR done.

## Force-push rules for fixups on your own story branch

- Fixups that belong to the same feature change (review fix, docstring, test convention) are
  squashed/amended into the feature commit and force-pushed **without asking**, even after the PR is
  open and deployed to a test environment. That is the required end state, not a special case.
- **Ask first** if someone else committed to the branch, or if commits reviewed as standalone changes
  would be reordered or removed.
- After a force-push, both are mandatory:
  1. Redeploy to the test environment, if there is one — the old deploy points at a commit that no
     longer exists.
  2. Update the commit hash in the inventory — otherwise it claims a deploy of an orphaned commit.
- A `409 Conflict` on that redeploy of a setuptools-scm dev-versioned library is expected:
  [reference.md § 409 after force-push](reference.md#setuptools-scm-dev-versions-409-after-force-push).

## Keep the PR description current

After any change that alters what the branch does (e.g. a CVE bump, a reversed guard), re-read the PR
description and make it match the diff. The minimality rule still governs: one line summarising the
feature, a second only for a non-obvious tradeoff a reviewer couldn't infer from the diff. Updating
usually means correcting or deleting a line, not adding paragraphs; no file-by-file walkthroughs, test
counts or lint scores. A self-evident change may need no edit.
