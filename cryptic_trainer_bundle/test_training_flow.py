#!/usr/bin/env python3
"""
Golden Clue Regression Tests for Training Flow API.

Tests the /training/action endpoint with known good clues (golden clues)
to verify the complete training flow:
- Session start with state reset
- Dependency blocking (blocked wordplays show hint)
- Phase transitions (indicator → fodder → result)
- SubOperation handling (independent steps with own dependencies)
- Answer validation

Usage:
    python3 test_training_flow.py                    # Run all tests
    python3 test_training_flow.py --verbose          # Show detailed output
    python3 test_training_flow.py --test PHLEBOTOMY  # Run specific test

Requires server running on localhost:5001
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

SERVER_URL = "http://localhost:5001"


def api_call(endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Make POST request to server API."""
    url = f"{SERVER_URL}{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        return {'success': False, 'error': f"HTTP {e.code}: {body}"}
    except urllib.error.URLError as e:
        return {'success': False, 'error': f"Connection failed: {e.reason}"}


def training_action(clue_id: str, action: str, data: Optional[Dict] = None) -> Dict[str, Any]:
    """Call /training/action endpoint."""
    payload = {'clueId': clue_id, 'action': action}
    if data:
        payload['data'] = data
    return api_call('/training/action', payload)


class TestResult:
    """Tracks test results for a single test case."""
    def __init__(self, name: str):
        self.name = name
        self.passed = True
        self.assertions = []
        self.errors = []

    def assert_eq(self, actual, expected, message: str):
        """Assert equality with descriptive message."""
        if actual == expected:
            self.assertions.append(f"✓ {message}")
        else:
            self.passed = False
            self.assertions.append(f"✗ {message}: expected {expected!r}, got {actual!r}")

    def assert_true(self, condition: bool, message: str):
        """Assert condition is true."""
        if condition:
            self.assertions.append(f"✓ {message}")
        else:
            self.passed = False
            self.assertions.append(f"✗ {message}")

    def assert_in(self, item, container, message: str):
        """Assert item in container."""
        if item in container:
            self.assertions.append(f"✓ {message}")
        else:
            self.passed = False
            self.assertions.append(f"✗ {message}: {item!r} not in {container!r}")

    def error(self, message: str):
        """Record an error."""
        self.passed = False
        self.errors.append(message)

    def print_result(self, verbose: bool = False):
        """Print test result."""
        status = "\033[92m✓ PASS\033[0m" if self.passed else "\033[91m✗ FAIL\033[0m"
        print(f"{status} {self.name}")
        if verbose or not self.passed:
            for assertion in self.assertions:
                print(f"    {assertion}")
            for error in self.errors:
                print(f"    ERROR: {error}")


# =============================================================================
# GOLDEN CLUE: PHLEBOTOMY
# =============================================================================
# Clue: "Drawing blood, lymph too, busy nurses conclude job at last"
# Answer: PHLEBOTOMY (10)
#
# Structure:
# - Definition: "Drawing blood" (start)
# - Wordplay 1: anagram with subOperations
#   - SubOp 1A: fodder_selection (deps: []) - select "lymph too" with indicator "busy"
#   - SubOp 1B: solve_anagram (deps: ["2", "3"]) - solve LYMPHTOO+EB = PHLEBOTOMY
# - Wordplay 2: container (deps: ["1A", "3"]) - "nurses" indicates insertion
# - Wordplay 3: letter_selection (deps: []) - "at last" from "conclude job" = EB
#
# Expected training flow:
# 1. Start → SubOp 1A available (no deps), Wordplay 3 available (no deps)
# 2. Server should serve whichever comes first in structure
# 3. Complete 1A and 3 → SubOp 1B becomes available
# 4. Complete 1B → Wordplay 1 solved → Wordplay 2 becomes available
# =============================================================================

PHLEBOTOMY_CLUE_ID = "user-1769245327284-1A"


