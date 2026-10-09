export const meta = {
  name: 'story-review-gate',
  description: 'Multi-repo story review gate: 2 local reviews/subtask + big-picture (first pass) or 1 local (update), all schema-forced to the review.md rubric',
  phases: [
    { title: 'Frontend snapshots', detail: 'capture matching before/after PNGs beside the spec for UI subtasks' },
    { title: 'Local review', detail: 'correctness reviewer(s) + a dedicated code-quality reviewer per subtask, scoped to each repo diff' },
    { title: 'Verify', detail: 'adversarially re-check each blocking finding' },
    { title: 'Fix', detail: 'bounded fix loop per subtask in an isolated worktree, then re-review' },
    { title: 'Big picture', detail: 'one reviewer across all subtask diffs (first-pass only)' },
  ],
}

// args = {
//   depth: 'first-pass' | 'update',        // first-pass = 2 local reviews + big-picture; update = 1 local
//   specPath: '/abs/path/specs.md',        // reviewers may read neighbouring sections from here
//   settings: {                 // project settings from its guidelines skill; every key optional
//     baseBranch,               // default 'main'
//     guidelinesSkill,          // project conventions skill every agent loads; default none
//     installCommand,           // default: the repo's documented install command
//     prApi,                    // how to reach PRs, e.g. 'the GitHub CLI (gh)'; default: the host's CLI or API
//     reviewBot,                // { name, author } of the AI review bot; default none (prune stage skipped)
//   },
//   subtasks: [
//     { id, repo, branch, python: bool, frontend: bool, baselineRef, specSection }, ...
//   ],
// }
const depth = (args && args.depth) || 'first-pass'
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
const LOCAL_REVIEWERS = depth === 'update' ? 1 : 2

if (!subtasks.length) {
  log('No subtasks passed in args.subtasks — nothing to review.')
  return { gate: 'ready', verdictTable: [], findings: [], bigPicture: null, notesToUser: [] }
}

// --- Schemas ---------------------------------------------------------------
// axes_checked forces the reviewer to account for EVERY axis — it can't silently skip spec or skill
// compliance and still return valid output. skill_loaded / spec_read make "did you actually consult
// them" a required, inspectable field rather than a hope.
const FINDING_ITEMS = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'axis', 'severity', 'location', 'title', 'detail'],
    properties: {
      id: { type: 'string' },
      axis: { enum: ['sound', 'minimal', 'readable', 'skill', 'spec'] },
      severity: { enum: ['blocking', 'should-fix', 'nit'] },
      location: { type: 'string', description: 'path/to/file.py:42-58' },
      title: { type: 'string' },
      detail: { type: 'string' },
      suggested_fix: { type: 'string' },
    },
  },
}

const LOCAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subtask', 'repo', 'verdict', 'spec_read', 'skill_loaded', 'axes_checked', 'findings'],
  properties: {
    subtask: { type: 'string' },
    repo: { type: 'string' },
    verdict: { enum: ['ready', 'needs-changes'] },
    // Enforcement fields — the review is incomplete unless these are truthfully populated.
    spec_read: { type: 'boolean', description: 'true only if you read the subtask spec section before the diff' },
    skill_loaded: {
      type: 'string',
      enum: ['loaded', 'n/a-frontend'],
      description: "'loaded' if you invoked the python-coding skill; 'n/a-frontend' only for non-Python repos",
    },
    axes_checked: {
      type: 'object',
      additionalProperties: false,
      required: ['sound', 'minimal', 'readable', 'skill', 'spec'],
      description: 'One line per axis stating the basis on which you checked it. All five are mandatory.',
      properties: {
        sound: { type: 'string', description: 'the concrete behaviour/inputs you traced to confirm correctness' },
        minimal: { type: 'string' },
        readable: { type: 'string' },
        skill: { type: 'string' },
        spec: { type: 'string' },
      },
    },
    findings: FINDING_ITEMS,
    notes_to_user: { type: 'array', items: { type: 'string' } },
  },
}

