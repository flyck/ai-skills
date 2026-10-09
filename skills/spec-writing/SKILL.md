---
name: spec-writing
description: Write or review a technical spec so it is clear, structured, concise, and non-repetitive. Use when drafting a spec or design document, when reviewing someone else's spec, or when deciding whether a spec is complete enough to build from. Applies the spec rules and their review checklist.
---

Write specs that let someone build the right thing without asking questions, and let a reviewer find the flaw before it costs a sprint. Everything else is decoration.

A spec fails in two directions. Too thin, and the reader fills the gaps with guesses. Too padded, and the reader skims and misses the one paragraph that mattered. Both failures look like a finished document, which is why they survive until implementation.

## Steps

Pick the workflow that matches the task; they are not sequential.

- **Authoring a spec** → `### Writing a spec`
- **A spec changed and needs re-review** → `### Review workflow`
- **Acting as the reviewer** → `### Reviewing a spec`

The rules below apply to all three, and are the single authority for what a good spec requires.

## The rules

Keywords follow RFC 2119: **MUST** is a hard requirement — violating it makes the spec defective. **SHOULD** is a strong default — depart from it only with a stated reason. **CAN** is permission, not obligation.

**1. Lead with the decision, not the discovery; `spec.md` is the entry point**

The spec MUST open with what the thing is and what it does. Research, alternatives, and reasoning MUST come after, and SHOULD appear only where they change a choice. The reader MUST NOT have to reconstruct the conclusion from the journey.

Because the spec opens with the decision, it **is** the front door. A `README.md`, `index.md`, `overview.md` or `summary.md` alongside it MUST NOT be written:

- Every such file restates the spec's opening and lists the companions — content that already has exactly one home each, in the spec's first section and its companion-links section. That makes it a third copy of two facts, and the copy nobody updates (rule 2).
- It adds a hop for every reader: open the README, learn nothing new, open the spec.
- "Read in this order" is not information a reader needs. The spec is first because it is the spec; the companions are reached from it when a question arises.

Point people at `spec.md`. If the set needs orientation the spec's first section does not give, that section is wrong — fix it there rather than wrapping it. Directory-level conventions someone else owns (a repo's top-level `README.md`, a docs-site index) are not this: link the spec from them, do not restate it.

**2. State one fact once**

Every fact MUST have exactly one home. A fact that appears twice MUST be replaced by a cross-reference (`§3.1`) to its single source. If a threshold, name, or constraint appears twice, one copy is already stale — repetition is the most common way specs become wrong.

**3. Separate verified from assumed**

Every load-bearing claim MUST be marked as verified or assumed. Verified claims MUST cite a source: file path and line, command output, or ticket, and SHOULD prefer a re-runnable command over a bare number, since counts drift and commands stay true. An unmarked assumption presented as fact is the most expensive defect a spec can carry.

**4. Make blockers impossible to miss**

Every blocker MUST be flagged inline and collected in one list. That list MUST name what each blocker blocks and what decision resolves it, and SHOULD separate blockers needing a human decision from mechanical ones. A blocker discovered in week two that was knowable in week zero is a spec failure, not a project failure.

**5. Put decisions in tables, not prose**

Options, thresholds, comparisons, and mappings SHOULD be tables — a reader scans a table and reads a paragraph. Whenever options are presented, the spec MUST recommend one and say why; the reasoning against the losers belongs in `alternatives.md` (rule 14), not here. A spec that lists three choices without a recommendation has moved the work, not done it.

**6. Prefer structure over transitions**

Sections SHOULD be independently readable via headings, tables, and lists. Connective prose ("As we saw above…", "It is worth noting that…") SHOULD be cut. A sentence that only bridges two ideas SHOULD be deleted.

**7. Be concrete and falsifiable**

