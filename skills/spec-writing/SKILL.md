---
name: spec-writing
description: Write or review a technical spec so it is clear, structured, concise, and non-repetitive. Use when drafting a spec or design document, when reviewing someone else's spec, or when deciding whether a spec is complete enough to build from. Applies the spec rules and their review checklist.
---

Write specs that let someone build the right thing without asking questions, and let a reviewer find the flaw before it costs a sprint. A spec fails in two directions: too thin, and the reader guesses; too padded, and the reader skims past the one paragraph that mattered. Both look finished, which is why they survive until implementation.

## Steps

Pick the workflow that matches the task; they are not sequential.

- **Authoring a spec** → `### Writing a spec`
- **A spec changed and needs re-review** → `### Review workflow`
- **Acting as the reviewer** → `### Reviewing a spec`

The rules below apply to all three and are the single authority for what a good spec requires.

## The rules

Keywords follow RFC 2119: **MUST** is a hard requirement — violating it makes the spec defective. **SHOULD** is a strong default — depart from it only with a stated reason. **CAN** is permission, not obligation.

The spec's companion files, each linked once from the spec and opened only when the work needs it:

| File | Holds | Ages as | Rule |
|---|---|---|---|
| `research.md` | concrete findings and what they may imply | dated snapshot | 13 |
| `alternatives.md` | rejected options | archive | 14 |
| `out-of-scope.md` | exclusions that need more than one line | archive | 8 |
| `rationale.md` | the justification of kept decisions | archive | 17 |
| `process.md` | live state of multi-repo/branch/environment work | live, MUST be current | 15 |

**1. Lead with the decision; `spec.md` is the entry point**

- The spec MUST open with what the thing is and what it does. Research, alternatives and reasoning MUST come after, and SHOULD appear only where they change a choice.
- A `README.md`, `index.md`, `overview.md` or `summary.md` beside the spec MUST NOT be written: it would be a third copy of the opening and the companion links (rule 2), and an extra hop for every reader.
- If the set needs orientation the first section does not give, fix that section. Indexes someone else owns (a repo's top-level `README.md`, a docs site) link to the spec and do not restate it.

**2. State one fact once**

- Every fact MUST have exactly one home; any second occurrence MUST be a cross-reference (`§3.1`). When a threshold, name or constraint appears twice, one copy is already stale.

**3. Separate verified from assumed**

- Every load-bearing claim MUST be marked verified or assumed. An unmarked assumption presented as fact is the most expensive defect a spec can carry.
- Verified claims MUST cite a source (file and line, command output, ticket), and SHOULD prefer a re-runnable command over a bare number, since counts drift.

**4. Make blockers impossible to miss**

- Every blocker MUST be flagged inline and collected in one list, naming what it blocks and what decision resolves it.
- The list SHOULD separate blockers needing a human decision from mechanical ones.

**5. Put decisions in tables, not prose**

- Options, thresholds, comparisons and mappings SHOULD be tables.
- Whenever options are presented, the spec MUST recommend one and say why; the case against the losers goes to `alternatives.md` (rule 14).

**6. Prefer structure over transitions**

- Sections SHOULD be independently readable through headings, tables and lists.
- Connective prose ("As we saw above…", "It is worth noting that…") and sentences that only bridge two ideas SHOULD be cut.

**7. Be concrete and falsifiable**

- Every requirement MUST be verifiable: someone can point at the result and say whether it holds.
- Requirements SHOULD be numbers, names and paths — `p99 < 200ms`, `threshold >= 1`, `terraform/cloudwatch.alerts.tf`.
- Requirements MUST NOT rest on unquantified adjectives such as "fast", "robust" or "handles errors gracefully".

**8. Bound the scope explicitly; the reasoning goes in `out-of-scope.md`**

- The spec MUST state what is out of scope as clearly as what is in. Phased work MUST be ordered by dependency and SHOULD name which phases are unblocked today.
- The spec MUST carry the list and MUST NOT carry the argument: one line per exclusion, with at most a short clause of reason. Anything longer moves to `out-of-scope.md`: what it is, why it is out, what would bring it in, and whether anything in scope depends on it.
- An exclusion whose reason the builder needs to build correctly stays at full weight — it is a constraint (rule 7), not scope.
- A deferral MUST name what it is blocked on and link the blocker (rule 4); "follow-up story" alone is not a boundary.
- Test: a reader who only needs the argument to *challenge* the boundary, not to *build*, finds it in `out-of-scope.md`.

**9. Write the failure modes down**

- Failure modes MUST be named with their cost and mitigation.
- The spec SHOULD include the failure mode where its own approach produces a confident wrong answer.

**10. Cut what no reader acts on; fit one sitting**

- Content no reader would act on MUST be cut; restated background, defensive hedging and ceremony are the usual offenders.
- The body SHOULD fit **two pages — about 150 lines**, excluding companions, and no section SHOULD exceed **15% of the body**. A large section usually means justification (rule 17) or findings (rule 13) have collected there.
- A breach is fixed by **routing content out**, never by compressing an instruction: cutting a constraint trades a readable spec for a wrong build.

**11. Do not spend a heading on a single point**

- A heading whose body is one sentence or item SHOULD be a bullet in its parent section; merge sibling one-liners into one list.
- Keep a heading only when a reader would plausibly jump straight to it.

**12. Turn runs of short paragraphs into a list**

- Three or more consecutive paragraphs of one or two sentences SHOULD be a bullet list; they are almost always parallel points.
- Keep prose only when each paragraph builds on the one before.

**13. Specific findings live in `research.md`; the spec stays general**

- The spec MUST describe a process, not an inventory. Counts, resource names, line numbers, environment details and worked examples MUST move to `research.md`. "There are 18 alarms" is wrong the week someone adds one; "derive the alarm set at runtime" stays true.
- General is not vague: the process MUST still work for the case that prompted it. Every trap found in research SHOULD appear in the spec as a general rule ("directory names are unreliable, match on the remote URL"), with its instance in `research.md`.
- `research.md` SHOULD record each observation and what it may imply, and MUST NOT restate the spec's decision, so it can be re-read honestly when that decision is reconsidered.

**14. Rejected options live in `alternatives.md`, not the spec**

- Rejected approaches MUST move to `alternatives.md`. The spec MUST state the decision with a one-line reason, and MUST NOT carry paragraphs on what was not done, why it was tempting, or what the author worried about.
- `alternatives.md` SHOULD hold one entry per option: what it was, why it lost, and what would have to change for it to win.
- Options still open are not alternatives; they are decisions (rule 5) or blockers (rule 4), and stay in the spec.

**15. Working state lives in `process.md`, and MUST be kept current**

- Work spanning repositories, branches or environments MUST track state in `process.md`, one row per unit: repository, branch, PR, last commit checked, build status, deploy status, caveat.
- It MUST be updated as part of every push, pipeline run, deploy, merge or scope change, not as a later tidy-up — a stale row is trusted, so it is worse than none.
- Each row SHOULD carry the timestamp or commit it was last verified against.
- It MUST NOT hold decisions, findings or reasoning; a row needing a paragraph links to where it lives.
- It SHOULD be deleted or archived when the work completes.

**16. Every spec MUST carry its own re-review rule**

- The spec MUST state that `spec-writing`'s `### Review workflow` runs after every material change (defined in that workflow's step 5). The notice SHOULD sit beside the companion links:

  > **Any material change to this spec requires a fresh `spec-writing` review before the spec is treated as current** — a change to a fact, threshold, count, scope boundary, phase order, blocker, or principle. Wording and typo fixes do not.

