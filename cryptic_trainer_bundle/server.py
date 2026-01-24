#!/usr/bin/env python3
"""
Simple HTTP server wrapper for the cryptic trainer solver.
Run with: python3 server.py
Listens on http://localhost:5001/solve

Also provides clue storage API:
  GET  /clues         - List all clues
  POST /clues         - Save/update a clue
  DELETE /clues/<id>  - Delete a clue by ID
  POST /clues/bulk    - Bulk import clues
  POST /clues/clear   - Clear all clues
  GET  /parser-issues - List parser issues
  POST /parser-issues - Save a parser issue
"""

import copy
import json
import os
import re
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure we import from the same directory as this script, not cwd
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)

from cryptic_trainer import solve

# --- Clue Storage ---
DB_FILE = os.path.join(_script_dir, 'clues_db.json')
_db_lock = threading.Lock()

# --- Training Sessions (in-memory working copies) ---
_training_sessions = {}  # clueId -> { clueEntry: {...}, startTime: timestamp }
SESSION_TIMEOUT_SECONDS = 3600  # Clean up sessions older than 1 hour

def _load_db():
    """Load the clue database from JSON file."""
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {"version": 2, "training_items": {}, "parser_issues": {}}

def _save_db(db):
    """Save the clue database atomically."""
    with _db_lock:
        tmp_file = DB_FILE + '.tmp'
        with open(tmp_file, 'w') as f:
            json.dump(db, f, indent=2)
        os.replace(tmp_file, DB_FILE)


class SolverHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _send_json(self, data, status=200):
        """Helper to send JSON response."""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_GET(self):
        """Handle GET requests."""
        if self.path == '/clues':
            db = _load_db()
            items = list(db.get('training_items', {}).values())
            self._send_json({'items': items})
        elif self.path == '/parser-issues':
            db = _load_db()
            items = list(db.get('parser_issues', {}).values())
            self._send_json({'items': items})
        else:
            self.send_error(404)

    def do_DELETE(self):
        """Handle DELETE requests."""
        if self.path.startswith('/clues/'):
            clue_id = self.path[7:]  # Remove '/clues/' prefix
            db = _load_db()
            items = db.get('training_items', {})
            if clue_id in items:
                del items[clue_id]
                _save_db(db)
                self._send_json({'success': True})
            else:
                self._send_json({'success': False, 'error': 'Not found'}, 404)
        else:
            self.send_error(404)

    def do_POST(self):
        # Handle /solve endpoint
        if self.path == '/solve':
            self._handle_solve()
            return

        # Handle clue storage endpoints
        if self.path == '/clues':
            self._handle_save_clue()
        elif self.path == '/clues/import':
            self._handle_import_puzzle()
        elif self.path == '/clues/bulk':
            self._handle_bulk_import()
        elif self.path == '/clues/clear':
            self._handle_clear()
        elif self.path == '/parser-issues':
            self._handle_save_parser_issue()
        elif self.path == '/training/action':
            self._handle_training_action()
        else:
            self.send_error(404)

    def _handle_save_clue(self):
        """Save or update a single clue."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            item = json.loads(body)

            clue_id = item.get('id')
            if not clue_id:
                self._send_json({'success': False, 'error': 'Missing id'}, 400)
                return

            db = _load_db()
            is_new = clue_id not in db['training_items']
            db['training_items'][clue_id] = item
            _save_db(db)

            self._send_json({'success': True, 'isNew': is_new})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_bulk_import(self):
        """Bulk import clues."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            items = data.get('items', [])

            db = _load_db()
            imported = 0
            errors = 0

            for item in items:
                clue_id = item.get('id')
                if clue_id:
                    db['training_items'][clue_id] = item
                    imported += 1
                else:
                    errors += 1

            _save_db(db)
            self._send_json({'success': True, 'imported': imported, 'errors': errors})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_clear(self):
        """Clear all training items."""
        try:
            db = _load_db()
            db['training_items'] = {}
            _save_db(db)
            self._send_json({'success': True})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _validate_clue_entry(self, clue_key, clue_entry):
        """
        Validate a ClueEntry against the full schema.
        Returns list of error strings (empty if valid).
        """
        errors = []

        # Validate clue object
        clue_obj = clue_entry.get('clue')
        if not clue_obj:
            errors.append('Missing clue object')
        else:
            for field in ['number', 'text', 'enumeration', 'answer']:
                if not clue_obj.get(field):
                    errors.append(f'clue.{field} is required')

        # Validate clueType
        clue_type = clue_entry.get('clueType')
        if not clue_type:
            errors.append('Missing clueType object')
        elif not clue_type.get('id'):
            errors.append('clueType.id is required')
        elif clue_type.get('id') not in ['standard', 'double_definition', 'cryptic_definition', 'andit']:
            errors.append(f"clueType.id must be one of: standard, double_definition, cryptic_definition, andit (got '{clue_type.get('id')}')")

        # Validate definition
        definition = clue_entry.get('definition')
        if not definition:
            errors.append('Missing definition object')
        else:
            if not definition.get('text'):
                errors.append('definition.text is required')
            if not definition.get('position'):
                errors.append('definition.position is required')
            elif definition.get('position') not in ['start', 'end']:
                errors.append(f"definition.position must be 'start' or 'end' (got '{definition.get('position')}')")

        # Validate wordplays array
        wordplays = clue_entry.get('wordplays')
        if not wordplays:
            errors.append('Missing wordplays array')
        elif not isinstance(wordplays, list):
            errors.append('wordplays must be an array')
        elif len(wordplays) == 0:
            errors.append('wordplays array cannot be empty')
        else:
            for i, wp in enumerate(wordplays):
                wp_prefix = f'wordplays[{i}]'

                # Required fields for all wordplays
                if not wp.get('id'):
                    errors.append(f'{wp_prefix}.id is required')
                if not wp.get('operation'):
                    errors.append(f'{wp_prefix}.operation is required')
                if 'dependencies' not in wp:
                    errors.append(f'{wp_prefix}.dependencies is required (use [] for none)')
                elif not isinstance(wp.get('dependencies'), list):
                    errors.append(f'{wp_prefix}.dependencies must be an array')
                if not wp.get('state'):
                    errors.append(f'{wp_prefix}.state is required')
                else:
                    state = wp.get('state')
                    for state_field in ['indicatorFound', 'fodderFound', 'resultEntered', 'solved']:
                        if state_field not in state:
                            errors.append(f'{wp_prefix}.state.{state_field} is required')

                # Validate subOperations if present
                sub_ops = wp.get('subOperations')
                if sub_ops is not None:
                    if not isinstance(sub_ops, list):
                        errors.append(f'{wp_prefix}.subOperations must be an array')
                    else:
                        for j, sub in enumerate(sub_ops):
                            sub_prefix = f'{wp_prefix}.subOperations[{j}]'
                            if not sub.get('id'):
                                errors.append(f'{sub_prefix}.id is required')
                            if not sub.get('operation'):
                                errors.append(f'{sub_prefix}.operation is required')
                            if 'dependencies' not in sub:
                                errors.append(f'{sub_prefix}.dependencies is required')
                            if not sub.get('state'):
                                errors.append(f'{sub_prefix}.state is required')

        return errors

    def _handle_import_puzzle(self):
        """
        Import a puzzle file. Validates against full schema, stores exactly as received.

        Schema: See DESIGN_SPEC.md for complete ClueEntry and Wordplay schemas.
        """
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            puzzle_data = data.get('puzzle')
            publication_id = data.get('publicationId', 'times')

            # Step 2: Validate JSON integrity
            if not puzzle_data:
                self._send_json({'success': False, 'error': 'Missing puzzle data'}, 400)
                return

            if 'metadata' not in puzzle_data:
                self._send_json({'success': False, 'error': 'Missing metadata object'}, 400)
                return

            if 'clues' not in puzzle_data:
                self._send_json({'success': False, 'error': 'Missing clues object'}, 400)
                return

            metadata = puzzle_data.get('metadata', {})
            clues_dict = puzzle_data['clues']

            db = _load_db()
            saved = 0
            skipped = 0
            errors = []

            # Step 3-6: Validate and store each ClueEntry
            for clue_key, clue_entry in clues_dict.items():
                # Step 3: Validate against full schema
                validation_errors = self._validate_clue_entry(clue_key, clue_entry)

                if validation_errors:
                    errors.append({
                        'clueNumber': clue_key,
                        'clueText': clue_entry.get('clue', {}).get('text', '(no text)'),
                        'errors': validation_errors
                    })
                    continue

                # Step 5: Check for duplicates
                clue_text = clue_entry['clue']['text']
                normalized = re.sub(r'[^a-z0-9]', '', clue_text.lower())

                exists = False
                for item in db['training_items'].values():
                    existing_text = item.get('clueEntry', {}).get('clue', {}).get('text', '')
                    existing_norm = re.sub(r'[^a-z0-9]', '', existing_text.lower())
                    if existing_norm == normalized:
                        exists = True
                        break

                if exists:
                    skipped += 1
                    continue

                # Step 6: Store exactly as received - no transformation
                clue_id = f"user-{int(time.time() * 1000)}-{clue_key}"

                training_item = {
                    'id': clue_id,
                    'clueEntry': clue_entry,  # Store ClueEntry exactly as received
                    'metadata': metadata,      # Store puzzle metadata
                    'publicationId': publication_id,
                    'timestamp': int(time.time() * 1000)
                }

                db['training_items'][clue_id] = training_item
                saved += 1

            _save_db(db)

            # Step 7: Return response
            self._send_json({
                'success': len(errors) == 0,
                'saved': saved,
                'skipped': skipped,
                'errors': errors
            })

        except json.JSONDecodeError as e:
            self._send_json({'success': False, 'error': f'Invalid JSON: {e}'}, 400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_save_parser_issue(self):
        """Save a parser issue."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            issue = json.loads(body)

            issue_id = issue.get('id')
            if not issue_id:
                self._send_json({'success': False, 'error': 'Missing id'}, 400)
                return

            db = _load_db()
            db['parser_issues'][issue_id] = issue
            _save_db(db)

            self._send_json({'success': True})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_solve(self):
        """Handle the /solve endpoint."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            data = json.loads(body)
            clue = data.get('clue', '')
            length = data.get('length')
            known_answer = data.get('knownAnswer')
            training_json = data.get('trainingJson')

            # Extract length from clue if not provided
            if length is None:
                match = re.search(r'\((\d+)\)\s*$', clue)
                if match:
                    length = int(match.group(1))
                else:
                    length = 0

            # Run the solver
            result = solve(
                clue=clue,
                length=length,
                known_answer=known_answer,
                training_json=training_json
            )

            self._send_json(result)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'error': str(e)}, 500)

    def _is_wordplay_blocked(self, wordplay, all_wordplays):
        """Check if a wordplay's dependencies are all solved.

        For wordplays WITH subOperations: ignore top-level dependencies,
        use subOperation dependencies instead (more granular).

        For wordplays WITHOUT subOperations: use top-level dependencies.

        Dependencies can reference:
        - Top-level wordplay IDs (e.g., "1", "2", "3")
        - SubOperation IDs (e.g., "1A", "1B") within parent wordplays
        """
        # If this wordplay has subOperations, check if ANY subOp is available
        # (ignore top-level dependencies - they're redundant)
        sub_ops = wordplay.get('subOperations', [])
        if sub_ops:
            # Wordplay is blocked only if ALL its subOperations are blocked
            for sub in sub_ops:
                if sub.get('state', {}).get('solved', False):
                    continue  # Already solved, check next
                if not self._check_deps_blocked(sub.get('dependencies', []), all_wordplays):
                    return False  # At least one subOp is available
            return True  # All subOps are either solved or blocked

        # No subOperations - use top-level dependencies
        return self._check_deps_blocked(wordplay.get('dependencies', []), all_wordplays)

    def _check_deps_blocked(self, deps, all_wordplays):
        """Check if any dependency in the list is unsolved (blocking)."""
        if not deps:
            return False
        for dep_id in deps:
            # First, try to find as top-level wordplay
            dep = next((wp for wp in all_wordplays if wp.get('id') == dep_id), None)
            if dep:
                if not dep.get('state', {}).get('solved', False):
                    return True
                continue

            # Not found at top level - search in subOperations
            found = False
            for wp in all_wordplays:
                for sub in wp.get('subOperations', []):
                    if sub.get('id') == dep_id:
                        found = True
                        if not sub.get('state', {}).get('solved', False):
                            return True
                        break
                if found:
                    break

            # If dependency not found at all, treat as blocking (missing dep = blocked)
            if not found:
                return True
        return False

    def _is_fodder_reference(self, fodder):
        """Check if fodder is a reference object (not user-selectable text)."""
        return isinstance(fodder, dict) and fodder.get('type') == 'result'

    def _find_wordplay_by_id(self, wordplays, wordplay_id):
        """Find a wordplay or subOperation by ID.

        Returns tuple: (wordplay_or_subop, parent_wordplay_or_none, is_subop)
        - For top-level wordplay: (wordplay, None, False)
        - For subOperation: (subop, parent_wordplay, True)
        - If not found: (None, None, False)
        """
        # First check top-level wordplays
        wp = next((w for w in wordplays if w.get('id') == wordplay_id), None)
        if wp:
            return (wp, None, False)

        # Check subOperations
        for parent in wordplays:
            for sub in parent.get('subOperations', []):
                if sub.get('id') == wordplay_id:
                    return (sub, parent, True)

        return (None, None, False)

    def _build_training_response(self, clue_entry, wordplays, step, phase, is_subop=False, parent_wp=None, **extra):
        """Build a consistent training action response.

        Args:
            clue_entry: The full clue entry with current state
            wordplays: List of all wordplays (for index lookup)
            step: The current wordplay/subOp to work on (or None)
            phase: Current phase string
            is_subop: Whether step is a subOperation
            parent_wp: Parent wordplay if step is a subOp
            **extra: Additional fields (validation, blocked, blockedHint, allSolved, etc.)
        """
        response = {
            'success': True,
            'clueEntry': clue_entry,
            'currentWordplay': step,
            'currentPhase': phase,
            'isSubOperation': is_subop,
        }

        # Add index
        if step:
            if is_subop and parent_wp:
                response['parentWordplay'] = parent_wp
                response['currentWordplayIndex'] = wordplays.index(parent_wp)
            else:
                response['currentWordplayIndex'] = wordplays.index(step)
        else:
            response['currentWordplayIndex'] = -1

        # Add blockedHint if present on step
        if step and step.get('blockedHint'):
            response['blockedHint'] = step.get('blockedHint')

        # Merge any extra fields
        response.update(extra)

        return response

    def _cleanup_old_sessions(self):
        """Remove training sessions older than SESSION_TIMEOUT_SECONDS."""
        now = time.time()
        expired = [
            clue_id for clue_id, session in _training_sessions.items()
            if now - session.get('startTime', 0) > SESSION_TIMEOUT_SECONDS
        ]
        for clue_id in expired:
            del _training_sessions[clue_id]

    # Operations that don't require user to type a result
    # (they complete after fodder phase)
    NO_RESULT_OPERATIONS = {'fodder_selection'}

    def _get_wordplay_phase(self, wp):
        """Determine current phase for a wordplay or subOperation.

        Phase flow depends on operation type:
        - fodder_selection: indicator → fodder → DONE (no result entry)
        - Most operations: indicator → fodder → result
        - Reference fodder: indicator → result (skip fodder)
        """
        state = wp.get('state', {})
        operation = wp.get('operation', '')

        # Check if state has indicator tracking (full state vs minimal)
        if 'indicatorFound' not in state:
            # Minimal state - check operation type
            if operation in self.NO_RESULT_OPERATIONS:
                return 'complete'  # No result phase for selection ops
            return 'result'

        fodder = wp.get('fodder', '')

        if not state.get('indicatorFound', False):
            return 'indicator'

        # If fodder is a reference, skip fodder phase entirely
        if self._is_fodder_reference(fodder):
            # Auto-mark fodderFound since it's computed, not selected
            if not state.get('fodderFound', False):
                state['fodderFound'] = True
            # Check if this operation type needs result
            if operation in self.NO_RESULT_OPERATIONS:
                return 'complete'
            return 'result'

        if not state.get('fodderFound', False):
            return 'fodder'

        # Fodder found - check if this operation needs result entry
        if operation in self.NO_RESULT_OPERATIONS:
            return 'complete'

        return 'result'

    def _get_next_available_wordplay(self, wordplays):
        """Find the first unblocked, unsolved step (wordplay or subOperation).

        For wordplays WITH subOperations: serve individual subOps as steps.
        For wordplays WITHOUT subOperations: serve the wordplay itself.

        Returns tuple: (step, parent_wordplay_or_none, is_subop)
        - For top-level wordplay: (wordplay, None, False)
        - For subOperation: (subop, parent_wordplay, True)
        """
        for wp in wordplays:
            if wp.get('state', {}).get('solved', False):
                continue  # Already solved

            sub_ops = wp.get('subOperations', [])
            if sub_ops:
                # Check subOperations for this wordplay
                for sub in sub_ops:
                    if sub.get('state', {}).get('solved', False):
                        continue  # Already solved
                    if not self._check_deps_blocked(sub.get('dependencies', []), wordplays):
                        return (sub, wp, True)  # Available subOp
            else:
                # No subOperations - check wordplay itself
                if not self._check_deps_blocked(wp.get('dependencies', []), wordplays):
                    return (wp, None, False)

        return (None, None, False)

    def _reset_wordplay_states(self, clue_entry):
        """Reset all wordplay states to initial (unsolved) for a fresh training session."""
        entry = copy.deepcopy(clue_entry)
        # Initialize clue-level state (definition)
        entry['state'] = {
            'definitionFound': False,
            'definitionIndices': []
        }
        for wp in entry.get('wordplays', []):
            wp['state'] = {
                'indicatorFound': False,
                'fodderFound': False,
                'resultEntered': False,
                'solved': False
            }
            # Also reset subOperations if present (full state like wordplays)
            for sub in wp.get('subOperations', []):
                sub['state'] = {
                    'indicatorFound': False,
                    'fodderFound': False,
                    'resultEntered': False,
                    'solved': False
                }
        return entry

    def _handle_training_action(self):
        """
        Handle training actions. Server decides what's available.
        Uses in-memory session for working state, doesn't persist until complete.

        Request: { clueId, action, data }
        - action: "start" | "check_indicator" | "check_fodder" | "check_result" | "get_state"

        Response: {
            clueEntry: <full clue data with updated state>,
            currentWordplay: <wordplay user should work on>,
            currentPhase: "indicator" | "fodder" | "result" | "blocked",
            blocked: true/false,
            blockedHint: "..." if blocked,
            validation: { correct: true/false, expected: "..." } if checking
        }
        """
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            clue_id = data.get('clueId')
            action = data.get('action', 'get_state')
            action_data = data.get('data', {})

            if not clue_id:
                self._send_json({'success': False, 'error': 'Missing clueId'}, 400)
                return

            db = _load_db()
            item = db['training_items'].get(clue_id)
            if not item:
                self._send_json({'success': False, 'error': 'Clue not found'}, 404)
                return

            # Clean up old sessions periodically
            self._cleanup_old_sessions()

            # Get or create training session
            if action == 'start' or clue_id not in _training_sessions:
                # 'start' always creates fresh session with reset state
                clue_entry = self._reset_wordplay_states(item.get('clueEntry', {}))
                _training_sessions[clue_id] = {
                    'clueEntry': clue_entry,
                    'startTime': time.time()
                }

            # Work with session copy
            session = _training_sessions[clue_id]
            clue_entry = session['clueEntry']
            wordplays = clue_entry.get('wordplays', [])

            # Handle different actions
            if action == 'get_state' or action == 'start':
                (current_step, parent_wp, is_subop) = self._get_next_available_wordplay(wordplays)

                if not current_step:
                    all_solved = all(wp.get('state', {}).get('solved', False) for wp in wordplays)
                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, None,
                        'complete' if all_solved else 'blocked',
                        allSolved=all_solved
                    ))
                    return

                phase = self._get_wordplay_phase(current_step)
                self._send_json(self._build_training_response(
                    clue_entry, wordplays, current_step, phase,
                    is_subop, parent_wp, blocked=False
                ))

            elif action == 'check_definition':
                # Validate definition selection
                selected = action_data.get('selected', '')
                selected_indices = action_data.get('selectedIndices', [])

                # Get expected definition from clue entry
                definition = clue_entry.get('definition', {})
                expected = definition.get('text', '').lower().strip()
                selected_norm = selected.lower().strip()

                # Check if selection matches expected definition
                correct = selected_norm == expected

                if correct:
                    clue_entry['state']['definitionFound'] = True
                    clue_entry['state']['definitionIndices'] = selected_indices

                self._send_json({
                    'success': True,
                    'validation': {'correct': correct, 'expected': expected},
                    'clueEntry': clue_entry
                })

            elif action == 'check_indicator':
                wordplay_id = action_data.get('wordplayId')
                selected = action_data.get('selected', '')

                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                expected = wp.get('indicator', '').lower().strip()
                correct = selected.lower().strip() == expected

                if correct:
                    wp['state']['indicatorFound'] = True
                    wp['state']['indicatorIndices'] = action_data.get('selectedIndices', [])

                next_phase = self._get_wordplay_phase(wp) if correct else 'indicator'
                self._send_json(self._build_training_response(
                    clue_entry, wordplays, wp, next_phase, is_subop, parent_wp,
                    validation={'correct': correct, 'expected': expected}
                ))

            elif action == 'check_fodder':
                wordplay_id = action_data.get('wordplayId')
                selected = action_data.get('selected', '')

                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                fodder = wp.get('fodder', '')

                # If fodder is a reference, this shouldn't be called - but handle gracefully
                if self._is_fodder_reference(fodder):
                    wp['state']['fodderFound'] = True
                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, wp, 'result', is_subop, parent_wp,
                        validation={'correct': True, 'expected': '(reference fodder)'}
                    ))
                    return

                expected = fodder.lower().strip()
                correct = selected.lower().strip() == expected

                if correct:
                    wp['state']['fodderFound'] = True
                    wp['state']['fodderIndices'] = action_data.get('selectedIndices', [])
                    # For fodder_selection operations, completing fodder = solved
                    if wp.get('operation', '') in self.NO_RESULT_OPERATIONS:
                        wp['state']['resultEntered'] = True
                        wp['state']['solved'] = True

                # Determine next step/phase
                if correct:
                    next_phase = self._get_wordplay_phase(wp)
                    if next_phase == 'complete':
                        # Check for teaching moment BEFORE advancing
                        if wp.get('blockedHint'):
                            # Return teaching phase — stay on current step
                            self._send_json(self._build_training_response(
                                clue_entry, wordplays, wp, 'teaching', is_subop, parent_wp,
                                validation={'correct': correct, 'expected': expected}
                            ))
                            return

                        # No blockedHint — advance immediately
                        (next_step, next_parent, next_is_subop) = self._get_next_available_wordplay(wordplays)
                        if next_step:
                            next_phase = self._get_wordplay_phase(next_step)
                        else:
                            all_solved = all(w.get('state', {}).get('solved', False) for w in wordplays)
                            next_phase = 'complete' if all_solved else 'blocked'
                        self._send_json(self._build_training_response(
                            clue_entry, wordplays, next_step, next_phase, next_is_subop, next_parent,
                            validation={'correct': correct, 'expected': expected}
                        ))
                        return
                    # Stay on same wordplay for result phase
                    next_step, next_parent, next_is_subop = wp, parent_wp, is_subop
                else:
                    next_phase = 'fodder'
                    next_step, next_parent, next_is_subop = wp, parent_wp, is_subop

                self._send_json(self._build_training_response(
                    clue_entry, wordplays, next_step, next_phase, next_is_subop, next_parent,
                    validation={'correct': correct, 'expected': expected}
                ))

            elif action == 'check_result':
                wordplay_id = action_data.get('wordplayId')
                entered = action_data.get('entered', '')

                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                expected = wp.get('result', '').upper().strip()
                correct = entered.upper().strip() == expected

                if correct:
                    wp['state']['resultEntered'] = True
                    wp['state']['solved'] = True

                # Find next available step
                (next_step, next_parent, next_is_subop) = self._get_next_available_wordplay(wordplays)
                all_solved = all(w.get('state', {}).get('solved', False) for w in wordplays)
                next_phase = self._get_wordplay_phase(next_step) if next_step else ('complete' if all_solved else 'blocked')

                # Clean up session when all solved
                if all_solved and clue_id in _training_sessions:
                    del _training_sessions[clue_id]

                self._send_json(self._build_training_response(
                    clue_entry, wordplays, next_step, next_phase, next_is_subop, next_parent,
                    validation={'correct': correct, 'expected': expected},
                    allSolved=all_solved
                ))

            elif action == 'pass_teaching':
                wordplay_id = action_data.get('wordplayId')

                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                # Advance to next available step
                (next_step, next_parent, next_is_subop) = self._get_next_available_wordplay(wordplays)
                if next_step:
                    next_phase = self._get_wordplay_phase(next_step)
                else:
                    all_solved = all(w.get('state', {}).get('solved', False) for w in wordplays)
                    next_phase = 'complete' if all_solved else 'blocked'

                self._send_json(self._build_training_response(
                    clue_entry, wordplays, next_step, next_phase, next_is_subop, next_parent
                ))

            elif action == 'select_wordplay':
                wordplay_id = action_data.get('wordplayId')

                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                if self._is_wordplay_blocked(wp, wordplays):
                    # Find unblocked alternative
                    (alt_step, alt_parent, alt_is_subop) = self._get_next_available_wordplay(wordplays)
                    alt_phase = self._get_wordplay_phase(alt_step) if alt_step else 'blocked'
                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, alt_step, alt_phase, alt_is_subop, alt_parent,
                        blocked=True,
                        blockedHint=wp.get('blockedHint', 'Solve dependencies first'),
                        requestedWordplay=wp
                    ))
                else:
                    phase = self._get_wordplay_phase(wp)
                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, wp, phase, is_subop, parent_wp,
                        blocked=False
                    ))

            else:
                self._send_json({'success': False, 'error': f'Unknown action: {action}'}, 400)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'success': False, 'error': str(e)}, 500)

    def log_message(self, format, *args):
        print(f"[solver] {args[0]}")

if __name__ == '__main__':
    port = 5001
    server = HTTPServer(('localhost', port), SolverHandler)
    print(f"Cryptic Trainer Solver running on http://localhost:{port}/solve")
    print("Press Ctrl+C to stop")
    server.serve_forever()