const BIG_PICTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'checks', 'findings'],
  properties: {
    verdict: { enum: ['ready', 'needs-changes'] },
    checks: {
      type: 'object',
      additionalProperties: false,
      required: ['cross_repo_contracts', 'access_boundaries', 'story_completeness', 'shared_logic_drift'],
      description: 'One line per big-picture check stating what you verified across the repos.',
      properties: {
        cross_repo_contracts: { type: 'string' },
        access_boundaries: { type: 'string' },
        story_completeness: { type: 'string' },
        shared_logic_drift: { type: 'string' },
      },
    },
    findings: FINDING_ITEMS,
    notes_to_user: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean', description: 'true if the finding is wrong or not actually a problem' },
    reason: { type: 'string' },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['applied', 'summary'],
  properties: {
    applied: { type: 'boolean', description: 'true if you edited files to address the blocking findings' },
    summary: { type: 'string', description: 'what you changed, per finding, or why a finding was left unfixed' },
    unfixed: { type: 'array', items: { type: 'string' }, description: 'finding ids you could not safely fix' },
  },
}

// Max fix→re-review rounds per subtask before giving up and returning needs-changes to the human.
const MAX_FIX_ROUNDS = (args && args.maxFixRounds) || 2

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

// --- Prompts ---------------------------------------------------------------
function localPrompt(st, reviewerN) {
  const specNote = specPath ? `The full spec is at ${specPath} if you need neighbouring sections.` : ''
  const skillLine = st.python
    ? 'This is a Python repo: your FIRST action MUST be to invoke the `python-coding` skill via the Skill tool — before reading the spec or the diff. Do not review from memory of its conventions; load it. Then apply axis 4 (skill) against it and set skill_loaded="loaded" only after you actually loaded it this session.'
    : 'This is a non-Python repo: set skill_loaded="n/a-frontend" and for axis 3 match the surrounding code instead.'
  return [
    `You are local reviewer #${reviewerN} for subtask ${st.id} in repo ${st.repo} (branch ${st.branch}).`,
    `Apply the rubric in the skill's review.md exactly. Axes, in priority order:`,
    `  1. sound — does it actually work? Trace real behaviour; logic errors, edge cases, null/error paths.`,
    `  2. minimal — nothing the spec doesn't need.`,
    `  3. readable / code quality — clear naming, top-down flow, no needless duplication.`,
    `  4. skill — the language skill's conventions${GUIDELINES ? ` and ${GUIDELINES}'s` : ''}.`,
    `  5. spec — matches the spec section below, nothing extra.`,
    `Soundness is the most important axis: clean, minimal, spec-matching code that is WRONG is the worst outcome.`,
    skillLine,
    GUIDELINES_LINE,
    ``,
    `Read this subtask's spec section BEFORE the diff, then set spec_read=true. ${specNote}`,
    `----- SPEC -----`,
    st.specSection || '(no spec section provided)',
    `----- END SPEC -----`,
    ``,
    `Then run \`git diff ${BASE}...HEAD\` in ${st.repo} and review only files it touches.`,
    `You MUST fill axes_checked with one line per axis — for 'sound', name the concrete input/behaviour you`,
    `traced; for 'spec', state whether everything required is present and nothing extra; for 'skill', the`,
    `conventions you checked. A review that leaves any axis unaccounted for is invalid. Empty findings is`,
    `valid; do not manufacture findings. verdict is needs-changes iff at least one blocking finding exists.`,
    `Cap nits at three.`,
  ].join('\n')
}

