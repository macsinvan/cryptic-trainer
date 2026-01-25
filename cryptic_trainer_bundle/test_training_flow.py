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
            # Actually fail the test!
            assert actual == expected, f"{message}: expected {expected!r}, got {actual!r}"

    def assert_true(self, condition: bool, message: str):
        """Assert condition is true."""
        if condition:
            self.assertions.append(f"✓ {message}")
        else:
            self.passed = False
            self.assertions.append(f"✗ {message}")
            # Actually fail the test!
            assert condition, message

    def assert_in(self, item, container, message: str):
        """Assert item in container."""
        if item in container:
            self.assertions.append(f"✓ {message}")
        else:
            self.passed = False
            self.assertions.append(f"✗ {message}: {item!r} not in {container!r}")
            # Actually fail the test!
            assert item in container, f"{message}: {item!r} not in {container!r}"

    def error(self, message: str):
        """Record an error."""
        self.passed = False
        self.errors.append(message)
        # Actually fail the test!
        assert False, message

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
# Structure (flat wordplays, no subOperations):
# - Definition: "Drawing blood" (start)
# - Wordplay 1: discover_anagram (deps: []) - "busy" indicator, "lymph too" fodder → LYMPHTOO
# - Wordplay 2: letter_selection (deps: []) - "at last" from "conclude job" = EB
# - Wordplay 3: solve_anagram (deps: ["1", "2"]) - solve LYMPHTOO+EB = PHLEBOTOMY
#
# Expected training flow:
# 1. Start → Wordplay 1 or 2 available (no deps)
# 2. Complete 1 (teaching moment) and 2
# 3. Wordplay 3 becomes available (deps satisfied)
# 4. Complete 3 → all solved
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

    # First available step should be either 1 or 2 (both have no dependencies)
    current_wp = resp.get('currentWordplay', {})
    wp_id = current_wp.get('id', '')
    result.assert_in(wp_id, ['1', '2'], "First step is 1 or 2 (no dependencies)")

    return result


def test_phlebotomy_dependency_blocking() -> TestResult:
    """Test that wordplays with unsolved dependencies are blocked."""
    result = TestResult("PHLEBOTOMY: Dependency blocking")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Try to select wordplay 3 (solve_anagram, depends on 1 and 2 which are not solved)
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '3'})

    result.assert_true(resp.get('success', False), "API returns success")
    result.assert_true(resp.get('blocked', False), "Wordplay 3 is blocked")
    result.assert_true('blockedHint' in resp, "Response includes blockedHint")

    # Should redirect to an available step
    current_wp = resp.get('currentWordplay', {})
    if current_wp:
        wp_id = current_wp.get('id', '')
        result.assert_in(wp_id, ['1', '2'], "Redirected to available step (1 or 2)")

    return result


def test_phlebotomy_wordplay2_flow() -> TestResult:
    """Test complete flow through wordplay 2 (letter_selection, no dependencies)."""
    result = TestResult("PHLEBOTOMY: Wordplay 2 complete flow")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 2 explicitly
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})
    result.assert_true(resp.get('success', False), "Select wordplay 2 succeeds")
    result.assert_true(not resp.get('blocked', False), "Wordplay 2 is not blocked")

    current_wp = resp.get('currentWordplay', {})
    result.assert_eq(current_wp.get('id'), '2', "Current wordplay is 2")
    result.assert_eq(resp.get('currentPhase'), 'indicator', "Phase is indicator")

    # Check indicator: "at last"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '2',
        'selected': 'at last'
    })
    result.assert_true(resp.get('success', False), "check_indicator succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Indicator 'at last' is correct")
    result.assert_eq(resp.get('currentPhase'), 'teaching_indicator', "Phase is teaching_indicator")

    # Pass indicator teaching to advance
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'pass_indicator_teaching', {'wordplayId': '2'})
    result.assert_true(resp.get('success', False), "pass_indicator_teaching succeeds")
    result.assert_eq(resp.get('currentPhase'), 'fodder', "Phase advances to fodder")

    # Check fodder: "conclude job"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {
        'wordplayId': '2',
        'selected': 'conclude job'
    })
    result.assert_true(resp.get('success', False), "check_fodder succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Fodder 'conclude job' is correct")
    result.assert_eq(resp.get('currentPhase'), 'teaching_fodder', "Phase is teaching_fodder")

    # Pass fodder teaching to advance
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'pass_fodder_teaching', {'wordplayId': '2'})
    result.assert_true(resp.get('success', False), "pass_fodder_teaching succeeds")
    result.assert_eq(resp.get('currentPhase'), 'result', "Phase advances to result")

    # Check result: "EB"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {
        'wordplayId': '2',
        'entered': 'EB'
    })
    result.assert_true(resp.get('success', False), "check_result succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Result 'EB' is correct")
    result.assert_eq(resp.get('currentPhase'), 'teaching_result', "Phase is teaching_result")

    # Pass result teaching to advance
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'pass_result_teaching', {'wordplayId': '2'})
    result.assert_true(resp.get('success', False), "pass_result_teaching succeeds")

    # Wordplay 2 should now be solved, and we should move to next available
    result.assert_true(not resp.get('allSolved', False), "Not all solved yet")

    return result