Every requirement MUST be verifiable: someone can point at the result and say whether it holds. Requirements SHOULD be written as numbers, names, and paths — `p99 < 200ms`, `threshold >= 1`, `terraform/cloudwatch.alerts.tf` — because that form makes the check obvious. Requirements MUST NOT rest on unquantified adjectives like "fast", "robust", or "handles errors gracefully"; those are unbuildable.

**8. Bound the scope explicitly; the reasoning goes in `out-of-scope.md`**

The spec MUST state what is out of scope as clearly as what is in — uncontested scope is imagined scope. Phased work MUST be ordered by dependency, and SHOULD name which phases are unblocked today.

Naming a boundary is cheap; justifying it is not. An exclusion that arrives with a sentence or two of reasoning — why it was tempting, what it would cost, which review it needs — is padding for every reader who already accepts the boundary, which is nearly all of them. So the spec MUST carry the *list* and MUST NOT carry the argument:

- In the spec, each exclusion is **one line**: the thing, and at most a short clause naming the reason. A bare list of five or six lines is the target.
- Anything longer MUST move to a sibling `out-of-scope.md`, which the spec links to once. One entry per exclusion: what it is, why it is out, what it would take to bring it in, and whether anything in scope depends on it staying out.
- An exclusion whose *reason* is load-bearing for the design stays in the spec at full weight — if the reader must understand why X is excluded to build Y correctly, that is not scope, it is a constraint (rule 7).
- An exclusion that is really a deferral MUST say what it is blocked on and link to the blocker (rule 4); "follow-up story" alone is not a boundary.

The test is whether a reader who disagrees with the boundary needs the argument to *build*. If they only need it to *challenge*, it belongs in `out-of-scope.md` — the same logic as rule 14, and for the same reason: the spec is read every time someone builds, the justification only when someone objects.

**9. Write the failure modes down**

Failure modes MUST be named with their cost and mitigation. The spec SHOULD include the failure mode where its own approach produces a confident wrong answer. A spec describing only the happy path has deferred the hard thinking to whoever implements it — usually under time pressure.

**10. Cut everything that survives no reader, and keep the spec short enough to be read in one sitting**

Content no reader would act on MUST be cut. Restated background, defensive hedging, and ceremony SHOULD be treated as the usual offenders. A shorter spec is read; a long one is skimmed and misunderstood. Length is a cost, not evidence of rigour.

Because "short" is unfalsifiable, hold the spec to a budget and treat a breach as a routing failure, not a licence to write more:

- The spec body SHOULD fit **two pages — about 150 lines**, excluding companions. Past that, a reader skims.
- No single section SHOULD exceed **15% of the body**. A section approaching a third of the spec is the clearest possible signal that justification (rule 17) or findings (rule 13) have collected there.
- When the budget is breached, the fix is to **route content out**, never to compress the instruction. Cutting a constraint to save lines trades a readable spec for a wrong build.

Check this before handing off. It is measurable in one command, and it catches the failure the other rules cannot see: a spec where every individual paragraph is defensible and the whole is unreadable.

**11. Do not spend a heading on a single point**

A heading whose body is one sentence or one item SHOULD be a bullet in its parent section instead. Headings promise a section worth navigating to; spending one on a single point inflates the table of contents and makes the document look longer than the thinking behind it. Merge sibling one-liners into a single list, and keep the heading only when a reader would plausibly jump straight to it.

**12. Turn runs of short paragraphs into a list**

A section that is three or more consecutive paragraphs of one or two sentences SHOULD be a bullet list. Those paragraphs are almost always parallel items — each a separate point — and prose formatting hides that structure behind whitespace, so the reader has to infer the pattern the author already knew. As a list they become scannable, countable, and obviously complete or incomplete. Keep prose when the paragraphs genuinely build on one another: an argument where each step depends on the one before is not a list.

**13. Specific findings live in `research.md`; the spec stays general**

A spec MUST describe a **process**, not an inventory. Concrete findings — counts, resource names, line numbers, environment details, worked examples — MUST move to a sibling `research.md` that the spec links to once.

