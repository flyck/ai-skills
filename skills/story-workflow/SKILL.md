---
name: story-workflow
description: End-to-end workflow for implementing a story across one or more repos, from discovery through implementation, review gate, and PR handling. Use when starting work on a story/spec that spans subtasks across repos, when deciding whether code is ready for a PR, or when running the multi-repo review gate before opening PRs.
---

Run a multi-repo story from discovery to merged-ready PRs in a consistent order. There are
two flows. Pick by the state of the spec file:

- **[Flow A — Discovery & first pass](#flow-a--discovery--first-pass)**: no spec file yet, or a spec
  with no implemented subtasks. Scaffold → discover → clarify → **spec gate** → implement → review
  gate → **manual gate** → PRs.
- **[Flow B — Continuing work](#flow-b--continuing-work)**: a spec file already holds the
  Branch-/PR-Inventar and per-subtask progress. Resume from that state: verify spec compliance,
  address PR comments, re-gate changed code.

Both flows lean on the same building blocks — the review gate, the inventory, the force-push
and review-bot rules — collected under [Shared reference](#shared-reference). The flows link
into them; don't duplicate them.

**Keep the prose and the workflow scripts in sync — they are one contract, two encodings.** This
`SKILL.md` describes the flow in prose; the companion scripts (`review-gate.workflow.js` for the gate,
`flow-b.workflow.js` for the full Flow-B continuation) execute the *same* steps deterministically. A
reader must be able to run **either** — follow the prose by hand, or launch the workflow — and get the
same behaviour. Therefore: **whenever you add, remove, or change a flow step in one, make the matching
change in the other in the same edit.** If you add a step to Flow B in prose (e.g. PR-description
refresh, review-bot prune, skip-detection), add the corresponding stage/prompt to `flow-b.workflow.js`; if
you tighten a reviewer rule in the script, reflect it in the prose. A step that exists in only one is
a bug — it silently does nothing whichever path the user didn't take. When they drift, treat the prose
as the source of truth and bring the script back to it.

## Project settings

A few steps depend on the project's tooling. Before A1 or B1, load the project's guidelines skill if
there is one (for company work, the company's guidelines skill) and read its **story workflow
settings**. A missing setting falls back to the default below; a step whose default is "none" is
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

Language skills come on top: `python-coding` for Python repos. Pass the same values to the workflow
scripts as `args.settings` (see their headers).

---

# Flow A — Discovery & first pass

## A1. Scaffold the spec file

If no spec file exists yet, scaffold one from the ticket before anything else. Given a ticket key:

- Pull the ticket and its subtasks through the **ticket source** setting.
- Write `specs.md` in the working directory with this shape:
  - An H1 with the ticket key + summary, then a **2-3 sentence** intent line — not the full ticket
    description.
  - **One `##` subheading per existing subtask**, titled `<subtask-key> — <summary>`. Under
    each, write **terse bullets, not the ticket prose verbatim**: the decisions, the acceptance
    criteria, and explicit non-goals. Then an empty `### Implementation plan` block for Discovery
    and a `### Progress` block (status, branch, PR — starts empty).
  - A `## Branch-/PR-Inventar` section (empty table) and an `## AI Mistakes` section with empty
    `### Major` and `### Minor` subsections — see
    [Maintain the Branch/PR inventory](#maintain-the-branchpr-inventory) and
    [Document AI mistakes](#document-ai-mistakes-major--minor).
- **Keep it lean — this is a token budget, not just style.** Each subtask's section is passed to
  every reviewer (two local + big-picture + fix agents, per round), so bloat is paid many times
  over. Distil the ticket to what someone needs to implement and review the subtask; drop
  restatement, background, and history. A reviewer only ever gets its own subtask's slice, never the
  whole spec.
- Do **not** invent subtasks that aren't in the ticket. Missing subtasks are surfaced during Discovery,
  not here — this step only mirrors the ticket's current state into the spec.
- If a spec file already exists, skip scaffolding. If it already has implemented subtasks, you're in
  **Flow B**, not here.

## A2. Discovery

- Use the **repo map** setting to discover the relevant repos for the story and identify
  missing subtasks or details to add to existing subtasks. Record findings into each subtask's
  `### Implementation plan` block in the spec.
- Be concise. Stay strictly on point. Omit anything obvious; only call out non-trivial, unexpected
  information.

## A2.5. Clarify open questions

The cheapest moment to catch a misunderstanding is before any code exists — cheaper than the review
gate, cheaper than PR feedback. Don't skip to implementation on a spec you're guessing at.

- Read the scaffolded spec plus the discovery findings and list every **open question**: genuine
  ambiguity, contradiction between subtasks, a decision the ticket leaves unstated, or an assumption
  you'd otherwise have to invent. Do not list things the spec already answers.
- Put them to the user in **one batch** (`AskUserQuestion`), not one at a time. If there are none,
  say so and move on — don't manufacture questions.
- **Write the answers back into the spec** as settled decisions in the relevant subtask section, so
  the review gate later enforces them (axis 5, spec) instead of re-litigating them.
- **Move discarded approaches out of the spec.** When an approach is decided against during
  discovery/clarification, don't leave it (or a rebuttal of it) in `specs.md` — that's token weight
  every reviewer pays for repeatedly. Move the detail to `alternatives_<topic>.md` and leave a single
  line in the spec: *"Considered X — abandoned because <one main reason>. See `alternatives_x.md`."*
  This keeps the spec lean while preserving the reasoning, so a later agent doesn't re-propose a dead
  approach.
- Only once the open questions are resolved do you assemble the final spec for the gate below.

## A2.6. Spec gate (before implementation)

A finalized spec is a checkpoint, not a green light to start coding. The spec is what every reviewer
later enforces against — a wrong spec here is cheaper to fix than at the review gate or in PR
feedback, so get a human sign-off first.

- Present the **assembled spec**: decisions written back from clarification, discarded approaches
  moved to `alternatives_*.md`, and each subtask's `### Implementation plan` filled from discovery.
  Be concise — point at what changed and the decisions that carry risk, don't reprint the whole file.
- **Wait for explicit user go-ahead before any branching or coding.** No auto-advance.
- If the user wants changes, fold them into the spec (and `alternatives_*.md` where relevant) and
  re-present — don't start implementing against a spec the user hasn't approved.

## A3. Implementation

- Only after the spec gate is approved, start branching and implementing. Follow the project's
  commit style.
- Load each repo's language skill (`python-coding` for Python) and the **guidelines skill**. They own
  branch names, commits, PR descriptions, linting, and project test setup such as shared test
  schemas.
- **Always reinstall fresh after branching from `<base>`**, with the **install command** — the local
  install is otherwise stale (lockfiles/dependencies may have changed since the last checkout).
- For frontend work, capture the baseline before editing, then the implemented states before review:
  [Frontend design snapshots](#frontend-design-snapshots).
- Record each branch in the inventory as soon as it's created — see
  [Maintain the Branch/PR inventory](#maintain-the-branchpr-inventory).

## A4. Review gate → manual gate → PRs

- Run the [Review gate](#review-gate) once all subtasks are committed locally and tests are green.
  On the first pass this is two local reviews per subtask + one big-picture review.
- **Then stop at the [manual gate](#manual-gate-before-draft-prs) — do not open PRs automatically.**
  Present the results to the user and wait for explicit go-ahead. Drafting a PR is cheap; the
  feedback-and-rework it triggers is not.
- Only after the user approves: open PRs per [Opening PRs](#opening-prs), collect review-bot comments per
  [Waiting on review-bot comments](#waiting-on-review-bot-comments), and address the legitimate ones. Only
  then is a subtask complete.

---

# Flow B — Continuing work

You're resuming a story whose spec file already tracks state. **Read the spec first** — its
`## Branch-/PR-Inventar` and each subtask's `### Progress` block are the source of truth for what
exists and where it stands. Work the inventory rather than re-guessing which repos are affected.

## B1. Reconcile state

- **FIRST, check what's already merged.** Before any per-repo work, fetch each inventory PR's state
  and mark the merged ones. A **merged** PR is done — do **not** force-push its branch, redeploy it,
  re-gate it, or bump a dependency on it: the branch may be deleted or protected, and force-pushing a
  merged branch is wrong. If a merged repo needs a further change (e.g. a new dependency version or a
  follow-up schema change), that is a **new branch + new PR off the current `<base>`**, never a push to
  the closed one. Record the merged state and merge commit in the inventory so later rounds don't
  re-touch it. This check gates everything below — a workflow that force-pushes must run it before its
  first write.
- For each **non-merged** inventory row, confirm the branch and PR still exist and the recorded commit
  hash matches what's actually pushed (a prior force-push may have orphaned it — see
  [Force-push rules](#force-push-rules-for-fixups-on-your-own-story-branch)).
- Note which subtasks are `ready`, which are `needs-changes`, which are `merged`, and which have open
  PR comments.

## B2. Verify spec compliance

- For each subtask, re-check the code against its spec section — the spec may have moved on since the
  code was written, or the code may have drifted. Treat any mismatch as work to do, not as settled.
- This is the same axis-4 check the gate applies; if in doubt, run that subtask's reviewer.

## B3. Address PR comments

- Collect open comments per [Waiting on review-bot comments](#waiting-on-review-bot-comments) and
  human reviewer comments. Address the legitimate ones **with code, not replies** — and mind
  [Don't write "scope notes" to a review bot](#dont-write-scope-notes-to-a-review-bot).
- Any code change here is unreviewed code: it must pass the gate before it's pushed — see
  [The review gate applies to every subsequent change](#the-review-gate-applies-to-every-subsequent-change).

## B4. Re-gate, push, record

- **Skip the gate when nothing changed — walk the flow, don't redo the work.** The primary signal is
  simple: **you know whether you changed a subtask this round.** If you made no code change to a
  subtask since it last returned `ready`, there is nothing to re-review — carry the prior `ready`
  forward and just continue the flow (state reconciliation, PR-description check, review-bot prune, report).
  Do NOT spawn reviewers to re-confirm an untouched diff; that is wasted tokens, not diligence. Only
  gate the subtask(s) you actually touched. See
  [Skip the gate on an unchanged diff](#skip-the-gate-on-an-unchanged-diff) for the cross-check to use
  when your own certainty is in doubt (resuming Flow B, an out-of-band force-push, an uncommitted-edit
  scare).
- Order for any change: squash → reviewer on `git diff <base>...HEAD` → address findings → force-push
  → review bot → test deployment (the last two if the project has them).
- For frontend changes, refresh affected `after/` snapshots before re-review, preserving the original
  `before/` baseline; follow [Frontend design snapshots](#frontend-design-snapshots).
- After a force-push, redeploy the test environment (if the project has one) and update the commit
  hash in the inventory — both mandatory, see
  [Force-push rules](#force-push-rules-for-fixups-on-your-own-story-branch).
- After the change lands, **re-check the PR description is still accurate** and **prune stale
  review-bot comments** — see [Keep the PR description current](#keep-the-pr-description-current) and
  [Prune outdated review-bot comments](#prune-outdated-review-bot-comments).
- Clean up history before calling a PR done — see
  [Clean up history](#clean-up-history-before-draft-pr-done).

---

# Shared reference

## Frontend design snapshots

- For frontend changes, create **`before/` and `after/` beside the spec** and capture PNGs of the
  relevant screens and states so the user can compare progress and share it with a designer.
- Derive the scenario set from the spec and feedback: populated, empty, disabled/not enabled,
  permission-dependent and error states where relevant, plus narrow layouts when affected.
  Include connected screens when needed to explain a flow, such as the settings screen for enabling
  a disabled feature; do not produce an exhaustive matrix of unrelated states.
- Use a **temporary Playwright test and config** in an ignored scratch directory. Reuse the app's
  login helpers and mock API responses to reach each state while rendering the actual components;
  do not add screenshot-only scaffolding or pixel assertions to permanent behavior tests.
- Capture `before/` from the pre-change app before implementation. If work has already started,
  use an isolated checkout of the recorded baseline revision; never overwrite current work or label
  the modified app as “before”. Preserve existing baseline images on subsequent feedback rounds.
- Capture the current implementation into `after/` using the same fixture data, locale, viewport
  and framing as its baseline. Use matching descriptive filenames such as
  `location-disabled-desktop.png`; document new screens with no baseline counterpart.
- Wait for the intended tab/state, fonts, loading and transitions to settle before capture.
  Clear incidental hover/focus unless that state is the subject, and crop to the relevant panel or
  page; use synthetic data rather than live customer data.
- **Open and inspect the PNGs** before sharing them: verify the actual state and capture framing.
  Record scenario, mocked conditions, viewport and baseline/current revision in the spec's working
  state companion, and return direct links to the images; the PNGs belong with the spec, not solely
  in disposable Playwright reports or application assets.
- Refresh affected `after/` images after visual changes, and remove temporary harness files when
  finished. If a screen cannot be reproduced, record the missing capture and reason explicitly;
  screenshots support design review and do not replace behavioral tests or the code-review gate.
- When using the workflow scripts, mark UI subtasks `frontend: true`, provide `specPath`, and pass
  `baselineRef` if the baseline is not `origin/<base>`. Their screenshot stage runs before local review
  (and after fix rounds); unchanged or merged Flow B subtasks keep their existing snapshots.

## Skip the gate on an unchanged diff

The gate reviews a *change*. If there's no change to a subtask, there's nothing to gate.

- **Primary signal — you already know.** You are the orchestrator; you know whether you edited a
  subtask's code this round. Made no change since its last `ready` → skip its review outright and
  carry the `ready` forward. This is the common case on a re-run, a "is it still good?" check, or a
  round that only touched a *different* subtask. Don't spawn reviewers to tell you what you already
  know.
- **Cross-check — only when your certainty is in doubt.** Resuming Flow B in a fresh session, a
  force-push that may have happened out of band, or a worry that an edit slipped in: verify with a
  cheap diff-identity check rather than a full review.
  - `git status --porcelain` clean AND `git rev-parse HEAD` equals the inventory's recorded reviewed
    commit → unchanged, skip.
  - If the commit differs but you suspect only a rewrite (squash/amend), compare content not sha:
    `git diff <base>...HEAD | git hash-object --stdin`. Equal to the recorded reviewed-diff hash →
    functionally unchanged, skip. (Record that hash in the inventory row when you gate, so this
    comparison is possible later.)
- **Skipping is not the same as never gating.** Any actual edit — even a one-line fixup — is a change
  and must gate before it's pushed (see
  [The review gate applies to every subsequent change](#the-review-gate-applies-to-every-subsequent-change)).
  The skip only covers the genuinely-untouched case.

## Review gate

Once all subtasks are committed locally and tests are green, run the gate. The **reviewer's rubric**
(axes, out-of-scope, YAML output schema) lives in `review.md`; the **coordination** below is yours.

**Gate depth depends on the flow — this is deliberate.** Drafting a PR is cheap; taking in feedback
and reworking after the fact is costly and causes long delays. So front-load review where it's
cheapest — before the PR exists:

- **First pass (Flow A, before any draft PR): two local reviews per subtask + one big-picture
  review.** Spend the effort here.
  1. **Two independent local reviewers per subtask**, in parallel, each scoped only to its own repo's
     diff (`git diff <base>...HEAD`). Two, not one, because a single reviewer misses roughly half of
     what two catch, and here is where a miss is cheapest to fix. Give both the same rubric; a finding
     both raise is high-confidence, a finding only one raises still counts.
  2. **One big-picture reviewer across all subtasks**, after the local ones. It reads every subtask's
     diff together and checks the seams no single-repo reviewer (and no per-repo review bot) can
     see: cross-repo contract drift, a field renamed in one repo but not its consumer, an access
     boundary claimed in one repo and never enforced, duplicated logic that should be shared, and
     whether the subtasks together actually satisfy the story. Its rubric is the "Big-picture review"
     section of `review.md`.
- **Subsequent updates (Flow B): one local review per changed subtask** is enough. The big-picture
  seams were already established in the first pass; you're re-checking a delta, not the whole story.
  (The big-picture review only re-runs if a change alters a cross-repo contract.)

Common to both:

- Hand each reviewer `review.md`, its subtask's spec section, the guidelines skill and the repo's
  language skill (`python-coding` for Python). Do not spawn one agent across all repos for the *local* pass — per-subtask
  is the right granularity there; the cross-repo view is the separate big-picture reviewer's job.
- **You do not re-review the code yourself.** You synthesize what the reviewers return.
- **Synthesis:** merge the two local reviewers per subtask (dedup identical findings; a finding both
  raise ranks higher). Then dedup across subtasks (the same pattern in three repos is one finding
  with three locations); rank by severity then by how many subtasks/reviewers share it; surface
  dissent rather than averaging when reviewers disagree; introduce nothing new — anything you spot
  that no reviewer raised is labelled `orchestrator-observation`. Fold the big-picture reviewer's
  findings in as their own group. Report as a per-subtask verdict table, then ranked findings, then
  `notes_to_user`.
- **Gate:** all subtasks `ready` **and** the big-picture review clean (first pass) → proceed to draft
  PRs. Any subtask `needs-changes` → fix the blocking findings in that repo, re-run **only** that
  subtask's local review, then re-gate. Don't create that subtask's PR in the meantime; other
  subtasks' PRs need not wait. A blocking big-picture finding holds every PR it spans.

### Optional: run the gate as a deterministic workflow

The fan-out above can be run by hand (spawn reviewers via the `Agent` tool and synthesize yourself),
or — **when the user opts into multi-agent orchestration** — as a forced state machine via the
`Workflow` tool. The companion script `review-gate.workflow.js` encodes exactly this gate, honoring
the two-intensity rule above via a `depth` arg:

- **two local reviewers per subtask** (`depth: 'first-pass'`) or **one** (`depth: 'update'`), each
  **schema-forced** to the `review.md` YAML shape (retries until it validates — no prose to parse);
- a `verify` stage that adversarially re-checks each **blocking** finding and drops the refuted ones;
- on `first-pass`, **one big-picture reviewer** over all subtask diffs together, using the
  big-picture rubric in `review.md`;
- orchestrator synthesis in plain code: merge the two local reviewers per subtask, dedup by
  axis+title into one finding with many locations, fold in big-picture findings, rank, and compute
  the `ready` / `needs-changes` gate.

Run it with `args = { depth, specPath, settings, subtasks }` — each subtask: `id`, `repo`, `branch`, `python`,
`specSection` (its own slice of the spec). It returns `{ gate, verdictTable, findings, bigPicture,
notesToUser }`. The prose gate and the workflow are the same contract — use whichever fits the run.
Don't invoke the workflow silently; it spawns two-plus agents per subtask and needs the user's
opt-in.

## The review gate applies to every subsequent change

- Not just before the first PR. Even a small fixup on an already-reviewed and deployed branch is
  unreviewed code.
- Before pushing, re-run the same subtask reviewer (`review.md` rubric + the gate coordination
  above).
- Order: squash → reviewer on `git diff <base>...HEAD` → address findings → force-push → review bot →
  test deployment (the last two if the project has them).
- **Exception — pin-only dependency bumps need no review.** When the *only* change is a dependency
  version pin plus its re-lock (e.g. swapping a library from a dev version to a release, or a stable
  bump) and **no first-party source is touched**, skip the reviewer. **The gate here is tests + linter
  + the *full* pipeline going green — and "green" INCLUDES the security scan** (e.g. Trivy,
  `npm audit`), not just unit tests. A re-lock routinely pulls a *different* transitive
  version than before (a bump to lib X can drag in a vulnerable `cryptography`), so a lock that passes
  pytest can still fail the security scan. Do not treat local tests+linter as sufficient evidence a
  pin-only bump is shippable: wait for the branch pipeline's security step, and if it's red, fix the
  CVE in the same PR (a separate commit) before deploying. A review agent adds nothing to a mechanical
  pin swap. This holds regardless of
  dev→release vs a major-version jump, *as long as* no `.py` (or other source) file changed — verify
  that with `git diff <base>...HEAD --stat` before claiming the exemption. The moment the bump forces a
  code change (a renamed symbol, a removed kwarg), it is no longer pin-only and the gate applies
  again. The other Flow-B tail steps still run: force-push → redeploy → update inventory → refresh PR
  description → propose review-bot prune.
- **A dependency bump across many PRs starts with the merged-check ([B1](#b1-reconcile-state)).** Only
  bump repos whose PR is still open AND that actually depend on the package (scout the pins first —
  bumping a non-dependent repo is noise). A repo whose PR is already **merged** does not get a
  branch-push bump; if it genuinely needs the new version, that's a fresh branch off `<base>`. Fan the
  bumps out in parallel (they touch different repos), one full cycle each.

## Manual gate (before draft PRs)

The automated review gate passing is **necessary but not sufficient** — a human decides whether the
story becomes PRs. On the first pass, after the gate returns `ready`:

- Present to the user: the per-subtask verdict table, the ranked findings that were fixed and any
  left unfixed, the big-picture result, and `notes_to_user`. Be concise.
- **Wait for explicit approval before opening any PR.** No auto-advance.
- If the user wants changes, treat them as new work: implement, then re-run the gate on the delta
  ([the gate applies to every subsequent change](#the-review-gate-applies-to-every-subsequent-change)).
- This gate is first-pass only. On Flow B updates the user is already in the loop per change, so it
  doesn't re-block every fixup.

## Opening PRs

- Only after the manual gate. Open as **draft**, with the **PR reviewers** setting as reviewers (ask if unset).
- A subtask whose diff exceeds 400 lines (added + removed, generated files excluded) goes out as a
  stack of PRs via the `stacked-pr` skill. Record every PR of the stack in the inventory.
- A subtask with `needs-changes` only gets its PR once the blocking findings are fixed and that one
  reviewer has re-run — other PRs don't need to wait.
- As soon as a subtask's agent review is `ready`, its draft PR can go out independently of the
  others.

## Maintain the Branch/PR inventory

- As soon as a branch or PR is created for this spec, record repo, branch, PR number, commit hash,
  and purpose in the spec's `## Branch-/PR-Inventar` section.
- On later review or fix rounds (Flow B), work through this inventory first instead of re-guessing
  which repos are affected.

## Document AI mistakes (major / minor)

Record mistakes in the spec's `## AI Mistakes` section so later agents check for that error class
instead of repeating it. Split into two tiers:

- **`### Major`** — an error that escaped and cost rework: required retroactively fixing multiple
  repos/PRs, a force-push/redeploy to undo, or a wrong decision that shipped. These are the
  high-signal ones; write each as *what went wrong → the check that catches it next time*.
- **`### Minor`** — a slip caught before it spread (wrong assumption corrected in the same session, a
  convention missed and fixed in review). Record only if the error class is likely to recur; a
  one-off typo is not worth a line.

Keep entries to one line each — this section is in the spec, which every reviewer pays for. If a
minor entry recurs and starts costing rework, promote it to Major.

## Clean up history before "draft PR done"

- After review/fix rounds, squash/fixup related commits so a PR doesn't end up with several small
  "feature + review-fix" commits for the same underlying change.
- Goal: one clean feature-level commit per logically related change before the PR is reported as
  done.

## Force-push rules for fixups on your own story branch

- Force-pushing fixups is allowed without asking, when a follow-up belongs to the same feature change
  (review fix, docstring, test convention) and doesn't justify a second commit — squash/amend into
  the feature commit and force-push, even if the branch already has a PR and was already deployed to a
  test environment. This is the required end state, not a special case.
- **Do** ask first if someone else has committed to the branch, or if commits that were reviewed as
  standalone changes would be reordered/removed.
- After a force-push, both of the following are mandatory:
  1. Redeploy to the test environment, if the project has one (the old deploy points at a commit
     that no longer exists).
  2. Update the commit hash in the `Branch-/PR-Inventar` row — otherwise the table claims a
     successful deploy for an orphaned commit.
- **setuptools-scm dev-versioned libraries: a redeploy after force-push can 409.** For a Python lib
  whose publish step is `twine upload` of a scm-derived dev version (e.g. `1.1.5.dev3` from
  `git describe` = `vX.Y.Z-<N>-g<sha>`), the version is a function of the commit **distance** from the
  last tag, not the sha. A force-push that keeps the same commit count re-computes the **same** dev
  version, and the package index refuses to overwrite it → `409 Conflict`. This is expected, not a
  broken deploy: the already-published artifact from the pre-force-push commit is functionally
  identical when the rewrite only squashed cosmetic fixups (comment/docstring/inline refactor with no
  behaviour or public-API change). Record the 409 honestly in the inventory and move on — do **not**
  retry-loop. A genuinely new publish requires a new commit *count* (an extra commit) or a new tag;
  only pursue that if the rewrite changed behaviour a consumer must receive. A lockfile change
  (e.g. a CVE bump) does advance nothing here either — the version still comes from the tag distance.

## Waiting on review-bot comments

Skip this section if the project has no **AI review bot** setting.

- After a draft PR, the bot needs some time before its comments appear (the setting says how long) —
  wait briefly, then fetch them through the **PR host**. Don't report the PR done immediately.
- Go through the comments and address the legitimate ones; only then is the subtask complete.
- With multiple PRs, open all of them first and then collect comments together, rather than waiting
  per PR.
- A red pipeline **security scan** (e.g. Trivy, `npm audit`) is a blocking finding too: fix the CVE in
  the same PR. The guidelines skill has the how where the project defines one.

## Keep the PR description current

- A change round can make the PR description stale — it may now describe code that changed, or omit a
  decision the round introduced (e.g. a CVE bump, a reversed guard). After any change that alters what
  the branch does, re-read the description and update it so it still matches the diff.
- **The PR-description minimality rule still governs** — do not turn "keep it current" into "make it
  longer". One line summarising the feature; a second line only for a genuinely non-obvious
  tradeoff or decision a reviewer couldn't infer from the diff. Updating usually means correcting or
  deleting a now-wrong line, not adding paragraphs. No file-by-file walkthroughs, test counts, or lint
  scores. If the change is self-evident from the diff, the description may need no edit at all.

## Prune outdated review-bot comments

- After a change round, bot comments from an earlier revision can be **obsolete** — they point at a
  line that no longer exists, flag code that was already changed, or restate a concern the new commit
  resolved. Leaving them clutters the PR for human reviewers and misrepresents the current state.
- Fetch the open comments through the **PR host**, and for each, decide: still-valid → address with
  code; **obsolete/superseded → delete it**; low-signal noise the bot shouldn't have raised → delete
  it. Resolve or delete rather than reply.
- **Repeated summary posts usually make up the bulk of this, and they all go.** Many bots post an
  acceptance-criteria or summary report on every push, so a branch with a few change rounds piles up
  near-duplicates (16 across three PRs in one story, versus one real finding). On a multi-repo story
  they are also systematically wrong: the bot sees one repo's diff, so a criterion satisfied by a
  sibling repo reads as "could not determine". Delete them all; keep the substantive inline findings.
  The bot setting names its report format. Do not reply to explain the cross-repo picture — see
  [Don't write "scope notes" to a review bot](#dont-write-scope-notes-to-a-review-bot).
- This is deletion of comments **you or the bot authored on your own story PR** — the orchestrator
  may do it without a fresh prompt. But deletion is an **irreversible external write**, so a fan-out
  **workflow agent must only PROPOSE deletions, never execute them** — the orchestrator performs the
  DELETE after reviewing the proposals (with the user in the loop when in doubt). Do **not** delete a
  human reviewer's comment under any circumstances; those you address or reply to, never remove.

## Don't write "scope notes" to a review bot

- A per-repo bot only evaluates a single repo's diff and can't see a permission or behaviour
  implemented in a different repo. It will often incorrectly claim an acceptance criterion isn't met
  (e.g. "the secret field is visible to read-only users") even though the boundary is correctly implemented
  elsewhere.
- **Ignore such comments without a reply** — don't answer with an explanation that walks through the
  story's scope across repos.
- Anti-example (do **not** do this): *"Scope note for the acceptance-criteria comments: this database
  PR only introduces the new table … the read-only role restriction … is intentionally
  implemented in the companion application repos … No database change is required here."* This is
  prose aimed at a bot that won't use it, it clutters the PR for human reviewers, and it reads as a
  defense against a finding rather than as code.
- Only respond to comments that demand a real change — and respond with code, not a reply.
