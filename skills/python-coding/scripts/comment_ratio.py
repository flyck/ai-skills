#!/usr/bin/env python3
"""
Measures the comment-to-code ratio of lines added by a git diff and fails when a
file exceeds the allowed ratio. Python docstrings are reported separately and
never counted against the ratio.
"""

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Optional

# --- tunable constants -------------------------------------------------------
MAX_RATIO = 0.15
MIN_ADDED_CODE_LINES = 10
CANDIDATE_BASE_REFS = (
    "origin/development",
    "origin/main",
    "origin/master",
    "development",
    "main",
    "master",
)
SUPPORTED_SUFFIXES = (".tf", ".py")
LARGEST_BLOCKS_REPORTED = 3
# -----------------------------------------------------------------------------

EXIT_OK = 0
EXIT_GATE_FAILED = 1
EXIT_CANNOT_RUN = 2

HUNK_HEADER_PATTERN = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")
DIFF_TARGET_PATTERN = re.compile(r"^\+\+\+ (?:b/)?(.*)$")
TRIPLE_QUOTE_PATTERN = re.compile(r'"""|\'\'\'')


@dataclass
class CommentBlock:
    """
    A run of consecutive added comment lines, identified by its first line
    number in the new file.
    """

    start_line: int
    length: int


@dataclass
class FileMeasurement:
    """
    Comment/code accounting for the lines a diff adds to a single file.
    """

    path: str
    comment_lines: int = 0
    code_lines: int = 0
    docstring_lines: int = 0
    docstring_uncertain: bool = False
    comment_blocks: list[CommentBlock] = field(default_factory=list)

    @property
    def ratio(self) -> Optional[float]:
        """
        The comment-to-code ratio, or None when there is no added code to
        divide by.
        """
        if self.code_lines == 0:
            return None
        return self.comment_lines / self.code_lines


class GateError(Exception):
    """
    Raised when the gate cannot run at all, as opposed to failing.
    """


def main() -> int:
    """
    Parses arguments, measures the diff and prints the report.
    """
    arguments = parse_arguments()
    try:
        repository_root = resolve_repository_root()
        diff_text = read_diff(
            repository_root, arguments.base, arguments.staged, arguments.paths
        )
    except GateError as error:
        print(f"comment_ratio: {error}", file=sys.stderr)
        return EXIT_CANNOT_RUN

    measurements = measure_diff(diff_text)
    measured, skipped, failed = classify(measurements, arguments.max_ratio)

    if arguments.json:
        print(
            json.dumps(
                build_json_report(measured, skipped, failed, arguments.max_ratio),
                indent=2,
            )
        )
    else:
        print_report(measured, skipped, failed, arguments.max_ratio, arguments.quiet)

    return EXIT_GATE_FAILED if failed else EXIT_OK


def parse_arguments() -> argparse.Namespace:
    """
    Defines the command line interface.
    """
    parser = argparse.ArgumentParser(
        description="Fail when added lines in a git diff are too comment-heavy."
    )
    parser.add_argument("--base", help="base ref to diff against (default: auto-detect)")
    parser.add_argument(
        "--max-ratio",
        type=float,
        default=MAX_RATIO,
        help=f"maximum comment/code ratio (default: {MAX_RATIO})",
    )
    parser.add_argument(
        "--staged",
        action="store_true",
        help="measure staged changes instead of the branch diff",
    )
    parser.add_argument("--paths", nargs="+", default=[], help="restrict to these paths")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--quiet", action="store_true", help="only print failures")
    return parser.parse_args()


def resolve_repository_root() -> str:
    """
    Returns the absolute path of the enclosing git repository.
    """
    try:
        return run_git(["rev-parse", "--show-toplevel"], cwd=None).strip()
    except GateError as error:
        raise GateError(f"not inside a git repository ({error})") from error


def read_diff(
    repository_root: str, base: Optional[str], staged: bool, paths: list[str]
) -> str:
    """
    Returns the unified=0 diff of committed changes to measure.
    """
    command = ["diff", "--unified=0", "--no-color", "--no-ext-diff"]
    if staged:
        command.append("--cached")
    else:
        command.append(f"{resolve_base_ref(repository_root, base)}...HEAD")
    if paths:
        command += ["--"] + paths
    return run_git(command, cwd=repository_root)


def resolve_base_ref(repository_root: str, base: Optional[str]) -> str:
    """
    Returns the requested base ref, or the first candidate that exists.
    """
    if base:
        if not ref_exists(repository_root, base):
            raise GateError(f"base ref '{base}' not found")
        return base
    for candidate in CANDIDATE_BASE_REFS:
        if ref_exists(repository_root, candidate):
            return candidate
    raise GateError(
        "no base ref found, tried: " + ", ".join(CANDIDATE_BASE_REFS) + " (use --base)"
    )


def ref_exists(repository_root: str, ref: str) -> bool:
    """
    Whether git can resolve the given ref.
    """
    try:
        run_git(["rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"], repository_root)
    except GateError:
        return False
    return True


