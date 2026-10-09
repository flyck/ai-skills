---
name: python-coding
description: Python coding conventions covering execution, dependencies, style, docstrings, testing, and linting. Use when writing, changing, or reviewing code in any Python repo (e.g. Lambda functions, API integrations, packages).
---

Apply these conventions when writing or reviewing Python code (e.g. Lambda functions, API integrations, packages).

In a company repo, also load the `company-guidelines` skill if it exists: it holds the company-specific rules.

When a change is, or will be, larger than 400 changed lines, load the `stacked-pr` skill and split it into stacked pull requests.

## Steps

**1. Python execution**

Always use the virtual environment's Python interpreter directly:

```
.venv/bin/python -m <module> <args>
```

Examples:
- Running tests: `.venv/bin/python -m pytest tests/ -v`
- Running a script: `.venv/bin/python -m mymodule`
- Using pip: `.venv/bin/python -m pip install <package>`

Do NOT use:
- `source .venv/bin/activate && python ...` (shell activation)
- `python ...` (global Python)
- `pipenv run python ...` (use the venv directly)

**2. Dependencies**

- Pass dependencies (service clients, database connections) to classes and functions through their constructors or as arguments — improves testability and decouples components.

**3. Coding style**

- Type hinting: use Python's type hints for all function signatures and variables.
- Do not replace explicit named parameters with `**kwargs` just to avoid lint or refactor friction.
  Keep named parameters unless accepting arbitrary keyword arguments is the function's actual purpose.
- Imports:
  - All imports must be at the top of the file (module level).
  - NEVER use inline imports inside functions, except in test files where they are acceptable.
  - Organize imports in the standard order: standard library, third-party, local application.
- Logging: use the standard `logging` module for all log messages; configure logging centrally when possible.
- Custom exceptions: define custom exception classes in an `exceptions.py` file for specific error conditions.
- Constants: store all constants in a `consts.py` file or as module-level constants to avoid magic strings and numbers.
- Descriptive naming: use clear and descriptive names for variables, functions, and classes.
- Function ordering: helper/private functions must always be defined BELOW the function(s) that call them, not above. Public entry points come first. This holds for newly added functions as well — place a new helper below its caller instead of at the top of the file.
  - Exception: definitions Python has to resolve at module/class definition time cannot go below their first use. Dataclasses, `TypedDict`s, enums, and module-level constants referenced in annotations or default values therefore belong above the code using them.
- Data structures: use `TypedDict`, dataclasses, or custom classes for well-defined, type-safe data structures.
- Environment variables: access all environment-specific configuration (e.g. ARNs, URLs) through environment variables.
- Error handling: implement robust error handling with `try...except` blocks and custom exceptions.
- Database transactions:
  - Use context managers (`with` statements) for connection management.
  - Call `commit()` on successful operations.
  - Call `rollback()` in exception handlers to prevent partial updates.
- Avoid `COALESCE` in queries. It is almost always a symptom rather than a solution: reaching for it usually means a statement is writing columns it has no value for, or that two different writers share one statement and are defending against each other. Fix the shape instead — write only the columns you actually own, so a plain `SET col = EXCLUDED.col` (or a plain `UPDATE`) is sufficient. If `COALESCE` still seems necessary after that, explain in the PR description why a simple statement cannot express it.

**4. Docstrings and comments**

- Avoid `:param` and `:return:` style documentation as it is often bloaty and redundant.
- When updating a function that already has empty/trivial param docstrings (e.g. just `:param x:` with no description, or `:return:` with no description), DELETE them instead of extending them — convert to the simple three-line format.
- Exception: keep `:return:` documentation when it provides non-obvious value not already clear from the function description or return type (e.g. `:return: the display name to show on the invoice` clarifies which name among multiple options).
- Docstring structure — use a three-line format:
  ```python
  def example_function():
      """
      Clear description of what the function does.
      Can span multiple lines if needed.
      """
  ```
  - First line: opening `"""`
  - Middle line(s): description (can include line breaks)
  - Last line: closing `"""`
