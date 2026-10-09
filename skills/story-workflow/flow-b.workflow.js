export const meta = {
  name: 'story-flow-b',
  description: 'Flow B continuation: per subtask, skip-detect → gate only if changed → refresh PR description → prune outdated review-bot comments → report',
  phases: [
    { title: 'Reconcile', detail: 'per subtask: is the diff unchanged since last ready? skip vs gate' },
    { title: 'Frontend snapshots', detail: 'refresh before/after design evidence for changed UI subtasks' },
    { title: 'Gate', detail: 'review only the subtasks whose diff actually changed' },
    { title: 'PR hygiene', detail: 'refresh stale PR description; prune obsolete review-bot comments' },
  ],
}

// args = {
//   specPath,
//   settings: {                 // project settings from its guidelines skill; every key optional
//     baseBranch,               // default 'main'
//     guidelinesSkill,          // project conventions skill every agent loads; default none
//     installCommand,           // default: the repo's documented install command
//     prApi,                    // how to reach PRs, e.g. 'the GitHub CLI (gh)'; default: the host's CLI or API
//     reviewBot,                // { name, author } of the AI review bot; default none (prune stage skipped)
//   },
//   subtasks: [{ id, repo, branch, prId, python, frontend, baselineRef, reviewedCommit, specSection }]
//     reviewedCommit: the commit hash the inventory recorded as last `ready` for this subtask.
// }
const specPath = (args && args.specPath) || null
const subtasks = (args && args.subtasks) || []
const settings = (args && args.settings) || {}
const BASE = settings.baseBranch || 'main'
const GUIDELINES = settings.guidelinesSkill || null
const INSTALL = settings.installCommand || "the repo's documented install command"
const PR_API = settings.prApi || "the PR host's CLI or API"
const REVIEW_BOT = settings.reviewBot || null
const GUIDELINES_LINE = GUIDELINES
  ? `Also load the \`${GUIDELINES}\` skill (project conventions) via the Skill tool and apply it.`
  : ''
if (!subtasks.length) {
  log('No subtasks passed — nothing to do.')
  return { results: [] }
}

const SKILL_HINT = specPath ? `The spec is at ${specPath}.` : ''

// --- Schemas ---------------------------------------------------------------
const SKIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['merged', 'changed', 'reason', 'currentCommit'],
  properties: {
    merged: { type: 'boolean', description: 'true if the PR is already MERGED — then do nothing to this repo' },
    changed: { type: 'boolean', description: 'true if the diff differs from the recorded reviewed commit (ignored if merged)' },
    reason: { type: 'string' },
    currentCommit: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'skill_loaded', 'findings'],
  properties: {
    verdict: { enum: ['ready', 'needs-changes'] },
    skill_loaded: { enum: ['loaded', 'n/a-frontend'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['axis', 'severity', 'location', 'title', 'detail'],
        properties: {
          axis: { enum: ['sound', 'minimal', 'readable', 'skill', 'spec'] },
          severity: { enum: ['blocking', 'should-fix', 'nit'] },
          location: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
  },
}

// PROPOSE-ONLY: editing a PR description is an irreversible external write. The fan-out agent must
// NOT PUT it — it recommends, the orchestrator writes it after review (same rule as review-bot deletions).
const PR_DESC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendation', 'reason'],
  properties: {
    recommendation: { enum: ['update', 'leave-as-is'], description: 'update if the current description is stale/wrong; the ORCHESTRATOR performs the edit, not you' },
    reason: { type: 'string', description: 'what is stale and why, or why it is already accurate + minimal' },
    proposedDescription: { type: 'string', description: 'the full description you recommend setting (only when recommendation=update)' },
  },
}

// NOTE: deletion of PR comments is an irreversible external write. The fan-out agent must NOT delete
// them itself — it PROPOSES, the orchestrator executes after review/confirmation. Schema is
// proposal-only (no delete action inside the agent).
const BOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposedDeletions', 'kept'],
  properties: {
    proposedDeletions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'author', 'why'],
        properties: {
          id: { type: 'string' },
          author: { type: 'string', description: 'comment author display name — must be the review bot, never a human' },
          why: { type: 'string' },
        },
      },
      description: 'obsolete/superseded review-bot comments you RECOMMEND deleting — do NOT delete them yourself',
    },
    kept: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'why'],
        properties: { id: { type: 'string' }, why: { type: 'string' } },
      },
      description: 'comments to leave in place, with the reason',
    },
  },
}

// --- Prompts ---------------------------------------------------------------
const SNAPSHOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['before', 'after', 'missing'],
  properties: {
    before: { type: 'array', items: { type: 'string' } },
    after: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' }, description: 'Missing captures and their reasons' },
  },
}