def run_git(arguments: list[str], cwd: Optional[str]) -> str:
    """
    Runs a git subcommand and returns stdout.
    """
    try:
        completed = subprocess.run(
            ["git"] + arguments,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as error:
        raise GateError("git executable not found") from error
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or "").strip() or f"git {arguments[0]} failed"
        raise GateError(detail) from error
    return completed.stdout


def measure_diff(diff_text: str) -> list[FileMeasurement]:
    """
    Walks the diff and accumulates added-line counts per supported file.
    """
    measurements: list[FileMeasurement] = []
    states: dict[str, DocstringState] = {}
    current: Optional[FileMeasurement] = None
    docstring_state: Optional[DocstringState] = None
    next_line_number = 0
    open_block: Optional[CommentBlock] = None

    for line in diff_text.splitlines():
        if line.startswith("diff --git "):
            current = None
            docstring_state = None
            open_block = None
            continue
        if line.startswith("+++ "):
            path = extract_target_path(line)
            current = (
                FileMeasurement(path=path)
                if path and path.endswith(SUPPORTED_SUFFIXES)
                else None
            )
            if current:
                measurements.append(current)
                docstring_state = DocstringState(is_python=path.endswith(".py"))
                states[path] = docstring_state
            open_block = None
            continue
        if line.startswith("--- ") or current is None or docstring_state is None:
            continue
        hunk_match = HUNK_HEADER_PATTERN.match(line)
        if hunk_match:
            next_line_number = int(hunk_match.group(1))
            open_block = None
            continue
        if not line.startswith("+"):
            continue

        classification = docstring_state.classify(line[1:])
        if classification == "comment":
            open_block = extend_comment_block(current, open_block, next_line_number)
        else:
            open_block = None
            if classification == "code":
                current.code_lines += 1
            elif classification == "docstring":
                current.docstring_lines += 1
        next_line_number += 1

    flag_docstring_uncertainty(measurements, states)
    return measurements


class DocstringState:
    """
    Classifies added source lines, tracking triple-quote state so Python
    docstring bodies are separated from comments and code.
    """

    def __init__(self, is_python: bool) -> None:
        self.is_python = is_python
        self.open_quote: Optional[str] = None
        self.in_block_comment = False

    def classify(self, source_line: str) -> str:
        """
        Returns 'comment', 'code', 'docstring' or 'blank' for one added line.
        """
        stripped = source_line.strip()
        if self.is_python:
            return self.classify_python(stripped)
        return self.classify_terraform(stripped)

    def classify_python(self, stripped: str) -> str:
        """
        Classifies a Python line, following triple-quoted string state.
        """
        was_open = self.open_quote is not None
        self.advance_python_quotes(stripped)
        if was_open:
            return "docstring"
        if not stripped:
            return "blank"
        if stripped.startswith("#"):
            return "comment"
        if self.starts_docstring(stripped):
            return "docstring"
        return "code"

    def advance_python_quotes(self, stripped: str) -> None:
        """
        Updates open triple-quote state from the quotes on this line.
        """
        for match in TRIPLE_QUOTE_PATTERN.finditer(stripped):
            token = match.group(0)
            if self.open_quote is None:
                self.open_quote = token
            elif self.open_quote == token:
                self.open_quote = None

    def starts_docstring(self, stripped: str) -> bool:
        """
        Whether a line that is not inside a docstring is itself docstring text.
        """
        prefix_stripped = stripped.lstrip("rbufRBUF")
        return prefix_stripped.startswith('"""') or prefix_stripped.startswith("'''")

    def classify_terraform(self, stripped: str) -> str:
        """
        Classifies a Terraform line, following /* */ block comment state.
        """
        if self.in_block_comment:
            if "*/" in stripped:
                self.in_block_comment = False
            return "comment"
        if not stripped:
            return "blank"
        if stripped.startswith("#") or stripped.startswith("//"):
            return "comment"
        if stripped.startswith("/*"):
            self.in_block_comment = "*/" not in stripped
            return "comment"
        return "code"


def extract_target_path(header_line: str) -> Optional[str]:
    """
    Returns the new-file path from a '+++' diff header, or None for deletions.
    """
    match = DIFF_TARGET_PATTERN.match(header_line)
    if not match:
        return None
    path = match.group(1).strip()
    if path in ("/dev/null", ""):
        return None
    return path.split("\t")[0]


def extend_comment_block(
    measurement: FileMeasurement, open_block: Optional[CommentBlock], line_number: int
) -> CommentBlock:
    """
    Counts a comment line and grows or starts its consecutive block.
    """
    measurement.comment_lines += 1
    if open_block is not None and open_block.start_line + open_block.length == line_number:
        open_block.length += 1
        return open_block
    block = CommentBlock(start_line=line_number, length=1)
    measurement.comment_blocks.append(block)
    return block


def flag_docstring_uncertainty(
    measurements: list[FileMeasurement], states: dict[str, DocstringState]
) -> None:
    """
    Flags Python files whose added lines left a triple quote unclosed, since the
    diff shows no surrounding context to resolve it against.
    """
    for measurement in measurements:
        state = states.get(measurement.path)
        if state and state.is_python and state.open_quote is not None:
            measurement.docstring_uncertain = True