- New functions get a short docstring only noting extraordinary business-logic reasons that justify them — no re-describing their logic and no implementation details (performance constraints, atomicity mechanics, request batching); those belong in the implementation or a design doc.
- NEVER touch existing docstrings when making unrelated changes — keep the diff small.
- Do NOT add comments that merely restate what the code does (e.g. `# Insert test customer and API keys`).
- Remove chatty/spammy comments that are overly verbose or don't add value.
- Only add comments when explaining non-obvious logic, business rules, or workarounds.
- Do not add explanatory comments directly above constants. Constants must be named precisely enough
  to stand on their own; if context is needed, put the comment at the non-obvious usage site instead.
- **Prefer expressive code over explanatory comments.** A comment is the fallback for what naming and structure genuinely cannot carry. If a comment is needed to make a block understandable, first try to make that unnecessary: name the function or variable after the rule it implements, extract the condition into a well-named helper or constant, or split the branch. A comment restating what better naming would have said is a smell.
- These prose rules are enforced by a measurable gate: the comment-ratio script in step 6 fails the branch when added comment lines exceed 15% of added code lines. Docstrings are excluded from the ratio, so mandating them costs nothing.
- **Business logic belongs in the layer that owns it, and so do its comments.** Helper modules for external systems — `db_helper.py`, API clients, queue/bus wrappers — describe *what they do to that system*, not *why the business wants it*. A DB helper may note things that concern the database itself (why a statement is shaped a certain way, a constraint interaction, an index dependency); it must not explain product rules, provider behaviour, or feature sequencing. Put that reasoning in the calling controller/handler code, where the decision is actually made — or leave it out entirely if the code already reads clearly. Business-logic commentary scattered through low-level helpers is a code smell: it duplicates knowledge, drifts from the truth, and hides where the decision really lives.

**5. Testing**