The distinction is what survives contact with time. A spec that hardcodes "there are 18 alarms" is wrong the week someone adds one, and its reader cannot tell whether the process is broken or just the number. A spec that says "derive the alarm set at runtime" stays correct, and the observed 18 becomes evidence for *why* deriving matters.

Being general is not being vague: the process MUST still work for the specific situation that prompted it. Every trap found in the research SHOULD appear in the spec as a general rule — "directory names are unreliable, match on the remote URL" — with the instance that revealed it left in `research.md`.

`research.md` SHOULD record each observation and what it **may imply**, and MUST NOT restate the decision the spec took. Findings and decisions age at different rates: an observation stays true as an observation even when the decision built on it is reversed, and a research file that argues for a decision cannot be re-read honestly when that decision is being reconsidered.

**14. Rejected options live in `alternatives.md`, not the spec**

Approaches considered and decided against MUST be moved to a sibling `alternatives.md`, and the spec MUST link to it once. **The spec is the spec: what is being built, and why it holds together.** It is not a record of everything that was thought about.

Rejected options are not worthless — they are the answer to "why not X?", and without them that question gets re-litigated every few months. But they are needed only when the decision is *challenged*, which is rare, while the spec is read every time someone builds from it. Keeping them inline taxes every reader to serve the occasional one.

- The spec MUST state the decision and a one-line reason. That is enough to act on.
- The spec MUST NOT carry paragraphs explaining what was not done, why an approach was tempting, or what the author briefly worried about. That is padding a builder must read past (rule 10).
- `alternatives.md` SHOULD hold one entry per rejected option: what it was, why it lost, and what would have to change for it to win — that last part is what makes an entry worth keeping.
- Options still genuinely open are **not** alternatives; they are decisions (rule 5) or blockers (rule 4), and they stay in the spec.

**15. Working state lives in `process.md`, and MUST be kept current**

Work that spans repositories, branches, or environments MUST track its state in a sibling `process.md` that the spec links to once. One row per unit of work, with at minimum: repository, branch, PR, last commit checked, build status, deploy status, and any caveat.

This is the one companion file that is **mutable by design**. The spec is stable, `research.md` is a dated snapshot, `alternatives.md` is an archive — `process.md` is the live picture, and a stale row is worse than an absent one because it is trusted.

- It MUST be updated after every push, pipeline run, deploy, merge, or scope change — as part of that action, not as a later tidy-up.
- Each row SHOULD carry the timestamp or commit it was last verified against, so a reader can tell current state from remembered state.
- It MUST NOT hold decisions, findings, or reasoning; those belong in the spec, `research.md`, or `alternatives.md`. If a row needs a paragraph of explanation, the explanation belongs elsewhere and the row should link to it.
- It SHOULD be deleted or archived when the work completes. A tracking file outliving its work is a trap for the next reader.

Without this, every agent or person picking the work up re-derives the same PR set from the forge, and two of them will reach different answers about what is deployed.

**16. Every spec MUST carry its own re-review rule**

The spec MUST state, in its own text, that `spec-writing`'s `### Review workflow` is to be run after every material change to it — the trigger list in that workflow's step 5 is the authoritative definition. The notice SHOULD sit next to the companion-file links (rules 13–15), where the reader lands:

> **Any material change to this spec requires a fresh `spec-writing` review before the spec is treated as current** — a change to a fact, threshold, count, scope boundary, phase order, blocker, or principle. Wording and typo fixes do not.

The obligation in `### Review workflow` only reaches someone who has already loaded this skill, and the next person to edit the spec — months later, mid-incident, or an agent handed only a file path — will not have. Carrying the notice in the artifact is the only place it can be enforced.

**17. A decision's justification lives in `rationale.md`; the spec states the decision and its constraints**

Rules 13, 14 and 8 route out findings, rejected options and exclusions. They leave the largest source of bulk untouched: the **derivation of a decision the spec kept**. That is the material that turns a plan into a research report — the experiment that proved the approach, the code sketch showing how it works, the paragraph explaining why the obvious alternative fails. Each addition feels justified, because each one *is* true and *was* hard-won. Together they bury the instruction.