def test_phlebotomy_wordplay1_flow() -> TestResult:
    """Test complete flow through wordplay 1 (discover_anagram with blockedHint).

    discover_anagram with blockedHint shows teaching phase, then advances after pass_teaching.
    """
    result = TestResult("PHLEBOTOMY: Wordplay 1 complete flow (discover_anagram with teaching)")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 1 explicitly
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '1'})
    result.assert_true(resp.get('success', False), "Select wordplay 1 succeeds")
    result.assert_true(not resp.get('blocked', False), "Wordplay 1 is not blocked")

    current_wp = resp.get('currentWordplay', {})
    result.assert_eq(current_wp.get('id'), '1', "Current wordplay is 1")
    result.assert_eq(resp.get('currentPhase'), 'indicator', "Phase is indicator")

    # blockedHint should be present (informational)
    result.assert_true('blockedHint' in resp, "blockedHint is included in response")

    # Check indicator: "busy"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '1',
        'selected': 'busy'
    })
    result.assert_true(resp.get('success', False), "check_indicator succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Indicator 'busy' is correct")
    result.assert_eq(resp.get('currentPhase'), 'teaching_indicator', "Phase is teaching_indicator")

    # Pass indicator teaching to advance to fodder
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'pass_indicator_teaching', {'wordplayId': '1'})
    result.assert_true(resp.get('success', False), "pass_indicator_teaching succeeds")
    result.assert_eq(resp.get('currentPhase'), 'fodder', "Phase advances to fodder")
    result.assert_true('blockedHint' in resp, "blockedHint still present after indicator")

    # Check fodder: "lymph too"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {
        'wordplayId': '1',
        'selected': 'lymph too'
    })
    result.assert_true(resp.get('success', False), "check_fodder succeeds")
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Fodder 'lymph too' is correct")

    # discover_anagram shows teaching_fodder phase
    result.assert_eq(resp.get('currentPhase'), 'teaching_fodder',
                     "discover_anagram returns teaching_fodder phase")

    # Current wordplay should still be 1 (not advanced yet)
    current_wp = resp.get('currentWordplay', {})
    result.assert_eq(current_wp.get('id'), '1', "Still on 1 during teaching phase")

    # Now pass the fodder teaching moment - for NO_RESULT_OPERATIONS with blockedHint, goes to teaching
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'pass_fodder_teaching', {'wordplayId': '1'})
    result.assert_true(resp.get('success', False), "pass_fodder_teaching succeeds")

    # discover_anagram with blockedHint shows existing teaching phase
    result.assert_eq(resp.get('currentPhase'), 'teaching', "Shows blockedHint teaching phase")

    # Now pass the blockedHint teaching moment
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'pass_teaching', {'wordplayId': '1'})
    result.assert_true(resp.get('success', False), "pass_teaching succeeds")

    # Should move to next available wordplay
    next_wp = resp.get('currentWordplay', {})
    result.assert_true(next_wp.get('id') != '1', "Advanced to next wordplay after pass_teaching")

    return result