// Dedicated code-quality reviewer. Runs in EVERY round (incl. depth=update) alongside the
// correctness reviewer(s). Its ONLY job is minimal/readable/skill — it does NOT judge soundness or
// spec-completeness, so quality never competes with correctness inside one head. This exists because
// the correctness-first reviewer repeatedly passed clean-but-poor code (a dead one-line helper with a
// six-line docstring survived two `ready` gates): correct code that shouldn't exist as written.
function qualityPrompt(st) {
  // The quality CHECKLIST is the python-coding skill — do NOT restate its rules here (they drift).
  // This prompt only names the FAILURE MODE the correctness reviewer keeps missing, and forces the
  // reviewer to load the skill and check the diff against it item by item.
  const skillLine = st.python
    ? [
        `MANDATORY FIRST ACTION: invoke the \`python-coding\` skill via the Skill tool, before you open`,
        `the diff. That skill IS your checklist — its style, docstring, function-ordering, duplication,`,
        `naming and comment rules are the standard you enforce. Set skill_loaded="loaded" only after you`,
        `actually loaded it this session. Do NOT review from memory of its conventions.`,
      ].join('\n')
    : `This is a non-Python repo: set skill_loaded="n/a-frontend" and enforce the surrounding code's own conventions.`
  return [
    `You are the CODE-QUALITY reviewer for subtask ${st.id} in repo ${st.repo} (branch ${st.branch}).`,
    `You do NOT judge correctness or spec-completeness — other reviewers own those. Assume the code`,
    `works and matches the spec. Your target is code that is clean, working, spec-matching AND STILL`,
    `WRONG TO SHIP AS WRITTEN. Only ever raise findings on axes 'minimal', 'readable', 'skill'; on the`,
    `'sound'/'spec' axes_checked lines write "not my remit".`,
    ``,
    skillLine,
    GUIDELINES_LINE,
    ``,
    `Then run \`git diff ${BASE}...HEAD\` in ${st.repo} and judge EVERY changed hunk against the skill's`,
    `rules — go through them, don't summarise. A bare "looks fine" is an invalid review. The failure`,
    `mode you exist to catch (the correctness reviewer keeps passing it): a change that GUTS a function`,
    `leaves vestigial code the skill forbids — a helper now reduced to wrapping one expression that the`,
    `skill would have inlined, a param/import/constant that no longer does anything, or a docstring`,
    `oversized for what the function now is. A sibling field handling the same thing inline is the tell.`,
    `For each such rule in the skill, state in axes_checked the concrete hunk you checked it against.`,
    `Empty findings is valid ONLY if you can name why each applicable skill rule is genuinely satisfied.`,
    `Cap nits at three; dead/vestigial code and skill-violating docstrings are should-fix, not nits.`,
  ].join('\n')
}

function bigPicturePrompt() {
  const lines = subtasks.map((st) => `- ${st.id}: repo ${st.repo}, branch ${st.branch}`)
  const specNote = specPath ? `Full spec: ${specPath}.` : ''
  return [
    `You are the BIG-PICTURE reviewer across all subtasks of this story. Apply the "Big-picture review"`,
    `section of the skill's review.md. ${specNote}`,
    `Subtasks (run \`git diff ${BASE}...HEAD\` in each repo and read them TOGETHER):`,
    ...lines,
    ``,
    `Check the seams no single-repo reviewer can see, and record each in the required 'checks' object:`,
    `cross-repo contracts (producer/consumer agree on fields, types, endpoints, events),`,
    `access/permission boundaries enforced end-to-end, story completeness (nothing fell between subtasks),`,
    `and accidental shared-logic drift. Do NOT re-flag single-repo style — that's the local reviewers' job.`,
    `Empty findings is a good result. Output subtask="big-picture", repo="<multiple>".`,
  ].join('\n')
}

function fixPrompt(st, blocking) {
  const list = blocking.map((f) => `- [${f.id}] ${f.location}: ${f.title} — ${f.detail}`
    + (f.suggested_fix ? ` (suggested: ${f.suggested_fix})` : '')).join('\n')
  const skillLine = st.python
    ? `Your FIRST action MUST be to load the \`python-coding\` skill via the Skill tool, then follow it (install with ${INSTALL}, no ad-hoc \`pip install\`) and keep the linter at the score it requires.`
    : 'Match the surrounding code conventions.'
  return [
    `You are fixing subtask ${st.id} in repo ${st.repo} (branch ${st.branch}). Address ONLY these`,
    `blocking review findings — do not refactor beyond them, do not add anything the spec doesn't need:`,
    list,
    ``,
    `${skillLine} ${GUIDELINES_LINE} Run the repo's tests after editing; a fix that breaks tests is not applied.`,
    `Edit the files in place. Report which findings you fixed and any you could not safely fix (leave those`,
    `for the human). Do NOT commit or push — the orchestrator handles history.`,
  ].join('\n')
}

