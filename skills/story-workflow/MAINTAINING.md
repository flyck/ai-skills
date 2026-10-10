# Maintaining story-workflow

`SKILL.md` (with `reference.md`) and the workflow scripts are one contract in two encodings:
`review-gate.workflow.js` runs the review gate and `flow-b.workflow.js` runs the whole Flow B
continuation. Following the prose by hand and launching a workflow must behave the same.

- Any change to a flow step goes into both in the same edit. A step added to Flow B in prose (e.g. a
  PR-description refresh, bot-comment prune, skip detection) needs its stage or prompt in
  `flow-b.workflow.js`. A reviewer rule tightened in a script is reflected in the prose.
- A step that exists in only one of them is a bug: it silently does nothing on the path the user
  didn't take.
- When they drift, the prose is the source of truth; bring the script back to it.
- The reviewer rubric lives once, in `review.md`; the scripts quote its axes, so renumbering an axis
  means updating both scripts.