def test_phlebotomy_wrong_indicator() -> TestResult:
    """Test that wrong indicator is rejected."""
    result = TestResult("PHLEBOTOMY: Wrong indicator rejected")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 2
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})

    # Submit wrong indicator
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '2',
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

    # Select wordplay 2 and complete indicator/fodder (with teaching passes)
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '2', 'selected': 'at last'})
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_indicator_teaching', {'wordplayId': '2'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {'wordplayId': '2', 'selected': 'conclude job'})
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_fodder_teaching', {'wordplayId': '2'})

    # Submit wrong result
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {
        'wordplayId': '2',
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

    # Step 1: Solve wordplay 1 (discover_anagram, no deps)
    # NOTE: discover_anagram completes after fodder phase with teaching - NO result entry
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '1'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '1', 'selected': 'busy'})
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_indicator_teaching', {'wordplayId': '1'})
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {'wordplayId': '1', 'selected': 'lymph too'})
    result.assert_true(resp.get('validation', {}).get('correct', False), "Wordplay 1 fodder correct")
    # Pass fodder teaching moment
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_fodder_teaching', {'wordplayId': '1'})
    # Pass the blockedHint teaching moment
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_teaching', {'wordplayId': '1'})

    # Step 2: Solve wordplay 2 (letter_selection, no deps)
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '2', 'selected': 'at last'})
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_indicator_teaching', {'wordplayId': '2'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {'wordplayId': '2', 'selected': 'conclude job'})
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_fodder_teaching', {'wordplayId': '2'})
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {'wordplayId': '2', 'entered': 'EB'})
    result.assert_true(resp.get('validation', {}).get('correct', False), "Wordplay 2 solved")
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_result_teaching', {'wordplayId': '2'})

    # Step 3: Now wordplay 3 should be available (deps: ["1", "2"] both solved)
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'get_state')
    current_wp = resp.get('currentWordplay', {})
    result.assert_eq(current_wp.get('id'), '3', "Wordplay 3 is now available")

    # Wordplay 3 (solve_anagram) has fodder as reference, so it skips to result phase
    result.assert_eq(resp.get('currentPhase'), 'result', "Wordplay 3 starts at result phase")

    # Solve the anagram
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {'wordplayId': '3', 'entered': 'PHLEBOTOMY'})
    result.assert_true(resp.get('validation', {}).get('correct', False), "Wordplay 3 solved")
    result.assert_eq(resp.get('currentPhase'), 'teaching_result', "Shows teaching_result phase")

    # Pass result teaching and check allSolved in the response
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'pass_result_teaching', {'wordplayId': '3'})
    result.assert_true(resp.get('allSolved', False), "All wordplays solved")

    return result


def test_phlebotomy_case_insensitive() -> TestResult:
    """Test that indicator/fodder matching is case-insensitive."""
    result = TestResult("PHLEBOTOMY: Case-insensitive matching")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 2
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})

    # Submit indicator with different case
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '2',
        'selected': 'AT LAST'  # Uppercase
    })
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Uppercase indicator accepted")
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_indicator_teaching', {'wordplayId': '2'})

    # Submit fodder with mixed case
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {
        'wordplayId': '2',
        'selected': 'Conclude Job'  # Mixed case
    })
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Mixed case fodder accepted")
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_fodder_teaching', {'wordplayId': '2'})

    # Submit result with lowercase
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_result', {
        'wordplayId': '2',
        'entered': 'eb'  # Lowercase
    })
    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Lowercase result accepted")

    return result


def test_phlebotomy_indices_stored() -> TestResult:
    """Test that selectedIndices are stored and returned by server.

    This is critical for UI highlighting - the server must store the word indices
    when indicator/fodder are checked, so the UI can highlight them.
    """
    result = TestResult("PHLEBOTOMY: Indices stored and returned")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Select wordplay 2
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})
    result.assert_true(resp.get('success', False), "Select wordplay 2 succeeds")

    # Check indicator with indices [7, 8] for "at last"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {
        'wordplayId': '2',
        'selected': 'at last',
        'selectedIndices': [7, 8]  # Word indices for "at" and "last"
    })
    result.assert_true(resp.get('success', False), "check_indicator succeeds")

    current_wp = resp.get('currentWordplay', {})
    state = current_wp.get('state', {})
    result.assert_true(state.get('indicatorFound', False), "indicatorFound is True")
    result.assert_eq(state.get('indicatorIndices'), [7, 8], "indicatorIndices stored correctly")

    # Pass indicator teaching
    training_action(PHLEBOTOMY_CLUE_ID, 'pass_indicator_teaching', {'wordplayId': '2'})

    # Check fodder with indices [5, 6] for "conclude job"
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_fodder', {
        'wordplayId': '2',
        'selected': 'conclude job',
        'selectedIndices': [5, 6]  # Word indices for "conclude" and "job"
    })
    result.assert_true(resp.get('success', False), "check_fodder succeeds")

    current_wp = resp.get('currentWordplay', {})
    state = current_wp.get('state', {})
    result.assert_true(state.get('fodderFound', False), "fodderFound is True")
    result.assert_eq(state.get('fodderIndices'), [5, 6], "fodderIndices stored correctly")
    # Indicator indices should still be present
    result.assert_eq(state.get('indicatorIndices'), [7, 8], "indicatorIndices persists after fodder check")

    return result