Split every decision into three parts and route each one:

| Part | Example | Where |
|---|---|---|
| The decision | "guard the join structurally, not by marker column" | the spec, one line |
| Its constraints — what an implementer must obey to get it right | "must treat subqueries as opaque; must be an outer join" | the spec, as requirements (rule 7) |
| Its justification — why it is correct, and the proof | the compiled-SQL experiment showing the false positive | `rationale.md` |

- The spec MUST state the decision and the constraints it imposes. A constraint the implementer must respect is **not** justification, even when it needs a sentence of explanation — a reader who violates it writes a bug, so it stays.
- The spec MUST NOT carry the derivation: the experiment that proved it, the failure it avoids, the mechanism by which it works. That belongs in `rationale.md`, keyed to the decision, and linked once.
- The spec SHOULD NOT carry implementation code. A signature or a data shape earns its place when it *is* the interface being specified; a function body is the implementer's job, and pinning it in the spec both bloats the document and pre-empts a better implementation. Move the sketch to `rationale.md` if it is evidence, or delete it.
- A decision whose reasoning cannot be compressed to a line is usually **two** decisions. Split it before moving anything.

The reader who wants to challenge a decision follows one link. The reader who wants to build never opens it. That is the whole point: a spec is an instruction, and an instruction carrying its own proof is a paper, not a plan.

**18. Say it once, in the shortest form that carries the instruction**

Routing content out (rules 8, 13, 14, 17) fixes *what* the spec contains. It does nothing about *how* each surviving fact is written, and that is where a routed spec still comes out twice the length it needs. The failure is not a padded section — it is one or two explanatory sentences wrapped around every fact, spread evenly, so no section looks bloated and the total is double.

Measure it: prose lines as a share of the body. A spec whose prose exceeds **roughly a third** of its lines is being narrated rather than specified, and the fix is form, not deletion:

- A constraint SHOULD be one line in a list, not a paragraph. If it needs a "because", the because is justification (rule 17).
- A decision SHOULD be one sentence. The alternative it beat is `alternatives.md`; the proof it works is `rationale.md`.
- Do not introduce a table, list, or section before it starts — a sentence whose only job is to announce the next block SHOULD be cut (rule 6).
- Do not restate a heading in its first sentence, and do not close a section by summarising it.
- Where a fact and its citation both belong, write `fact (path:line)` rather than a sentence about where the fact was found.

The instruction survives; the narration around it does not. Applied honestly this is the difference between a spec someone reads in one sitting and one they skim — and unlike routing, it costs no companion file.

**19. Every section is a bulleted list; every bullet is one or two sentences**

Rules 12 and 18 push toward lists and against narration. This one makes it the default form rather than a remedy: a spec is a set of statements a builder checks off, and prose hides that structure behind whitespace.

- Every section MUST be a bulleted or numbered list. Tables count as lists.
- Every bullet MUST be **at most two sentences**. A bullet needing three is two bullets, or one bullet plus an entry in `rationale.md`.
- A section MAY open with **one** framing sentence before its list, and MUST NOT close with a summarising one.
- Prose paragraphs are permitted only where each sentence depends on the one before it — a genuine argument, not a set of parallel points. That is rare in a spec; treat it as the exception you must justify, not the fallback.
- Headings, the requirement list and the blocker table already satisfy this. The sections that break it are the ones written as explanation: summary, rollout, verification.

The check is mechanical: any paragraph of three or more sentences, and any bullet of three or more, is a finding. Fix it by splitting or by moving the surplus to a companion — never by deleting a constraint (rule 10).

### Writing a spec

**1. Establish the facts before drafting**

Read the actual code, config, and infrastructure the spec depends on. Cite sources as findings are confirmed (rule 3). Facts gathered after the structure is set tend to get bent to fit it.

