# story-workflow — situational reference

Read a section only when its trigger applies; `SKILL.md` links each one from the step that needs it.

## Frontend design snapshots

Trigger: a subtask changes UI.

- Create **`before/` and `after/` beside the spec** with PNGs of the relevant screens and states, so the
  user can compare progress and share it with a designer.
- Derive scenarios from the spec and feedback: populated, empty, disabled/not enabled,
  permission-dependent and error states where relevant, plus narrow layouts when affected. Include a
  connected screen when it explains a flow (e.g. the settings screen that enables a disabled feature);
  no exhaustive matrix of unrelated states.
- Use a **temporary Playwright test and config** in an ignored scratch directory. Reuse the app's login
  helpers and mock API responses to reach each state with the real components; no screenshot-only
  scaffolding or pixel assertions in permanent tests.
- Capture `before/` from the pre-change app before implementing. If work has started, use an isolated
  checkout of the recorded baseline revision; never overwrite current work or label the modified app
  "before". Keep existing baseline images on later feedback rounds.
- Capture `after/` with the same fixture data, locale, viewport and framing as its baseline, under
  matching descriptive filenames (`location-disabled-desktop.png`); document new screens with no
  baseline counterpart.
- Before capture, wait for the intended tab/state, fonts, loading and transitions to settle; clear
  incidental hover/focus unless it is the subject; crop to the relevant panel; use synthetic data, never
  live customer data.
- **Open and inspect every PNG** before sharing. Record scenario, mocked conditions, viewport and
  baseline/current revision in the spec's working-state companion, and return direct links. The PNGs
  live with the spec, not only in disposable Playwright reports or app assets.
- Refresh affected `after/` images after visual changes; remove the temporary harness when finished. A
  screen that cannot be reproduced is recorded as missing, with the reason. Screenshots support design
  review; they replace neither behavioural tests nor the review gate.
- With the workflow scripts: mark UI subtasks `frontend: true`, pass `specPath`, and `baselineRef` if the
  baseline is not `origin/<base>`. The screenshot stage runs before local review and after fix rounds;
  unchanged or merged Flow B subtasks keep their snapshots.

## setuptools-scm dev versions: 409 after force-push

Trigger: a redeploy after force-push fails with `409 Conflict` on a Python lib published with
`twine upload` of an scm-derived dev version (e.g. `1.1.5.dev3` from `git describe` =
`vX.Y.Z-<N>-g<sha>`).

- The version depends on the commit **distance** from the last tag, not the sha. A force-push with the
  same commit count recomputes the same version, and the index refuses to overwrite it. A lockfile
  change (e.g. a CVE bump) does not change this either.
- This is expected, not a broken deploy: if the rewrite only squashed cosmetic fixups (comments,
  docstrings, refactors with no behaviour or public-API change), the published artifact is functionally
  identical. Record the 409 in the inventory and move on; do **not** retry-loop.
- Only if the rewrite changed behaviour a consumer must receive, publish anew with an extra commit or a
  new tag.

## Waiting on review-bot comments

Trigger: the project has an **AI review bot** setting.

- After opening draft PRs, wait the delay the setting names, then fetch comments through the **PR
  host**. Don't report a PR done before that.
- With several PRs, open them all first, then collect comments together.
- Address the legitimate comments; only then is the subtask complete.

## Prune outdated review-bot comments

Trigger: a change round on a PR the bot has commented on.

- Comments from an earlier revision go **obsolete**: they point at removed lines, flag already-changed
  code, or restate a resolved concern. They clutter the PR and misstate its state.
- For each open comment: still valid → address with code; obsolete, superseded or noise → delete.
  Resolve or delete rather than reply.
- **Repeated summary posts are usually the bulk, and they all go.** Many bots post an
  acceptance-criteria report on every push (16 across three PRs in one story, against one real
  finding). On a multi-repo story they are also systematically wrong: a criterion met by a sibling repo
  reads as "could not determine". Delete them; keep substantive inline findings. The bot setting names
  its report format.
- The orchestrator may delete comments by you or the bot on your own story PR without asking. Deletion
  is irreversible, so a fan-out **workflow agent only proposes deletions**; the orchestrator executes
  them after review, with the user in the loop when in doubt. **Never delete a human reviewer's
  comment** — address it or reply.

## Don't write "scope notes" to a review bot

- A per-repo bot sees one repo's diff, so it often claims an acceptance criterion is unmet (e.g. "the
  secret field is visible to read-only users") when another repo enforces it correctly.
- **Ignore such comments without replying.** Respond only to comments that demand a real change, and
  respond with code.
- Anti-example: *"Scope note for the acceptance-criteria comments: this database PR only introduces the
  new table … the read-only role restriction … is intentionally implemented in the companion
  application repos … No database change is required here."* The bot won't use it, it clutters the PR
  for humans, and it reads as defending against a finding instead of fixing code.