- **Prefer end-to-end tests over unit tests, and treat that preference as strongest for anything that builds or runs a query.** A unit test that asserts on a compiled SQL string proves the string, not the behaviour: it passes while the query returns wrong rows, duplicates rows, or cross joins, and it has to be rewritten every time the SQL is formatted differently. An e2e test against the real schema (a test database built from the project's own migrations, never a hand-written copy of the tables) asserts on the rows that come back, which is the thing the caller actually depends on.
  - Query building, filters, joins, ordering, pagination, counts: e2e, asserting on returned ids/values.
  - Reserve unit tests for logic with no database in it — input validation, error raising, pure helpers.
  - Do not assert on compiled SQL text (`str(query)`, `.compile()`, counting `LEFT OUTER JOIN` occurrences) when the same defect is observable in query results. If a defect is genuinely invisible in results, say so explicitly and prove it another way — a cartesian product, for example, shows up as duplicate or multiplied rows, and SQLAlchemy only *warns* about it, so an e2e test must assert the row count, not rely on the warning.
  - When adding an e2e test for a bug, verify it actually fails with the bug reintroduced. A test that passes both ways is not coverage.
- Write unit tests for all new functionality.
- Organize tests in the `tests` directory, mirroring the application's structure.
- Use test fixtures and mocking to set up and reuse test data.
- Do not put inline `SELECT` statements directly in test methods. Add reusable select/fetch helpers
  to the DB fixture layer and call those from tests, just like insert/setup helpers.
- For moto-backed AWS tests, prefer the `@mock_aws` decorator over manually calling
  `mock_aws().start()` / `.stop()` in `setUp`/`tearDown`. The decorator scopes the mock to the test
  automatically, so there is no stray `self._aws_mock` state to keep paired. Only fall back to
  start/stop when the mock genuinely has to begin before something the decorator cannot cover — e.g.
  creating boto3 clients or importing modules with module-level clients at a specific point.
  - Applied to a class, `@mock_aws` only patches methods defined **directly on that class** — it
    inspects `klass.__dict__`. Put it on the concrete `TestCase` that holds the `test_*` methods, not
    on a shared fixture base class. If `setUp` is inherited from the fixture, redeclare it on the
    decorated class (`def setUp(self): super().setUp()`) so the mock also covers setup-time AWS calls;
    that needs a targeted `# pylint: disable=useless-parent-delegation`.
  - Do not set fake AWS credential environment variables unless a specific library explicitly
    requires them.
- Do not write tests that assert on log output. Log messages are diagnostics, not behaviour: they get
  reworded, re-levelled and removed freely, so a test asserting on them breaks on harmless edits while
  proving nothing about what the code does. This includes `caplog`/`assertLogs` assertions that a
  value does or does not appear in a log line — for example checking that a secret was redacted.
  Test the function that produces the value instead, or leave it untested.

**6. Linting**

- ALWAYS run pylint on ALL Python files in the project (`.venv/bin/python -m pylint **/*.py --recursive=y`), not just modified files — this catches `duplicate-code` violations across the entire codebase that per-file linting misses.
- All files must achieve a 10.00/10 score across the entire project.
- Address all linting issues; do not use pylint disable comments except for very specific cases.
- When encountering `duplicate-code` (R0801) errors:
  - Analyze the duplicated blocks carefully — the error shows larger blocks than just a few similar lines.
  - Structural/boilerplate duplication (like job processor initialization patterns) should be refactored into shared functions.
  - Extract common logic into helper modules when the duplication is substantial.
- Pylint disable comments must come AFTER imports, never before them.
- ALWAYS run the comment-ratio gate, with the same standing as the 10.00/10 pylint score:

  ```
  python3 ~/.claude/skills/python-coding/scripts/comment_ratio.py
  ```

  Stdlib only — no venv, no install. It measures added `.tf` and `.py` lines in the **committed** diff against the auto-detected base (`origin/development`, then `origin/main`/`master`, …), so commit first; uncommitted work is never judged. Python docstrings are counted separately and excluded from the ratio. Exit `0` passes, `1` means a file is over the 15% limit, `2` means the gate could not run. A nonzero exit must be fixed by deleting comments, not explained away. Useful flags: `--base <ref>`, `--staged` (pre-commit), `--paths`, `--json`, `--quiet`.

## Rules

- Never put inline `SELECT` statements directly in test methods; add select/fetch helpers to the DB fixture instead.
- Never cover query behaviour with unit tests that assert on compiled SQL strings when an e2e test against the real schema would assert on the returned rows; and never add a regression test without checking it fails with the bug reintroduced.
- Never assert on log output in a test (`caplog`, `assertLogs`, matching a log line) — including to prove a secret was redacted. Logs are diagnostics, not behaviour.
- Never use inline imports inside functions (except in test files).
- Never call `python` directly or activate the venv via `source`; always invoke `.venv/bin/python -m ...`.
- Never place helper/private functions above the public functions that call them — including newly added ones. Only definitions Python must resolve up front (dataclasses, `TypedDict`s, enums, module-level constants) go above their usage.
- Never touch existing docstrings as a side effect of an unrelated change.
- Never add a comment to explain a constant declaration; rename the constant instead and comment only a non-obvious usage decision.
- Never leave a file below 10.00/10 pylint score or suppress warnings with disable comments except in specific, justified cases.
- Never report work as done or open a PR without a clean run of `python3 ~/.claude/skills/python-coding/scripts/comment_ratio.py` on the committed diff. A nonzero exit is fixed by cutting comments, never by raising the threshold or arguing the comments are warranted.
- Never add fake AWS credential environment variables for moto tests unless a specific library explicitly requires them.
- Never hand-roll `mock_aws().start()`/`.stop()` in `setUp`/`tearDown` when the `@mock_aws` decorator will do; put the decorator on the concrete `TestCase` holding the `test_*` methods, since it only patches methods defined directly on the decorated class.
- Never replace explicit named parameters with `**kwargs` unless arbitrary keyword forwarding is intentional.