def classify(
    measurements: list[FileMeasurement], max_ratio: float
) -> tuple[list[FileMeasurement], list[FileMeasurement], list[FileMeasurement]]:
    """
    Splits measurements into measured, skipped-as-too-small and failing files.
    """
    measured: list[FileMeasurement] = []
    skipped: list[FileMeasurement] = []
    failed: list[FileMeasurement] = []
    for measurement in measurements:
        if measurement.comment_lines == 0 and measurement.code_lines == 0:
            continue
        if measurement.code_lines == 0:
            failed.append(measurement)
            measured.append(measurement)
            continue
        if measurement.code_lines < MIN_ADDED_CODE_LINES:
            skipped.append(measurement)
            continue
        measured.append(measurement)
        if measurement.comment_lines and measurement.ratio > max_ratio:
            failed.append(measurement)
    return measured, skipped, failed


def print_report(
    measured: list[FileMeasurement],
    skipped: list[FileMeasurement],
    failed: list[FileMeasurement],
    max_ratio: float,
    quiet: bool,
) -> None:
    """
    Prints the human-readable report.
    """
    limit_text = f"limit {format_percentage(max_ratio)}"
    for measurement in failed:
        if measurement.code_lines == 0:
            print(
                f"FAIL  {measurement.path}  {measurement.comment_lines} comment lines "
                f"/ 0 code lines  (comments only)"
            )
        else:
            print(
                f"FAIL  {measurement.path}  {format_percentage(measurement.ratio)} "
                f"({measurement.comment_lines} comment / {measurement.code_lines} code)"
                f"  {limit_text}"
            )
        blocks = describe_largest_blocks(measurement)
        if blocks:
            print(f"        largest comment blocks: {blocks}")
        if measurement.docstring_uncertain:
            print("        docstring detection uncertain")

    if quiet:
        if failed:
            print(f"{len(measured)} files measured, {len(failed)} failed")
        return

    for measurement in measured:
        if measurement in failed:
            continue
        docstring_note = (
            f", {measurement.docstring_lines} docstring"
            if measurement.docstring_lines
            else ""
        )
        uncertainty_note = (
            "  docstring detection uncertain" if measurement.docstring_uncertain else ""
        )
        print(
            f"ok    {measurement.path}  {format_percentage(measurement.ratio)} "
            f"({measurement.comment_lines} comment / {measurement.code_lines} code"
            f"{docstring_note}){uncertainty_note}"
        )
    for measurement in skipped:
        print(
            f"skip  {measurement.path}  only {measurement.code_lines} added code lines "
            f"(minimum {MIN_ADDED_CODE_LINES})"
        )

    if failed:
        print(f"{len(measured)} files measured, {len(failed)} failed")
    else:
        print(f"comment ratio OK ({len(measured)} files measured)")


def build_json_report(
    measured: list[FileMeasurement],
    skipped: list[FileMeasurement],
    failed: list[FileMeasurement],
    max_ratio: float,
) -> dict:
    """
    Builds the machine-readable report.
    """
    failed_paths = {measurement.path for measurement in failed}
    return {
        "max_ratio": max_ratio,
        "min_added_code_lines": MIN_ADDED_CODE_LINES,
        "files_measured": len(measured),
        "files_failed": len(failed),
        "passed": not failed,
        "files": [
            serialize_measurement(measurement, measurement.path in failed_paths)
            for measurement in measured
        ],
        "skipped": [
            {
                "path": measurement.path,
                "added_comment_lines": measurement.comment_lines,
                "added_code_lines": measurement.code_lines,
            }
            for measurement in skipped
        ],
    }


def serialize_measurement(measurement: FileMeasurement, has_failed: bool) -> dict:
    """
    Converts one measurement into JSON-serialisable form.
    """
    return {
        "path": measurement.path,
        "ratio": measurement.ratio,
        "added_comment_lines": measurement.comment_lines,
        "added_code_lines": measurement.code_lines,
        "added_docstring_lines": measurement.docstring_lines,
        "docstring_detection_uncertain": measurement.docstring_uncertain,
        "failed": has_failed,
        "largest_comment_blocks": [
            {"start_line": block.start_line, "lines": block.length}
            for block in sorted_blocks(measurement)
        ],
    }


def describe_largest_blocks(measurement: FileMeasurement) -> str:
    """
    Renders the largest comment blocks as 'L88 (19 lines)' fragments.
    """
    return ", ".join(
        f"L{block.start_line} ({block.length} lines)"
        for block in sorted_blocks(measurement)
    )


def sorted_blocks(measurement: FileMeasurement) -> list[CommentBlock]:
    """
    Returns the largest comment blocks, biggest first.
    """
    ordered = sorted(
        measurement.comment_blocks, key=lambda block: (-block.length, block.start_line)
    )
    return ordered[:LARGEST_BLOCKS_REPORTED]


def format_percentage(ratio: Optional[float]) -> str:
    """
    Formats a ratio as a whole-number percentage.
    """
    if ratio is None:
        return "n/a"
    return f"{round(ratio * 100)}%"


if __name__ == "__main__":
    sys.exit(main())