async function frontendSnapshots(st) {
  if (!st.frontend) return null
  if (!specPath) return { before: [], after: [], missing: ['specPath is required for frontend snapshots.'] }
  return await agent([
    `Capture frontend design snapshots for ${st.id} in ${st.repo} (branch ${st.branch}).`,
    `Read the story-workflow skill's "Frontend design snapshots" section and follow it.`,
    `The spec is ${specPath}; create before/ and after/ beside it. Baseline: ${st.baselineRef || `origin/${BASE}`}.`,
    `Preserve existing before/ images; if missing, use an isolated baseline checkout.`,
    `Run a temporary Playwright harness with relevant mocked states against the real app; refresh`,
    `affected after/ PNGs using matching fixtures, viewport and framing. Inspect the actual images.`,
    `Record capture provenance in the working-state companion and report image paths and missing`,
    `captures with reasons. Remove the temporary harness; do not edit application code, commit or push.`,
  ].join('\n'), { label: `snapshots:${st.id}`, phase: 'Frontend snapshots', schema: SNAPSHOT_SCHEMA })
    || { before: [], after: [], missing: ['Frontend snapshot agent failed.'] }
}

function skipPrompt(st) {
  return [
    `Reconcile subtask ${st.id} in repo ${st.repo} (branch ${st.branch}), PR #${st.prId}.`,
    `STEP 0 — merged check FIRST: fetch PR #${st.prId}'s state via ${PR_API}. If state is`,
    `MERGED, set merged=true and STOP (do not run the diff checks) — a merged PR must never be`,
    `force-pushed, redeployed, or re-gated; further changes need a new branch. Otherwise merged=false.`,
    `The inventory recorded commit ${st.reviewedCommit || '(none)'} as the last that reviewed \`ready\`.`,
    `If not merged, determine whether the reviewable diff has changed since then:`,
    `  1. \`git -C ${st.repo} status --porcelain\` — any output means uncommitted edits (changed=true).`,
    `  2. \`git -C ${st.repo} rev-parse HEAD\` — if it equals ${st.reviewedCommit || '(none)'} and the`,
    `     tree is clean, the diff is unchanged (changed=false).`,
    `  3. If HEAD differs but you suspect only a squash/amend, compare content:`,
    `     \`git -C ${st.repo} diff ${BASE}...HEAD | git hash-object --stdin\`. If it equals the recorded`,
    `     reviewed-diff hash (if the inventory has one), it is functionally unchanged (changed=false).`,
    `Report changed, the currentCommit (HEAD), and a one-line reason. Do NOT edit anything.`,
  ].join('\n')
}

function reviewPrompt(st) {
  const skillLine = st.python
    ? 'This is a Python repo: FIRST invoke the `python-coding` skill via the Skill tool, then judge against it (set skill_loaded="loaded"). Do not review from memory.'
    : 'Non-Python repo: set skill_loaded="n/a-frontend" and match the surrounding code style.'
  const guidelines = GUIDELINES_LINE
  return [
    `You are the review gate for subtask ${st.id} in repo ${st.repo} (branch ${st.branch}). ${SKILL_HINT}`,
    skillLine,
    guidelines,
    `Read this subtask's spec section, then run \`git -C ${st.repo} diff ${BASE}...HEAD\` and review it on`,
    `all five axes (sound, minimal, readable, skill, spec). Soundness first; but ALSO flag dead/`,
    `vestigial code left by a change, oversized docstrings, and needless indirection — clean code that`,
    `is wrong to ship as written still fails. verdict=needs-changes iff any blocking finding.`,
    `----- SPEC -----`,
    st.specSection || '(no spec section provided)',
    `----- END SPEC -----`,
  ].join('\n')
}

function prDescPrompt(st) {
  return [
    `Assess (do NOT edit) the PR description for ${st.repo} PR #${st.prId} (branch ${st.branch}).`,
    `READ-ONLY: FETCH the current description via ${PR_API}.`,
    `You must NOT PUT/PATCH the description — editing a PR is an irreversible external write the`,
    `orchestrator performs after review. Compare the current description to`,
    `\`git -C ${st.repo} diff ${BASE}...HEAD\`.`,
    `RULE (PR descriptions — minimality governs; the project's guidelines skill may tighten it): one line`,
    `summarising the feature; a second line`,
    `ONLY for a genuinely non-obvious decision a reviewer couldn't infer from the diff. No file-by-file`,
    `walkthroughs, no test counts, no lint scores. A fix usually means CORRECTING or DELETING a`,
    `now-wrong line, not adding paragraphs. If the description already matches the diff and is minimal,`,
    `recommend leave-as-is. A stale claim (e.g. describing a guard/behaviour/version the diff changed)`,
    `→ recommend update and provide the full proposedDescription. Report recommendation + reason only;`,
    `perform no write.`,
  ].join('\n')
}

