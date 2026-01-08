#!/usr/bin/env python3
"""
Puzzle Tester - Test harness for cryptic solver against scraped ground truth.

Runs the solver on each clue using ONLY the clue text (no answer hints),
then compares output to the expected result from the scraped puzzle.

Usage:
    python puzzle_tester.py puzzle.json
    python puzzle_tester.py https://timesforthetimes.co.uk/times-29431-just-right
    python puzzle_tester.py puzzle.json --verbose
    python puzzle_tester.py puzzle.json --stop-on-fail
"""

import argparse
import json
import sys
from typing import Dict, List, Any, Optional

from cryptic_trainer import solve
from puzzle_scraper import parse_puzzle


def run_solver(clue_text: str, length: int) -> Dict[str, Any]:
    """Run solver with clue only - no answer hints."""
    return solve(clue=clue_text, length=length, known_answer=None)


def compare_results(expected: Dict[str, Any], actual: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare solver output to expected ground truth.
    Returns a result dict with pass/fail and failure details.
    """
    result = {
        "passed": True,
        "failures": [],
        "warnings": []
    }

    expected_answer = expected.get("answer", "").upper()
    expected_def = expected.get("definition", "").lower().strip()
    expected_def_pos = expected.get("definition_position", "").lower()

    # Get solver's best candidate
    candidates = actual.get("candidates", [])
    pattern_data = actual.get("patternData", {})

    # Check 1: Did solver find the correct answer?
    solver_answers = [c.get("answer", "").upper() for c in candidates]
    top_answer = solver_answers[0] if solver_answers else ""

    if expected_answer not in solver_answers:
        result["passed"] = False
        result["failures"].append({
            "type": "answer_missing",
            "expected": expected_answer,
            "got": solver_answers[:5],
            "message": f"Expected answer '{expected_answer}' not in candidates"
        })
    elif top_answer != expected_answer:
        result["warnings"].append({
            "type": "answer_not_top",
            "expected": expected_answer,
            "got_top": top_answer,
            "rank": solver_answers.index(expected_answer) + 1,
            "message": f"Expected answer '{expected_answer}' found but ranked #{solver_answers.index(expected_answer) + 1}, top was '{top_answer}'"
        })

    # Check 2: Definition text match
    solver_def = pattern_data.get("definitionText", "").lower().strip()
    if expected_def and solver_def:
        # Flexible match - check if one contains the other
        if expected_def not in solver_def and solver_def not in expected_def:
            if expected_answer in solver_answers:  # Only report if we got the answer
                result["warnings"].append({
                    "type": "definition_mismatch",
                    "expected": expected_def,
                    "got": solver_def,
                    "message": f"Definition mismatch: expected '{expected_def}', got '{solver_def}'"
                })

    # Check 3: Definition position
    solver_def_pos = pattern_data.get("definitionPosition", "").lower()
    if expected_def_pos and solver_def_pos:
        if expected_def_pos != solver_def_pos:
            if expected_answer in solver_answers:  # Only report if we got the answer
                result["warnings"].append({
                    "type": "definition_position_mismatch",
                    "expected": expected_def_pos,
                    "got": solver_def_pos,
                    "message": f"Definition position: expected '{expected_def_pos}', got '{solver_def_pos}'"
                })

    # Check 4: Is result complete?
    is_complete = pattern_data.get("isComplete", False)
    if expected_answer in solver_answers and not is_complete:
        result["warnings"].append({
            "type": "incomplete",
            "message": "Solver found answer but patternData.isComplete is False"
        })

    return result


def format_clue_id(clue: Dict[str, Any]) -> str:
    """Format clue identifier for display."""
    num = clue.get("number", "?")
    direction = clue.get("direction", "?")[0].upper()
    return f"{num}{direction}"


def test_puzzle(puzzle: Dict[str, Any], verbose: bool = False, stop_on_fail: bool = False) -> Dict[str, Any]:
    """
    Test all clues in a puzzle against the solver.
    Returns summary statistics.
    """
    metadata = puzzle.get("metadata", {})
    puzzle_id = metadata.get("puzzle_number", "unknown")

    all_clues = puzzle.get("across", []) + puzzle.get("down", [])

    stats = {
        "puzzle_number": puzzle_id,
        "total": len(all_clues),
        "passed": 0,
        "failed": 0,
        "warnings": 0,
        "failures": []
    }

    print(f"\n{'='*60}")
    print(f"Testing Times {puzzle_id} ({len(all_clues)} clues)")
    print(f"{'='*60}\n")

    for clue in all_clues:
        clue_id = format_clue_id(clue)
        clue_text = clue.get("clue_text", "")
        length = clue.get("length", 0)
        expected_answer = clue.get("answer", "")

        if not clue_text or not length:
            print(f"[SKIP] {clue_id}: Missing clue text or length")
            continue

        # Run solver
        try:
            solver_output = run_solver(clue_text, length)
        except Exception as e:
            print(f"[ERROR] {clue_id}: Solver exception - {e}")
            stats["failed"] += 1
            stats["failures"].append({
                "clue_id": clue_id,
                "clue_text": clue_text,
                "expected_answer": expected_answer,
                "error": str(e)
            })
            continue

        # Compare results
        comparison = compare_results(clue, solver_output)

        if comparison["passed"]:
            stats["passed"] += 1
            status = "PASS"
            if comparison["warnings"]:
                stats["warnings"] += len(comparison["warnings"])
                status = "WARN"
        else:
            stats["failed"] += 1
            status = "FAIL"
            stats["failures"].append({
                "clue_id": clue_id,
                "clue_text": clue_text,
                "expected_answer": expected_answer,
                "expected_definition": clue.get("definition", ""),
                "expected_wordplay": clue.get("wordplay", ""),
                "failures": comparison["failures"],
                "warnings": comparison["warnings"],
                "solver_top_answers": [c.get("answer") for c in solver_output.get("candidates", [])[:5]],
                "solver_pattern_data": solver_output.get("patternData", {})
            })

        # Print result line
        symbol = {"PASS": "✓", "WARN": "⚠", "FAIL": "✗"}[status]
        color = {"PASS": "\033[92m", "WARN": "\033[93m", "FAIL": "\033[91m"}[status]
        reset = "\033[0m"

        print(f"[{color}{symbol}{reset}] {clue_id}: {expected_answer}")

        if verbose or status == "FAIL":
            print(f"    Clue: {clue_text}")
            if comparison["failures"]:
                for f in comparison["failures"]:
                    print(f"    ✗ {f['message']}")
            if comparison["warnings"] and verbose:
                for w in comparison["warnings"]:
                    print(f"    ⚠ {w['message']}")

        if stop_on_fail and status == "FAIL":
            print("\n[STOPPED] --stop-on-fail triggered")
            break

    # Print summary
    print(f"\n{'='*60}")
    print(f"SUMMARY: {stats['passed']}/{stats['total']} passed, {stats['failed']} failed, {stats['warnings']} warnings")
    print(f"{'='*60}\n")

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Test cryptic solver against scraped puzzle ground truth"
    )
    parser.add_argument(
        "input",
        help="Puzzle JSON file or Times for the Times URL"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output for all clues"
    )
    parser.add_argument(
        "--stop-on-fail", "-s",
        action="store_true",
        help="Stop on first failure"
    )
    parser.add_argument(
        "--output", "-o",
        help="Save detailed failure report to JSON file"
    )

    args = parser.parse_args()

    # Load puzzle - either from file or URL
    if args.input.startswith("http"):
        print(f"Fetching puzzle from {args.input}...")
        puzzle = parse_puzzle(args.input)
    else:
        with open(args.input, "r", encoding="utf-8") as f:
            puzzle = json.load(f)

    # Run tests
    stats = test_puzzle(puzzle, verbose=args.verbose, stop_on_fail=args.stop_on_fail)

    # Save failure report if requested
    if args.output and stats["failures"]:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump({
                "puzzle_number": stats["puzzle_number"],
                "summary": {
                    "total": stats["total"],
                    "passed": stats["passed"],
                    "failed": stats["failed"]
                },
                "failures": stats["failures"]
            }, f, indent=2, ensure_ascii=False)
        print(f"Failure report saved to {args.output}")

    # Exit with error code if failures
    sys.exit(1 if stats["failed"] > 0 else 0)


if __name__ == "__main__":
    main()