- The notice lives in the artifact because the next editor — months later, mid-incident, or an agent given only a path — will not have loaded this skill.

**17. A decision's justification lives in `rationale.md`; the spec states the decision and its constraints**

Split every kept decision into three parts and route each:

| Part | Example | Where |
|---|---|---|
| The decision | "guard the join structurally, not by marker column" | the spec, one line |
| Its constraints — what an implementer must obey to get it right | "must treat subqueries as opaque; must be an outer join" | the spec, as requirements (rule 7) |
| Its justification — why it is correct, and the proof | the compiled-SQL experiment showing the false positive | `rationale.md` |

- The spec MUST state the decision and its constraints. A constraint is not justification even when it needs a sentence: violating it writes a bug, so it stays.
- The spec MUST NOT carry the derivation — the proving experiment, the failure avoided, the mechanism; that goes to `rationale.md`, keyed to the decision.
- The spec SHOULD NOT carry implementation code. A signature or data shape belongs when it *is* the interface; a function body moves to `rationale.md` as evidence or is deleted.
- A decision whose reasoning will not compress to one line is usually two decisions; split it first.

**18. Say it once, in the shortest form that carries the instruction**

- Prose SHOULD stay under **about a third** of the body's lines; above that the spec is narrated rather than specified, and the fix is form, not deletion.
- A constraint SHOULD be one list line, and a decision one sentence; a needed "because" is justification (rule 17).
- A sentence announcing the next block SHOULD be cut (rule 6); a first sentence restating its heading, and a closing summary, MUST NOT be written.
- A fact with a citation SHOULD be written as `fact (path:line)`.

**19. Every section is a list; every bullet is one or two sentences**

- Every section MUST be a bulleted or numbered list; tables count.
- Every bullet MUST be **at most two sentences**; a third means two bullets, or one plus a `rationale.md` entry.
- A section CAN open with **one** framing sentence and MUST NOT close with a summarising one.
- Prose paragraphs are allowed only for a genuine argument where each sentence depends on the last — a rare exception to justify, not a fallback.
- Any paragraph or bullet of three or more sentences is a finding. Fix it by splitting or moving the surplus to a companion, never by deleting a constraint (rule 10).

### Writing a spec