def test_phlebotomy_session_isolation() -> TestResult:
    """Test that starting a new session resets all state."""
    result = TestResult("PHLEBOTOMY: Session isolation")

    # Start and partially complete a session
    training_action(PHLEBOTOMY_CLUE_ID, 'start')
    training_action(PHLEBOTOMY_CLUE_ID, 'select_wordplay', {'wordplayId': '2'})
    training_action(PHLEBOTOMY_CLUE_ID, 'check_indicator', {'wordplayId': '2', 'selected': 'at last'})

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


def test_phlebotomy_definition_check() -> TestResult:
    """Test that definition can be checked and state is stored correctly.

    Clue: "Drawing blood, lymph too, busy nurses conclude job at last"
    Definition: "Drawing blood" (position: start, word indices: [0, 1])
    """
    result = TestResult("PHLEBOTOMY: Definition check")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Initially definition should not be found
    clue_entry = resp.get('clueEntry', {})
    state = clue_entry.get('state', {})
    result.assert_true(not state.get('definitionFound', True), "definitionFound initially False")

    # Check definition with correct text and indices
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_definition', {
        'selected': 'Drawing blood',
        'selectedIndices': [0, 1]
    })
    result.assert_true(resp.get('success', False), "check_definition succeeds")

    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Definition 'Drawing blood' is correct")

    # State should now show definition found with indices
    clue_entry = resp.get('clueEntry', {})
    state = clue_entry.get('state', {})
    result.assert_true(state.get('definitionFound', False), "definitionFound is True after correct check")
    result.assert_eq(state.get('definitionIndices'), [0, 1], "definitionIndices stored correctly")

    return result


def test_phlebotomy_definition_wrong() -> TestResult:
    """Test that wrong definition is rejected."""
    result = TestResult("PHLEBOTOMY: Wrong definition rejected")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Check definition with wrong text
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_definition', {
        'selected': 'busy nurses',  # Wrong - should be "Drawing blood"
        'selectedIndices': [4, 5]
    })
    result.assert_true(resp.get('success', False), "API returns success")

    validation = resp.get('validation', {})
    result.assert_true(not validation.get('correct', True), "Wrong definition is rejected")
    result.assert_eq(validation.get('expected'), 'drawing blood', "Expected definition returned")

    # State should NOT show definition found
    clue_entry = resp.get('clueEntry', {})
    state = clue_entry.get('state', {})
    result.assert_true(not state.get('definitionFound', True), "definitionFound still False after wrong check")

    return result


def test_phlebotomy_definition_case_insensitive() -> TestResult:
    """Test that definition matching is case-insensitive."""
    result = TestResult("PHLEBOTOMY: Definition case-insensitive")

    # Start fresh session
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'start')
    if not resp.get('success'):
        result.error(f"Failed to start session: {resp.get('error')}")
        return result

    # Check definition with different case
    resp = training_action(PHLEBOTOMY_CLUE_ID, 'check_definition', {
        'selected': 'DRAWING BLOOD',  # Uppercase
        'selectedIndices': [0, 1]
    })
    result.assert_true(resp.get('success', False), "check_definition succeeds")

    validation = resp.get('validation', {})
    result.assert_true(validation.get('correct', False), "Uppercase definition accepted")

    return result


# =============================================================================
# Test Runner
# =============================================================================

ALL_TESTS = [
    test_phlebotomy_session_start,
    test_phlebotomy_dependency_blocking,
    test_phlebotomy_wordplay2_flow,
    test_phlebotomy_wordplay1_flow,
    test_phlebotomy_wrong_indicator,
    test_phlebotomy_wrong_result,
    test_phlebotomy_full_solve,
    test_phlebotomy_case_insensitive,
    test_phlebotomy_indices_stored,
    test_phlebotomy_session_isolation,
    test_phlebotomy_definition_check,
    test_phlebotomy_definition_wrong,
    test_phlebotomy_definition_case_insensitive,
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