**2. Lead with the conclusion**

Open with what is being built and what it does, in a few sentences (rule 1). Findings, alternatives, and rationale come after.

**3. Separate what was verified from what was assumed**

Every load-bearing claim is either cited or marked as an assumption (rule 3). Assumptions carrying real risk get flagged as blockers (rule 4).

**4. Put the decisions in tables**

Options, thresholds, mappings, and comparisons go in tables with a recommendation (rule 5). Scope goes in explicit in/out lists (rule 8). Phases are ordered by dependency, naming which are unblocked.

**5. Split the specifics out from the process**

Move concrete findings to `research.md`, rejected options to `alternatives.md`, justified exclusions to `out-of-scope.md`, and the derivation of kept decisions to `rationale.md` (rules 13, 14, 8, 17); the spec keeps the process, each decision with a one-line reason, and one link to each file. Where the work spans repositories or environments, open `process.md` for its live state (rule 15). Do this as a deliberate pass — every kind of content accumulates silently during drafting, because while writing, the evidence and the rule it produced feel like the same thought.

The files differ by how they age: the spec is stable, `research.md` is a dated snapshot, `alternatives.md`, `out-of-scope.md` and `rationale.md` are archives, `process.md` is live and must be current.

Only open a companion the work actually needs. A single-repo change needs no `process.md`; a spec with two obvious exclusions needs no `out-of-scope.md`. Five near-empty files are their own kind of clutter — the split earns its keep only when it removes weight from the spec.

Add the re-review notice beside those links while you are there (rule 16) — it belongs with them, and it is the one instruction that has to survive being read by someone who never loaded this skill.

Then re-read the spec asking: **would this still be correct if the numbers changed?** Anything that would not is a finding, not a spec.

**6. Collect the blockers in one place**

One table: blocker, what it blocks, who decides, what decision is needed (rule 4). Keep inline flags, but make the collected list the authority so nothing hides in prose.

**7. Write the failure modes**

Name what breaks, the cost, and the mitigation (rule 9).

**8. Cut, then hand off for review**

Remove anything no reader would act on (rule 10). Then run `### Review workflow` — a self-review does not substitute for it. Authors cannot reliably see their own repetition or the assumption they never questioned, because both look correct from inside the draft.

### Review workflow

A spec MUST be reviewed by a fresh agent before it is treated as ready to build from, and **re-reviewed after every material change**. This is a loop, not a gate passed once.

**1. Dispatch a review agent**

Launch a subagent (`general-purpose`) to review the spec against this skill. The agent MUST be given:

- the path to this SKILL.md and the path to the spec,
- enough context to avoid false findings: what the spec is for, whether it is a draft, and which conventions in it are deliberate — assumption tags, blocker flags, open-question markers, and TODO placeholders,
- a few known-verifiable claims it CAN spot-check (file paths, counts, thresholds),
- the reporting format from `### Reviewing a spec` step 5, and a word budget,
- the current round number (step 5), so a late round can be told to prioritise foundational findings over polish,
- the constraints in `## Rules`, and an instruction to be genuinely critical.

Use a fresh agent rather than self-review. Its value is not having watched the spec get written, so it has no reason to believe any claim it has not checked.

**2. Freeze the spec while the review runs**

The spec MUST NOT be edited between dispatching a review and receiving its report — no fixes, no polish, no "I already spotted that one". The reviewer is reading a snapshot; every edit made in the meantime invalidates part of its report and makes findings impossible to triage, because a finding that no longer matches the file cannot be told apart from a finding that was always wrong.

Work found during the wait MUST be written down and applied after the report arrives, not applied immediately. Other files CAN be edited freely — the freeze covers only the spec under review.

If the spec must change before the report lands, cancel the review and dispatch a new one against the updated file. A review of a file that no longer exists is not evidence about the file that does.

**3. Verify each finding before acting on it**