1. **Establish the facts before drafting.** Read the actual code, config and infrastructure, citing as you confirm (rule 3); facts gathered after the structure is set get bent to fit it.
2. **Draft against the rules:** decision first (1), verified vs assumed (3), risky assumptions as blockers (4), decisions in tables with a recommendation (5), in/out lists and dependency-ordered phases (8).
3. **Route content out in one deliberate pass** to the companions in the table above. Evidence and the rule it produced feel like one thought while drafting, so this never happens by itself.
   - Open only the companions the work needs; five near-empty files are clutter of their own.
   - Add the re-review notice beside the links (rule 16).
   - Ask: **would this still be correct if the numbers changed?** Anything that would not is a finding, not spec.
4. **Collect the blockers** in one table: blocker, what it blocks, who decides, what decision is needed (rule 4).
5. **Write the failure modes** (rule 9).
6. **Cut (rule 10), then run `### Review workflow`.** Self-review does not substitute: authors cannot see their own repetition or the assumption they never questioned.

### Review workflow

A spec MUST be reviewed by a fresh agent before it is treated as ready to build from, and **re-reviewed after every material change**.

**1. Dispatch a review agent**

Launch a fresh subagent (`general-purpose`), not a self-review; its value is not having watched the spec being written. Give it:

- the path to this SKILL.md and to the spec,
- context that prevents false findings: what the spec is for, whether it is a draft, and which conventions are deliberate (assumption tags, blocker flags, open-question markers, TODO placeholders),
- a few known-verifiable claims it CAN spot-check (paths, counts, thresholds),
- the report format from `### Reviewing a spec` step 5 and a word budget,
- the current round number (step 5), so a late round prioritises foundational findings over polish,
- the constraints in `## Rules`, and an instruction to be genuinely critical.

**2. Freeze the spec while the review runs**

- The spec MUST NOT be edited between dispatch and report: the reviewer reads a snapshot, and a finding that no longer matches the file cannot be triaged.
- Work found meanwhile MUST be noted and applied after the report. Other files CAN be edited freely.
- If the spec must change first, cancel the review and dispatch a new one against the updated file.

**3. Verify each finding before acting on it**

Review agents are often wrong, and an applied wrong finding is worse than none. Confirm it, then fix it; if it does not hold, say so and move on.

**4. Apply fixes, then check consistency**

Search the spec for facts the change invalidated — stale counts, contradicting thresholds, cross-references to renumbered sections (rule 2). A fixed foundational fact usually breaks downstream sections silently.

**5. Re-review after material changes**

- A change to a fact, threshold, count, scope boundary, phase order, blocker or principle MUST trigger a new review; this list is the **authoritative definition of a material change** (rule 16). Typo and wording fixes SHOULD NOT.
- When a review invalidates a foundational fact, the sections built on it count as unreviewed.
- Each re-review is one round, counted from the first; a review cancelled under step 2 does not count. The driver of the loop MUST track the count — the fresh agent cannot — and pass it in step 1.

**6. Stop the loop** when any of these holds:

- no finding survives verification,
- the surviving findings change nothing on step 5's list, or
- **three rounds have completed** — report the remaining findings unfixed; a spec still carrying foundational findings after three rounds has a problem review cannot solve.

Report the honest verdict, the round count, and which findings were rejected and why.

### Reviewing a spec

Follow this as the dispatched review agent, or when reviewing by hand.

1. **Read the rules, then the spec in full.** Review against the rules, not taste. A review CAN note what the spec gets right, so the author knows what to preserve.
2. **Verify the load-bearing claims** by opening the referenced files; a wrong foundational count, threshold or mapping is the costliest defect and invisible without checking. Watch for counts from too narrow a search and for definitions that fan out at deploy time (`for_each`, `count`, templating) — N definitions rarely means N deployed things.
3. **Work the rules as a checklist**, pass or fail each against its own wording. Rule 2 is the most often broken: search for repeated numbers, names and thresholds instead of reading for it. Measure rules 10 and 17, since a spec drifted into a research report reads as thorough section by section:

   ```
   awk '/^## /{if(n)print c"\t"n; n=$0; c=0; next}{c++}END{print c"\t"n}' spec.md | sort -rn
   wc -l spec.md
   ```

   Report body length against the two-page budget and name any section over 15%. For the largest sections, classify each paragraph as decision, constraint or justification; justification is a rule 17 finding with a named destination. A function body in a fenced block is almost always a rule 17 finding.
4. **Check for edit damage:** a fact restated in a new section while the old copy stays (rule 2), cross-references to renumbered sections, contradicting thresholds, figures updated in one place only.
5. **Report findings ranked by cost** of leaving them unfixed: rule number, exact location, the problem in one sentence, the concrete fix. End with an honest, unsoftened verdict on whether the spec is ready to build from.

## Rules

Constraints on doing the work (what a good spec requires is `## The rules`):

- A spec MUST NOT be reported ready to build while a foundational fact is unverified or a blocker undecided.
- A review agent MUST report only — it MUST NOT edit the spec or this skill.
- Findings MUST NOT be invented to appear thorough; a satisfied rule gets a brief pass.
- A finding MUST NOT be applied before it is verified against the real files.
- Reply in the language the user is writing in.