function botPrompt(st) {
  return [
    `Assess outdated ${REVIEW_BOT.name} comments on ${st.repo} PR #${st.prId}. Use ${PR_API} to FETCH`,
    `open (non-deleted) comments. This is READ-ONLY: you must NOT delete, edit, or reply to any comment.`,
    `Deleting a PR comment is an irreversible external write and is the orchestrator's job after review.`,
    `For each comment authored by the bot ("${REVIEW_BOT.author || REVIEW_BOT.name}" — NEVER a human), judge it against the CURRENT`,
    `\`git -C ${st.repo} diff ${BASE}...HEAD\` and put it in proposedDeletions or kept:`,
    `  - Obsolete/superseded (points at a line that no longer exists, flags code already changed, or`,
    `    restates a concern the current commit resolved) → propose deletion.`,
    `  - Cross-repo acceptance-criteria noise this single-repo PR cannot satisfy (the bot can't see other`,
    `    repos), when stale/misleading about this PR's state → propose deletion; keep the single`,
    `    most-recent accurate summary.`,
    `  - Still valid and about THIS repo → keep.`,
    `A human reviewer's comment is ALWAYS kept — never propose deleting one. Report proposedDeletions[]`,
    `(id, author, why) and kept[] (id, why). Do not perform any write.`,
  ].join('\n')
}

// --- Per-subtask pipeline: reconcile → (gate if changed) → PR hygiene -----------------------------
const results = await pipeline(
  subtasks,
  // Stage 1: skip-detect
  async (st) => {
    const skip = await agent(skipPrompt(st), { label: `reconcile:${st.id}`, phase: 'Reconcile', schema: SKIP_SCHEMA })
    return { st, skip: skip || { changed: true, reason: 'reconcile agent failed — gate to be safe', currentCommit: '' } }
  },
  // Stage 2: gate only if changed — and NEVER touch a merged PR
  async (prev) => {
    const { st, skip } = prev
    if (skip.merged) {
      log(`${st.id}: PR #${st.prId} is MERGED — done, not touching it (no gate, no PR hygiene).`)
      return { ...prev, merged: true, review: { verdict: 'merged', skill_loaded: 'n/a', findings: [], skipped: true } }
    }
    if (!skip.changed) {
      log(`${st.id}: diff unchanged (${skip.reason}) — skipping review, carrying prior ready.`)
      return { ...prev, review: { verdict: 'ready', skill_loaded: 'skipped', findings: [], skipped: true } }
    }
    log(`${st.id}: diff changed (${skip.reason}) — gating.`)
    const screenshots = await frontendSnapshots(st)
    const review = await agent(reviewPrompt(st), { label: `gate:${st.id}`, phase: 'Gate', schema: REVIEW_SCHEMA })
    return { ...prev, screenshots, review: review || { verdict: 'needs-changes', skill_loaded: 'n/a-frontend', findings: [], skipped: false } }
  },
  // Stage 3: PR hygiene (description + review-bot prune) — but a merged PR is closed; never write to it
  async (prev) => {
    const { st, merged } = prev
    if (merged) return { ...prev, prDesc: null, bot: null }
    const [prDesc, bot] = await parallel([
      () => agent(prDescPrompt(st), { label: `pr-desc:${st.id}`, phase: 'PR hygiene', schema: PR_DESC_SCHEMA }),
      () => (REVIEW_BOT
        ? agent(botPrompt(st), { label: `bot-prune:${st.id}`, phase: 'PR hygiene', schema: BOT_SCHEMA })
        : null),
    ])
    return { ...prev, prDesc, bot }
  },
)

// --- Synthesis --------------------------------------------------------------
const out = results.filter(Boolean).map((r) => ({
  subtask: r.st.id,
  repo: r.st.repo,
  prId: r.st.prId,
  merged: !!r.merged,
  reviewSkipped: !!(r.review && r.review.skipped),
  verdict: r.review ? r.review.verdict : 'unknown',
  findings: r.review ? r.review.findings : [],
  screenshots: r.screenshots || null,
  prDescription: r.prDesc || { recommendation: 'leave-as-is', reason: 'agent failed or repo merged' },
  botComments: r.bot || { proposedDeletions: [], kept: [] },
}))

const gated = out.filter((o) => !o.reviewSkipped && !o.merged).length
const skipped = out.filter((o) => o.reviewSkipped && !o.merged).length
const merged = out.filter((o) => o.merged).length
// Both PR-description edits and review-bot deletions are irreversible external writes — fan-out agents only
// PROPOSE them; the orchestrator (caller) performs the writes after reviewing, user in the loop.
const proposedDescriptionEdits = out
  .filter((o) => o.prDescription && o.prDescription.recommendation === 'update')
  .map((o) => ({ repo: o.repo, prId: o.prId, reason: o.prDescription.reason, proposedDescription: o.prDescription.proposedDescription }))
const proposedDeletions = out.flatMap((o) =>
  (o.botComments.proposedDeletions || []).map((d) => ({ subtask: o.subtask, repo: o.repo, prId: o.prId, ...d })))
log(`Flow B done: ${merged} merged (untouched), ${skipped} skipped, ${gated} gated; `
  + `${proposedDescriptionEdits.length} PR-description edit(s) and ${proposedDeletions.length} review-bot deletion(s) `
  + `PROPOSED (not applied — orchestrator to confirm).`)

return {
  results: out,
  proposedDescriptionEdits,
  proposedDeletions,
  summary: { merged, skipped, gated, proposedDescriptionEdits: proposedDescriptionEdits.length, proposedForDeletion: proposedDeletions.length },
}