Review agents are often wrong, and a confidently wrong finding that gets applied is worse than no review. Confirm it, then fix it; if it does not hold, say so and move on.

**4. Apply fixes, then check consistency**

After editing, search the spec for facts the change invalidated — stale counts, contradicting thresholds, cross-references to renumbered sections (rule 2). Fixing a foundational fact usually breaks several downstream sections, and those breaks are silent.

**5. Re-review after material changes**

Any change to a fact, threshold, count, scope boundary, phase order, blocker, or principle MUST trigger a new review — this list is the **authoritative definition of a material change**, referenced by rule 16. Typo and wording fixes SHOULD NOT. When a review invalidates a foundational fact, the sections built on it are unreviewed regardless of what the earlier review said about them.

Each re-review is **one round**, counted from the first; a review cancelled under step 2 does not count. The count MUST be tracked by whoever drives the loop — not by the review agent, which is fresh each time and cannot know it — and passed to the agent in step 1.

**6. Stop the loop**

The loop ends when any of these holds:

- a review returns no findings that survive verification,
- the surviving findings change nothing on step 5's material-change list — cosmetic findings do not earn another round, or
- **three rounds have completed** — report the remaining findings unfixed rather than looping. A spec still carrying foundational findings after three rounds has a problem review cannot solve.

Report the honest verdict, including the round count and which findings were rejected and why.

### Reviewing a spec

Follow this when acting as the review agent dispatched above, or when reviewing a spec by hand.

**1. Read the rules, then the spec in full**

Review against the rules, not against taste. A review CAN note where the spec is right as well as wrong — one that only lists problems gives no signal about what to preserve.

**2. Verify the load-bearing claims**

Do not take cited facts on trust. Spot-check the ones the design rests on by opening the referenced files. A spec's foundational count, threshold, or mapping being wrong is the highest-cost defect, and it is invisible without checking.

Watch specifically for a count derived from too narrow a search, and for definitions that fan out at deploy time (`for_each`, `count`, templating) — N definitions rarely means N deployed things.

**3. Work the rules as a checklist**

Take the rules above in order and record pass or fail for each, judging against the rule's own wording rather than a paraphrase. Rule 2 is the hardest to see and the most often broken — search for repeated numbers, names, and thresholds instead of reading for it.

Measure rules 10 and 17 rather than reading for them; a spec that has drifted into a research report reads as thorough section by section, so only the numbers expose it:

```
awk '/^## /{if(n)print c"\t"n; n=$0; c=0; next}{c++}END{print c"\t"n}' spec.md | sort -rn
wc -l spec.md
```

Report the body length against the two-page budget and name any section over 15%. For the largest sections, ask of each paragraph: is this the decision, a constraint an implementer must obey, or the justification? Justification is a rule 17 finding with a concrete destination — say which companion it belongs in. Count fenced code blocks too: a function body in a spec is almost always a rule 17 finding.

**4. Check for edit damage**

Specs are revised repeatedly, and revision breaks them in predictable ways: a fact restated in a new section while the old copy stays (rule 2), cross-references pointing at renumbered sections, thresholds contradicting each other, and figures updated in one place but not others. Search for repeated numbers and names to catch drift.

**5. Report findings ranked by cost**

For each finding: the rule number, the exact location, the problem in one sentence, and the concrete fix. Rank by the cost of leaving it unfixed, not by reading order.

End with an honest verdict on whether the spec is ready to build from. Do not soften it — an unclear verdict is the one part of a review nobody can act on.

## Rules

What a good spec requires lives in `## The rules` and is not repeated here. These are the constraints on doing the work:

- A spec MUST NOT be reported as ready to build while a foundational fact is unverified or a blocker is undecided.
- A review agent MUST report only — it MUST NOT edit the spec or this skill.
- Findings MUST NOT be invented to appear thorough. When a rule is satisfied, say so briefly and move on.
- A finding MUST NOT be applied before it is verified against the real files.
- Reply in the language the user is writing in.