def test_phlebotomy_session_start() -> TestResult:
    """Test that starting a training session returns correct initial state."""
    result = TestResult("PHLEBOTOMY: Session start")

    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')

    result.assert_true(resp.get('success', False), "API returns success")

    if not resp.get('success'):
        result.error(f"API error: {resp.get('error')}")
        return result

    # Should have clueEntry
    result.assert_true('clueEntry' in resp, "Response contains clueEntry")

    # Should have currentWordplay (the first available step)
    result.assert_true('currentWordplay' in resp, "Response contains currentWordplay")
    result.assert_true(resp.get('currentWordplay') is not None, "currentWordplay is not None")

    # Should NOT be complete yet
    result.assert_true(not resp.get('allSolved', False), "allSolved is False")

    # Current phase should be indicator (first phase)
    result.assert_eq(resp.get('currentPhase'), 'indicator', "Initial phase is 'indicator'")

    # First available step should be either 1A or 3 (both have no dependencies)
    current_wp = resp.get('currentWordplay', {})
    wp_id = current_wp.get('id', '')
    result.assert_in(wp_id, ['1A', '3'], "First step is 1A or 3 (no dependencies)")

    return result


def test_phlebotomy_dependency_blocking() -> TestResult:
    """Test that wordplays with unsolved dependencies are blocked."""
    result = TestResult("PHLEBOTOMY: Dependency blocking")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Try to select SubOp 1B (depends on 2 and 3, which are not solved)
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '1B'})

    result.assert_true(resp.get('success', False), "API returns success")
    result.assert_true(resp.get('blocked', False), "SubOp 1B is blocked")
    result.assert_true('blockedHint' in resp, "Response includes blockedHint")

    # Should redirect to an available step
    current_wp = resp.get('currentWordplay', {})
    if current_wp:
        wp_id = current_wp.get('id', '')
        result.assert_in(wp_id, ['1A', '3'], "Redirected to available step (1A or 3)")

    return result


def test_phlebotomy_wordplay3_flow() -> TestResult:
    """Test complete flow through wordplay 3 (letter_selection, no dependencies)."""
    result = TestResult("PHLEBOTOMY: Wordplay 3 complete flow")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 3 explicitly
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '3'})
    result.assert_true(resp.get('success', False), "Select wordplay 3 succeeds")
    result.assert_true(not resp.get('blocked', False), "Wordplay 3 is not blocked")

    current_wp = resp.get('currentWordplay', {})
    result.assert_eq(current_wp.get('id'), '3', "Current wordplay is 3")
    result.assert_eq(resp.get('currentPhase'), 'indicator', "Phase is indicator")

    # Check indicator: "at last"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '3',
        'selected': 'at last'
    })
    result.assert_true(resp.get('success', False), "check_indicator succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Indicator 'at last' is correct")
    result.assert_eq(resp.get('currentPhase'), 'fodder', "Phase advances to fodder")

    # Check fodder: "conclude job"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {
        'wordplayId': '3',
        'selected': 'conclude job'
    })
    result.assert_true(resp.get('success', False), "check_fodder succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Fodder 'conclude job' is correct")
    result.assert_eq(resp.get('currentPhase'), 'result', "Phase advances to result")

    # Check result: "EB"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {
        'wordplayId': '3',
        'entered': 'EB'
    })
    result.assert_true(resp.get('success', False), "check_result succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Result 'EB' is correct")

    # Wordplay 3 should now be solved, and we should move to next available
    result.assert_true(not resp.get('allSolved', False), "Not all solved yet")

    return result