function verifyPrompt(label, f) {
  return [
    `Adversarially verify this review finding (${label}). Try to REFUTE it.`,
    `If the finding concerns a Python repo, load the \`python-coding\` skill${GUIDELINES ? ` (and \`${GUIDELINES}\` for project rules)` : ''} via the Skill tool first so`,
    `you judge a convention finding against the real rule, not memory.`,
    `Finding [${f.severity}/${f.axis}] at ${f.location}: ${f.title}`,
    `Detail: ${f.detail}`,
    `Open the referenced location(s) and check the surrounding code. Default to refuted=true if the finding`,
    `is speculative, points at a line the diff didn't touch, or restates a decision the spec already settled.`,
  ].join('\n')
}

// One review round for a subtask: N correctness reviewers + 1 dedicated quality reviewer → merge →
// verify blocking. The quality reviewer runs in EVERY round (incl. depth=update) — that's the whole
// point: correctness and quality no longer share one reviewer's attention. Returns surviving findings.
async function reviewRound(st, round) {
  const screenshots = await frontendSnapshots(st)
  const suffix = round ? `·r${round}` : ''
  const reviewThunks = [
    ...Array.from({ length: LOCAL_REVIEWERS }, (_, i) => () =>
      agent(localPrompt(st, i + 1), { label: `review:${st.id}#${i + 1}${suffix}`, phase: 'Local review', schema: LOCAL_SCHEMA })),
    () => agent(qualityPrompt(st), { label: `quality:${st.id}${suffix}`, phase: 'Local review', schema: LOCAL_SCHEMA }),
  ]
  const reviews = (await parallel(reviewThunks)).filter(Boolean)
  if (!reviews.length) return { reviews: [], findings: [], blocking: [], screenshots }
  for (const r of reviews) {
    if (!r.spec_read) log(`WARN ${st.id}: a local reviewer reported spec_read=false — treat as incomplete.`)
    if (st.python && r.skill_loaded !== 'loaded') log(`WARN ${st.id}: python-coding skill not loaded on a Python repo.`)
  }
  // Merge the N reviewers: union of findings, keyed by axis+title; count agreement.
  const merged = new Map()
  for (const r of reviews) {
    for (const f of r.findings) {
      const key = `${f.axis}::${f.title.toLowerCase().trim()}`
      if (!merged.has(key)) merged.set(key, { ...f, agreedBy: 0 })
      merged.get(key).agreedBy += 1
    }
  }
  const findings = [...merged.values()]
  const blockingRaw = findings.filter((f) => f.severity === 'blocking')
  // Verify blocking findings; drop the refuted ones so we don't fix phantom problems.
  const verdicts = blockingRaw.length
    ? (await parallel(blockingRaw.map((f) => () =>
        agent(verifyPrompt(`${st.id} ${f.location}`, f), { label: `verify:${st.id}`, phase: 'Verify', schema: VERDICT_SCHEMA })
          .then((v) => ({ finding: f, refuted: v ? v.refuted : false })))))
        .filter(Boolean)
    : []
  const refuted = new Set(verdicts.filter((v) => v.refuted).map((v) => v.finding.id))
  const survivingBlocking = blockingRaw.filter((f) => !refuted.has(f.id))
  const surviving = findings.filter((f) => !refuted.has(f.id))
  return { reviews, findings: surviving, blocking: survivingBlocking, screenshots }
}

// --- Local pass with bounded fix loop: review → (fix in worktree → re-review) until clean or cap --
// Pipeline so a fast subtask progresses while a slow one is still looping.
const perSubtask = await pipeline(
  subtasks,
  async (st) => {
    let round = 0
    let last = await reviewRound(st, round)
    const fixLog = []
    while (last.blocking.length && round < MAX_FIX_ROUNDS) {
      round += 1
      // Fix runs in an isolated worktree so parallel subtasks can't collide on the same repo.
      const fix = await agent(fixPrompt(st, last.blocking), {
        label: `fix:${st.id}·r${round}`, phase: 'Fix', schema: FIX_SCHEMA, isolation: 'worktree',
      })
      fixLog.push({ round, fix })
      if (!fix || !fix.applied) { log(`${st.id}: fix round ${round} applied nothing — stopping the loop.`); break }
      last = await reviewRound(st, round)
    }
    return { st, reviews: last.reviews, findings: last.findings, blocking: last.blocking, rounds: round, fixLog, screenshots: last.screenshots }
  },
  (entry) => entry,
)