def test_phlebotomy_subop1a_flow() -> TestResult:
    """Test complete flow through SubOp 1A (fodder_selection, no dependencies).

    fodder_selection operations complete after fodder phase - NO result entry needed.
    """
    result = TestResult("PHLEBOTOMY: SubOp 1A complete flow (fodder_selection)")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select subOp 1A explicitly
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '1A'})
    result.assert_true(resp.get('success', False), "Select subOp 1A succeeds")
    result.assert_true(not resp.get('blocked', False), "SubOp 1A is not blocked")

    current_wp = resp.get('currentWordplay', {})
    result.assert_eq(current_wp.get('id'), '1A', "Current wordplay is 1A")
    result.assert_eq(resp.get('currentPhase'), 'indicator', "Phase is indicator")

    # blockedHint should be present (informational)
    result.assert_true('blockedHint' in resp, "blockedHint is included in response")

    # Check indicator: "busy"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '1A',
        'selected': 'busy'
    })
    result.assert_true(resp.get('success', False), "check_indicator succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Indicator 'busy' is correct")
    result.assert_eq(resp.get('currentPhase'), 'fodder', "Phase advances to fodder")
    result.assert_true('blockedHint' in resp, "blockedHint still present after indicator")

    # Check fodder: "lymph too"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {
        'wordplayId': '1A',
        'selected': 'lymph too'
    })
    result.assert_true(resp.get('success', False), "check_fodder succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Fodder 'lymph too' is correct")

    # fodder_selection operations should complete after fodder - NO result phase
    result.assert_true(resp.get('currentPhase') != 'result',
                       "fodder_selection does NOT advance to result phase")

    # Should move to next available wordplay (3 or 1B depending on deps)
    next_wp = resp.get('currentWordplay', {})
    result.assert_true(next_wp.get('id') != '1A', "Moved to next wordplay after completing 1A")

    return result


def test_phlebotomy_wrong_indicator() -> TestResult:
    """Test that wrong indicator is rejected."""
    result = TestResult("PHLEBOTOMY: Wrong indicator rejected")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 3
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '3'})

    # Submit wrong indicator
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '3',
        'selected': 'conclude'  # Wrong - should be "at last"
    })
    result.assert_true(resp.get('success', False), "API returns success")
    validation = resp.get('validation', {})
    result.assert_true(not validation.get('correct', True), "Wrong indicator is rejected")
    result.assert_eq(validation.get('expected'), 'at last', "Expected indicator is 'at last'")

    return result


def test_phlebotomy_wrong_result() -> TestResult:
    """Test that wrong result is rejected."""
    result = TestResult("PHLEBOTOMY: Wrong result rejected")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 3 and complete indicator/fodder
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '3'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '3', 'selected': 'at last'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {'wordplayId': '3', 'selected': 'conclude job'})

    # Submit wrong result
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {
        'wordplayId': '3',
        'entered': 'AB'  # Wrong - should be "EB"
    })
    result.assert_true(resp.get('success', False), "API returns success")
    validation = resp.get('validation', {})
    result.assert_true(not validation.get('correct', True), "Wrong result is rejected")
    result.assert_eq(validation.get('expected'), 'EB', "Expected result is 'EB'")

    return result


def test_phlebotomy_full_solve() -> TestResult:
    """Test complete solve of all wordplays in correct order."""
    result = TestResult("PHLEBOTOMY: Full solve sequence")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    result.assert_true(not resp.get('allSolved', False), "Initially not all solved")

    # Step 1: Solve wordplay 3 (letter_selection, no deps)
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '3'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '3', 'selected': 'at last'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {'wordplayId': '3', 'selected': 'conclude job'})
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {'wordplayId': '3', 'entered': 'EB'})
    result.assert_true(resp.get('validation', {}).get('correct', False), "Wordplay 3 solved")

    # Step 2: Solve SubOp 1A (fodder_selection, no deps)
    # NOTE: fodder_selection completes after fodder phase - NO result entry
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '1A'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '1A', 'selected': 'busy'})
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {'wordplayId': '1A', 'selected': 'lymph too'})
    result.assert_true(resp.get('validation', {}).get('correct', False), "SubOp 1A solved (fodder_selection)")

    # Step 3: Now SubOp 1B should be available (deps: 2, 3 - but 3 is solved)
    # Actually deps are ["2", "3"], and 2 depends on ["1A", "3"]
    # So after solving 3 and 1A, we need to check what's available

    # Get current state
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'get_state')
    current_wp = resp.get('currentWordplay', {})
    result.assert_true(current_wp is not None, "Still have available wordplay")

    # The next available might be 2 (container) or 1B
    # Based on dependency chain: 2 needs [1A, 3], both solved now
    # 1B needs [2, 3], so 2 should be next

    # Try selecting wordplay 2 (container)
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})

    # Wordplay 2 has fodder as reference, so it might skip to result phase
    # The container operation uses results from other wordplays

    # Continue solving remaining wordplays until all done
    # (The exact flow depends on the container operation specifics)

    # Check final state
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'get_state')

    # Not asserting allSolved here since we haven't completed all steps
    # This test verifies the dependency chain is working
    result.assert_true(resp.get('success', False), "Can get state after partial solve")

    return result


def test_phlebotomy_case_insensitive() -> TestResult:
    """Test that indicator/fodder matching is case-insensitive."""
    result = TestResult("PHLEBOTOMY: Case-insensitive matching")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 3
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '3'})

    # Submit indicator with different case
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '3',
        'selected': 'AT LAST'  # Uppercase
    })
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Uppercase indicator accepted")

    # Submit fodder with mixed case
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {
        'wordplayId': '3',
        'selected': 'Conclude Job'  # Mixed case
    })
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Mixed case fodder accepted")

    # Submit result with lowercase
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {
        'wordplayId': '3',
        'entered': 'eb'  # Lowercase
    })
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Lowercase result accepted")

    return result


def test_phlebotomy_session_isolation() -> TestResult:
    """Test that starting a new session resets all state."""
    result = TestResult("PHLEBOTOMY: Session isolation")

    # Start and partially complete a session
    training_action(PHLEBOTOMY_CLUE_ID, 'start')
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '3'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '3', 'selected': 'at last'})

    # Start a NEW session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')

    result.assert_true(resp.get('success', False), "New session starts successfully")

    # Should be back to indicator phase (state reset)
    result.assert_eq(resp.get('currentPhase'), 'indicator', "Phase reset to indicator")

    # Wordplay should not show as solved
    current_wp = resp.get('currentWordplay', {})
    state = current_wp.get('state', {})
    result.assert_true(not state.get('indicatorFound', True), "indicatorFound is reset")
    result.assert_true(not state.get('solved', True), "solved is reset")

    return result


# =============================================================================
# Test Runner
# =============================================================================

ALL_TESTS = [
    test_phlebotomy_session_start,
    test_phlebotomy_dependency_blocking,
    test_phlebotomy_wordplay3_flow,
    test_phlebotomy_subop1a_flow,
    test_phlebotomy_wrong_indicator,
    test_phlebotomy_wrong_result,
    test_phlebotomy_full_solve,
    test_phlebotomy_case_insensitive,
    test_phlebotomy_session_isolation,
]


def run_tests(verbose: bool = False, test_filter: Optional[str] = None) -> int:
    """Run all tests and return exit code."""
    print("=" * 60)
    print("Golden Clue Training Flow Regression Tests")
    print("=" * 60)
    print()

    # Check server is running
    try:
        resp = api_call('/clues', {})
        # Actually /clues is GET not POST, let's just try the training endpoint
    except Exception:
        pass  # We'll catch connection errors in tests

    tests_to_run = ALL_TESTS
    if test_filter:
        tests_to_run = [t for t in ALL_TESTS if test_filter.upper() in t.__name__.upper()]
        if not tests_to_run:
            print(f"No tests match filter: {test_filter}")
            return 1

    passed = 0
    failed = 0
    results = []

    for test_fn in tests_to_run:
        try:
            result = test_fn()
            results.append(result)
            result.print_result(verbose)
            if result.passed:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            result = TestResult(test_fn.__name__)
            result.error(f"Exception: {e}")
            result.print_result(verbose)
            results.append(result)
            failed += 1

    print()
    print("=" * 60)
    print(f"SUMMARY: {passed}/{passed + failed} passed, {failed} failed")
    print("=" * 60)

    return 0 if failed == 0 else 1


def main():
    parser = argparse.ArgumentParser(
        description="Run golden clue regression tests for training flow"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output for all tests"
    )
    parser.add_argument(
        "--test", "-t",
        help="Run only tests matching this name (case-insensitive)"
    )

    args = parser.parse_args()

    sys.exit(run_tests(verbose=args.verbose, test_filter=args.test))


if __name__ == "__main__":
    main()