// --- Big-picture pass (first-pass only), after locals are in --------------------------------------
let bigPicture = null
if (depth !== 'update') {
  const bp = await agent(bigPicturePrompt(), { label: 'big-picture', phase: 'Big picture', schema: BIG_PICTURE_SCHEMA })
  if (bp) {
    // Verify big-picture blocking findings too — cross-repo claims are exactly where false positives hurt.
    const blocking = bp.findings.filter((f) => f.severity === 'blocking')
    const verdicts = blocking.length
      ? await parallel(blocking.map((f) => () =>
          agent(verifyPrompt(`big-picture ${f.location}`, f), { label: 'verify:big-picture', phase: 'Verify', schema: VERDICT_SCHEMA })
            .then((v) => ({ finding: f, refuted: v ? v.refuted : false }))))
      : []
    const refuted = new Set(verdicts.filter(Boolean).filter((v) => v.refuted).map((v) => v.finding.id))
    const surviving = bp.findings.filter((f) => !refuted.has(f.id))
    bigPicture = {
      checks: bp.checks,
      findings: surviving,
      notes_to_user: bp.notes_to_user || [],
      verdict: surviving.some((f) => f.severity === 'blocking') ? 'needs-changes' : 'ready',
    }
  }
}

// --- Orchestrator synthesis -----------------------------------------------------------------------
// reviewRound already verified and dropped refuted blocking findings, so entry.findings is final.
const rows = []
const allFindings = []
for (const entry of perSubtask.filter(Boolean)) {
  rows.push({
    subtask: entry.st.id,
    repo: entry.st.repo,
    reviewers: entry.reviews.length,
    fixRounds: entry.rounds,
    verdict: entry.blocking.length ? 'needs-changes' : 'ready',
  })
  for (const f of entry.findings) allFindings.push({ ...f, subtask: entry.st.id, repo: entry.st.repo })
}

// Dedup across subtasks: same axis+title → one finding with many locations.
const byKey = new Map()
for (const f of allFindings) {
  const key = `${f.axis}::${f.title.toLowerCase().trim()}`
  if (!byKey.has(key)) byKey.set(key, { ...f, locations: [] })
  byKey.get(key).locations.push({ subtask: f.subtask, repo: f.repo, location: f.location, agreedBy: f.agreedBy })
}
const rank = { blocking: 0, 'should-fix': 1, nit: 2 }
const deduped = [...byKey.values()].sort((a, b) =>
  (rank[a.severity] - rank[b.severity]) || (b.locations.length - a.locations.length))

const notesToUser = [
  ...perSubtask.filter(Boolean).flatMap((e) =>
    (e.screenshots?.missing || []).map((reason) => `${e.st.id}: ${reason}`)),
  ...perSubtask.filter(Boolean).flatMap((e) => e.reviews.flatMap((r) => r.notes_to_user || [])),
  ...(bigPicture ? bigPicture.notes_to_user : []),
]

const localClean = rows.every((r) => r.verdict === 'ready')
const bpClean = !bigPicture || bigPicture.verdict === 'ready'
const gate = localClean && bpClean ? 'ready' : 'needs-changes'

log(`Gate: ${gate} (depth=${depth}, ${LOCAL_REVIEWERS} local reviewer(s)/subtask). `
  + `${rows.length} subtasks, ${deduped.length} local findings, `
  + `${bigPicture ? bigPicture.findings.length : 0} big-picture findings.`)

const screenshots = perSubtask.filter((e) => e?.screenshots)
  .map((e) => ({ subtask: e.st.id, ...e.screenshots }))
return { gate, depth, verdictTable: rows, findings: deduped, bigPicture, notesToUser, screenshots }
