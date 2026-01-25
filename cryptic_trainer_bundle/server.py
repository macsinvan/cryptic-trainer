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
import training_handler

# --- Clue Storage ---
DB_FILE = os.path.join(_script_dir, 'clues_db.json')
_db_lock = threading.Lock()

# --- Training Sessions (in-memory working copies) ---
_training_sessions = {}  # clueId -> { clueEntry: {...}, startTime: timestamp }
SESSION_TIMEOUT_SECONDS = 3600  # Clean up sessions older than 1 hour

# --- Teaching Content ---
# General teaching for definition types (by clueType.id)
DEFINITION_TEACHING = {
    'standard': "In standard definition clues the definition is always found at the start or the end of the clue — never buried in the middle.",
    'double_definition': "Double definitions have no wordplay — just two different meanings of the same word.",
    'triple_definition': "Triple definitions are rare — three separate meanings for one word, with no wordplay.",
    'cryptic_definition': "The entire clue is a misleading definition — there's no separate wordplay.",
    'andit': "In an &lit clue, the whole clue is both definition AND wordplay simultaneously."
}

# General teaching for wordplay operations (by operation type)
WORDPLAY_TEACHING = {
    'anagram': "Anagram indicators suggest disorder or change: 'mixed', 'broken', 'wild', 'drunk'.",
    'discover_anagram': "Anagram indicators suggest disorder or change: 'mixed', 'broken', 'wild', 'drunk'.",
    'letter_selection': "Letter selection extracts specific letters: 'first' (initial), 'last' (final), 'odd', 'even'.",
    'container': "Container indicators signal one thing goes inside another: 'in', 'around', 'holding'.",
    'hidden': "Hidden word indicators conceal the answer consecutively within the clue text.",
    'reversal': "Reversal indicators suggest backwards movement: 'back', 'returned', 'up' (in down clues).",
    'deletion': "Deletion indicators remove letters: 'headless' (first), 'endless' (last), 'heartless' (middle).",
    'homophone': "Homophone indicators signal a word that sounds like the answer: 'heard', 'said', 'reportedly'.",
    'abbreviation': "Common abbreviations: directions (N,S,E,W), titles (DR, ST), units, symbols.",
    'synonym': "Synonym substitution replaces a word with its equivalent meaning.",
    'solve_anagram': "Now rearrange all the collected letters to form the answer."
}

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
        elif self.path == '/training/start':
            self._handle_training_start()
        elif self.path == '/training/input':
            self._handle_training_input()
        elif self.path == '/training/continue':
            self._handle_training_continue()
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

    # ==========================================================================
    # NEW TEMPLATE-BASED TRAINING ENDPOINTS
    # ==========================================================================

    def _handle_training_start(self):
        """Start a new training session using the template-based system."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            clue_id = data.get('clueId')
            if not clue_id:
                self._send_json({'success': False, 'error': 'Missing clueId'}, 400)
                return

            db = _load_db()
            item = db['training_items'].get(clue_id)
            if not item:
                self._send_json({'success': False, 'error': 'Clue not found'}, 404)
                return

            # Start session with new template handler
            render = training_handler.start_session(clue_id, item)
            self._send_json({'success': True, 'render': render})

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_training_input(self):
        """Handle user input (tap selection or text entry)."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            clue_id = data.get('clueId')
            value = data.get('value')

            if not clue_id:
                self._send_json({'success': False, 'error': 'Missing clueId'}, 400)
                return

            session = training_handler.get_session(clue_id)
            if not session:
                self._send_json({'success': False, 'error': 'No active session'}, 400)
                return

            db = _load_db()
            item = db['training_items'].get(clue_id)
            if not item:
                self._send_json({'success': False, 'error': 'Clue not found'}, 404)
                return

            result = training_handler.handle_input(clue_id, item, value)
            self._send_json({'success': True, **result})

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_training_continue(self):
        """Handle continue button press."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            clue_id = data.get('clueId')

            if not clue_id:
                self._send_json({'success': False, 'error': 'Missing clueId'}, 400)
                return

            session = training_handler.get_session(clue_id)
            if not session:
                self._send_json({'success': False, 'error': 'No active session'}, 400)
                return

            db = _load_db()
            item = db['training_items'].get(clue_id)
            if not item:
                self._send_json({'success': False, 'error': 'Clue not found'}, 404)
                return

            render = training_handler.handle_continue(clue_id, item)
            self._send_json({'success': True, 'render': render})

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'success': False, 'error': str(e)}, 500)

    # ==========================================================================
    # LEGACY TRAINING HANDLER (kept for backwards compatibility)
    # ==========================================================================

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

    def _update_parent_solved_if_all_subops_done(self, parent_wp):
        """Check if all subOperations of a parent are solved, and if so, mark parent as solved.

        This is needed because the all_solved check only looks at top-level wordplay states.
        When a subOperation is marked solved, we need to propagate that up to the parent
        if ALL subOperations are now complete.
        """
        if not parent_wp:
            return

        subops = parent_wp.get('subOperations', [])
        if not subops:
            return

        # Check if ALL subOperations are solved
        all_subops_solved = all(sub.get('state', {}).get('solved', False) for sub in subops)

        if all_subops_solved:
            # Mark parent as solved too
            if 'state' not in parent_wp:
                parent_wp['state'] = {}
            parent_wp['state']['solved'] = True
            parent_wp['state']['indicatorFound'] = True
            parent_wp['state']['fodderFound'] = True
            parent_wp['state']['resultEntered'] = True

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

        # Add render instructions (server tells UI exactly what to render)
        response['render'] = self._build_render_instructions(
            clue_entry, step, phase, is_subop, parent_wp,
            wordplays=wordplays,
            **extra
        )

        return response

    def _build_render_instructions(self, clue_entry, step, phase, is_subop=False, parent_wp=None, **context):
        """Build explicit render instructions for the UI.

        The UI should render EXACTLY what this returns - no phase/operation logic in UI.

        PRIORITY: If step has trainingScript, use it directly (metadata-driven).
        FALLBACK: Compute render instructions from phase/operation (legacy).
        """
        wordplays = context.get('wordplays', [])
        validation = context.get('validation')
        blocked = context.get('blocked', False)
        blocked_hint = context.get('blockedHint') or (step.get('blockedHint') if step else None)
        all_solved = context.get('allSolved', False)

        # === TEACHING PHASES: Use teaching content from context ===
        teaching = context.get('teaching')
        if teaching and phase.startswith('teaching_'):
            # Determine which action to call on continue
            if phase == 'teaching_indicator':
                pass_action = 'pass_indicator_teaching'
            elif phase == 'teaching_fodder':
                pass_action = 'pass_fodder_teaching'
            elif phase == 'teaching_result':
                pass_action = 'pass_result_teaching'
            else:
                pass_action = 'pass_teaching'

            return {
                'panel': 'teaching',
                'primaryText': teaching.get('primaryText', ''),
                'secondaryText': teaching.get('secondaryText'),
                'inputMode': 'none',
                'inputTarget': None,
                'showResultInput': False,
                'buttons': [{
                    'id': 'continue',
                    'label': 'Continue →',
                    'action': pass_action,
                    'variant': 'primary',
                    'requiresSelection': False,
                    'requiresInput': False
                }],
                'highlights': self._collect_highlights(wordplays, clue_entry),
                'stepLabel': 'CONGRATULATIONS',
                'stepProgress': '',
                'stepId': step.get('id', '') if step else '',
                'resultDisplay': step.get('result', '') if step else None,
                'blockedHint': blocked_hint
            }

        # === METADATA-DRIVEN: Use trainingScript if available ===
        training_script = step.get('trainingScript', []) if step else []
        if training_script and phase in ('indicator', 'fodder', 'result', 'teaching'):
            return self._build_render_from_script(
                clue_entry, step, phase, training_script, wordplays, blocked, blocked_hint, all_solved
            )

        # === LEGACY: Compute render instructions from phase + operation ===
        # Compute operation label
        op = step.get('operation', '') if step else ''
        op_labels = {
            'anagram': 'ANAGRAM',
            'discover_anagram': 'DISCOVER ANAGRAM',
            'letter_selection': 'LETTER SELECTION',
            'container': 'CONTAINER',
            'fodder_selection': 'FODDER SELECTION',
            'reversal': 'REVERSAL',
            'hidden': 'HIDDEN WORD',
            'deletion': 'DELETION',
            'solve_anagram': 'SOLVE ANAGRAM',
        }
        step_label = op_labels.get(op, op.upper().replace('_', ' '))

        # Compute progress (current step / total steps)
        total_steps = sum(
            len(wp.get('subOperations', [])) or 1 for wp in wordplays
        )
        solved_count = sum(
            1 for wp in wordplays
            for s in (wp.get('subOperations', []) or [wp])
            if s.get('state', {}).get('solved', False)
        )
        step_progress = f"{solved_count + 1}/{total_steps}" if step else f"{solved_count}/{total_steps}"

        # Compute panel type
        if all_solved:
            panel = 'complete'
        elif blocked:
            panel = 'blocked'
        elif phase == 'teaching':
            panel = 'teaching'
        elif phase in ('indicator', 'fodder', 'result'):
            panel = 'active'
        else:
            panel = 'active'

        # Compute instruction text based on phase + operation
        primary_text = ''
        secondary_text = None

        if phase == 'indicator':
            primary_text = f"Tap the {step_label.lower()} indicator in the clue"
            secondary_text = "Look for a word that signals how letters transform"
        elif phase == 'fodder':
            fodder = step.get('fodder', '') if step else ''
            if self._is_fodder_reference(fodder):
                primary_text = "Fodder comes from previous steps"
                secondary_text = None
            else:
                primary_text = "Now tap the fodder words in the clue"
                secondary_text = "The fodder is usually adjacent to the indicator"
        elif phase == 'result':
            primary_text = "Type the result of this wordplay step"
            secondary_text = "Apply the operation to the fodder"
        elif phase == 'teaching':
            primary_text = "🎓 Learning Point"
            secondary_text = blocked_hint
        elif phase == 'complete':
            primary_text = "Step complete!"
            secondary_text = None
        elif phase == 'blocked':
            primary_text = "This step is blocked"
            secondary_text = blocked_hint

        # Compute input mode
        if phase == 'indicator' or phase == 'fodder':
            input_mode = 'tap_words'
        elif phase == 'result':
            input_mode = 'enter_text'
        else:
            input_mode = 'none'

        # Compute buttons
        buttons = []
        if phase == 'indicator':
            buttons.append({
                'id': 'check',
                'label': 'Check',
                'action': 'check_indicator',
                'variant': 'primary',
                'requiresSelection': True
            })
        elif phase == 'fodder':
            buttons.append({
                'id': 'check',
                'label': 'Check',
                'action': 'check_fodder',
                'variant': 'primary',
                'requiresSelection': True
            })
        elif phase == 'result':
            buttons.append({
                'id': 'check',
                'label': 'Check',
                'action': 'check_result',
                'variant': 'primary',
                'requiresInput': True
            })
        elif phase == 'teaching':
            buttons.append({
                'id': 'continue',
                'label': 'Got it — Continue →',
                'action': 'pass_teaching',
                'variant': 'primary',
                'requiresSelection': False,
                'requiresInput': False
            })

        # Add skip button for multi-step clues
        if len(wordplays) > 1 and phase in ('indicator', 'fodder', 'result'):
            buttons.append({
                'id': 'skip',
                'label': 'Skip for now →',
                'action': 'skip_wordplay',
                'variant': 'secondary',
                'requiresSelection': False,
                'requiresInput': False
            })

        # Compute highlights (all confirmed indicators/fodder from all wordplays)
        highlights = []
        for wp in wordplays:
            wp_state = wp.get('state', {})
            # Add confirmed indicator highlights
            if wp_state.get('indicatorFound') and wp_state.get('indicatorIndices'):
                highlights.append({
                    'indices': wp_state['indicatorIndices'],
                    'color': 'ORANGE',
                    'role': 'indicator',
                    'confirmed': True
                })
            # Add confirmed fodder highlights
            if wp_state.get('fodderFound') and wp_state.get('fodderIndices'):
                highlights.append({
                    'indices': wp_state['fodderIndices'],
                    'color': 'BLUE',
                    'role': 'fodder',
                    'confirmed': True
                })
            # Check subOperations too
            for sub in wp.get('subOperations', []):
                sub_state = sub.get('state', {})
                if sub_state.get('indicatorFound') and sub_state.get('indicatorIndices'):
                    highlights.append({
                        'indices': sub_state['indicatorIndices'],
                        'color': 'ORANGE',
                        'role': 'indicator',
                        'confirmed': True
                    })
                if sub_state.get('fodderFound') and sub_state.get('fodderIndices'):
                    highlights.append({
                        'indices': sub_state['fodderIndices'],
                        'color': 'BLUE',
                        'role': 'fodder',
                        'confirmed': True
                    })

        # Add definition highlight
        clue_state = clue_entry.get('state', {})
        if clue_state.get('definitionFound') and clue_state.get('definitionIndices'):
            highlights.append({
                'indices': clue_state['definitionIndices'],
                'color': 'GREEN',
                'role': 'definition',
                'confirmed': True
            })

        # Result display (for teaching moment or complete phases)
        result_display = None
        if phase == 'teaching' and step:
            result_display = step.get('result', '')

        return {
            'panel': panel,
            'primaryText': primary_text,
            'secondaryText': secondary_text,
            'inputMode': input_mode,
            'inputTarget': phase if phase in ('indicator', 'fodder', 'result') else None,
            'showResultInput': phase == 'result',
            'buttons': buttons,
            'highlights': highlights,
            'stepLabel': step_label,
            'stepProgress': step_progress,
            'stepId': step.get('id', '') if step else '',
            'resultDisplay': result_display,
            'blockedHint': blocked_hint,
        }

    def _build_render_from_script(self, clue_entry, step, phase, training_script, wordplays, blocked, blocked_hint, all_solved):
        """Build render instructions from trainingScript metadata.

        This is the metadata-driven approach: the script contains everything needed.
        Server just looks up the current phase's step and returns its data.
        """
        # Find the script step matching current phase
        script_step = None
        for s in training_script:
            if s.get('phase') == phase:
                script_step = s
                break

        # Compute progress
        total_steps = sum(len(wp.get('subOperations', [])) or 1 for wp in wordplays)
        solved_count = sum(
            1 for wp in wordplays
            for s in (wp.get('subOperations', []) or [wp])
            if s.get('state', {}).get('solved', False)
        )
        step_progress = f"{solved_count + 1}/{total_steps}" if step else f"{solved_count}/{total_steps}"

        # Compute step label from operation
        op = step.get('operation', '') if step else ''
        op_labels = {
            'anagram': 'ANAGRAM',
            'discover_anagram': 'DISCOVER ANAGRAM',
            'letter_selection': 'LETTER SELECTION',
            'container': 'CONTAINER',
            'fodder_selection': 'FODDER SELECTION',
            'reversal': 'REVERSAL',
            'hidden': 'HIDDEN WORD',
            'deletion': 'DELETION',
            'solve_anagram': 'SOLVE ANAGRAM',
        }
        step_label = op_labels.get(op, op.upper().replace('_', ' '))

        # If no matching script step, fall back to defaults
        if not script_step:
            return {
                'panel': 'complete' if all_solved else 'blocked' if blocked else 'active',
                'primaryText': 'Step complete' if all_solved else (blocked_hint or 'This step is blocked'),
                'secondaryText': None,
                'inputMode': 'none',
                'inputTarget': None,
                'showResultInput': False,
                'buttons': [],
                'highlights': self._collect_highlights(wordplays, clue_entry),
                'stepLabel': step_label,
                'stepProgress': step_progress,
                'resultDisplay': None,
                'blockedHint': blocked_hint,
            }

        # Build render from script step
        panel = script_step.get('panel', 'active')
        if all_solved:
            panel = 'complete'
        elif blocked:
            panel = 'blocked'

        # Compute buttons from script
        buttons = []
        if script_step.get('button'):
            btn = script_step['button']
            buttons.append({
                'id': btn.get('action', 'continue'),
                'label': btn.get('label', 'Continue'),
                'action': btn.get('action', 'continue'),
                'variant': 'primary',
                'requiresSelection': False,
                'requiresInput': False,
            })
        elif phase == 'indicator':
            buttons.append({
                'id': 'check',
                'label': 'Check',
                'action': 'check_indicator',
                'variant': 'primary',
                'requiresSelection': True
            })
        elif phase == 'fodder':
            buttons.append({
                'id': 'check',
                'label': 'Check',
                'action': 'check_fodder',
                'variant': 'primary',
                'requiresSelection': True
            })
        elif phase == 'result':
            buttons.append({
                'id': 'check',
                'label': 'Check',
                'action': 'check_result',
                'variant': 'primary',
                'requiresInput': True
            })

        # Add skip button for multi-step clues
        if len(wordplays) > 1 and phase in ('indicator', 'fodder', 'result'):
            buttons.append({
                'id': 'skip',
                'label': 'Skip for now →',
                'action': 'skip_wordplay',
                'variant': 'secondary',
                'requiresSelection': False,
                'requiresInput': False
            })

        return {
            'panel': panel,
            'primaryText': script_step.get('instruction', ''),
            'secondaryText': script_step.get('hint'),
            'inputMode': script_step.get('inputMode', 'none'),
            'inputTarget': phase if phase in ('indicator', 'fodder', 'result') else None,
            'showResultInput': phase == 'result',
            'buttons': buttons,
            'highlights': self._collect_highlights(wordplays, clue_entry),
            'stepLabel': step_label,
            'stepProgress': step_progress,
            'stepId': step.get('id', '') if step else '',
            'resultDisplay': script_step.get('resultDisplay'),
            'blockedHint': script_step.get('blockedHint') or blocked_hint,
        }

    def _collect_highlights(self, wordplays, clue_entry):
        """Collect all confirmed highlights from wordplays and definition."""
        highlights = []
        for wp in wordplays:
            wp_state = wp.get('state', {})
            if wp_state.get('indicatorFound') and wp_state.get('indicatorIndices'):
                highlights.append({
                    'indices': wp_state['indicatorIndices'],
                    'color': 'ORANGE',
                    'role': 'indicator',
                    'confirmed': True
                })
            if wp_state.get('fodderFound') and wp_state.get('fodderIndices'):
                highlights.append({
                    'indices': wp_state['fodderIndices'],
                    'color': 'BLUE',
                    'role': 'fodder',
                    'confirmed': True
                })
            for sub in wp.get('subOperations', []):
                sub_state = sub.get('state', {})
                if sub_state.get('indicatorFound') and sub_state.get('indicatorIndices'):
                    highlights.append({
                        'indices': sub_state['indicatorIndices'],
                        'color': 'ORANGE',
                        'role': 'indicator',
                        'confirmed': True
                    })
                if sub_state.get('fodderFound') and sub_state.get('fodderIndices'):
                    highlights.append({
                        'indices': sub_state['fodderIndices'],
                        'color': 'BLUE',
                        'role': 'fodder',
                        'confirmed': True
                    })

        clue_state = clue_entry.get('state', {})
        if clue_state.get('definitionFound') and clue_state.get('definitionIndices'):
            highlights.append({
                'indices': clue_state['definitionIndices'],
                'color': 'GREEN',
                'role': 'definition',
                'confirmed': True
            })

        return highlights

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
    NO_RESULT_OPERATIONS = {'fodder_selection', 'discover_anagram'}

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
        indicator = wp.get('indicator', '')

        # If no indicator defined, skip indicator phase
        if indicator and not state.get('indicatorFound', False):
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

                    # Build teaching moment
                    clue_type = clue_entry.get('clueType', {}).get('id', 'standard')
                    general = DEFINITION_TEACHING.get(clue_type, '')
                    specific = f"Here you found '{definition.get('text', '')}' at the {definition.get('position', '')}."

                    self._send_json({
                        'success': True,
                        'validation': {'correct': True, 'expected': expected},
                        'clueEntry': clue_entry,
                        'currentPhase': 'teaching_definition',
                        'render': {
                            'panel': 'teaching',
                            'primaryText': f"{general} {specific}",
                            'secondaryText': None,
                            'inputMode': 'none',
                            'inputTarget': None,
                            'showResultInput': False,
                            'buttons': [{
                                'id': 'continue',
                                'label': 'Continue →',
                                'action': 'pass_definition_teaching',
                                'variant': 'primary',
                                'requiresSelection': False,
                                'requiresInput': False
                            }],
                            'highlights': self._collect_highlights(wordplays, clue_entry),
                            'stepLabel': 'CONGRATULATIONS',
                            'stepProgress': ''
                        }
                    })
                    return

                # Wrong answer - no teaching
                self._send_json({
                    'success': True,
                    'validation': {'correct': False, 'expected': expected},
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

                    # Build teaching moment for indicator
                    operation = wp.get('operation', '')
                    general = WORDPLAY_TEACHING.get(operation, '')
                    indicator = wp.get('indicator', '')
                    specific = f"Here you found '{indicator}' which signals this wordplay technique."

                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, wp, 'teaching_indicator', is_subop, parent_wp,
                        validation={'correct': True, 'expected': expected},
                        teaching={
                            'primaryText': f"{general} {specific}",
                            'secondaryText': None
                        }
                    ))
                    return

                # Wrong answer - stay on indicator phase
                self._send_json(self._build_training_response(
                    clue_entry, wordplays, wp, 'indicator', is_subop, parent_wp,
                    validation={'correct': False, 'expected': expected}
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
                    # For NO_RESULT_OPERATIONS, completing fodder = solved
                    if wp.get('operation', '') in self.NO_RESULT_OPERATIONS:
                        wp['state']['resultEntered'] = True
                        wp['state']['solved'] = True
                        if is_subop and parent_wp:
                            self._update_parent_solved_if_all_subops_done(parent_wp)

                    # Build teaching moment for fodder
                    indicator = wp.get('indicator', '')
                    specific = f"Here you found '{fodder}' next to the indicator '{indicator}'."

                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, wp, 'teaching_fodder', is_subop, parent_wp,
                        validation={'correct': True, 'expected': expected},
                        teaching={
                            'primaryText': f"The fodder is always adjacent to the indicator. {specific}",
                            'secondaryText': None
                        }
                    ))
                    return

                # Wrong answer - stay on fodder phase
                self._send_json(self._build_training_response(
                    clue_entry, wordplays, wp, 'fodder', is_subop, parent_wp,
                    validation={'correct': False, 'expected': expected}
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
                    if is_subop and parent_wp:
                        self._update_parent_solved_if_all_subops_done(parent_wp)

                    # Build teaching moment for result
                    operation = wp.get('operation', '')
                    fodder_val = wp.get('fodder', '')
                    fodder_display = fodder_val if isinstance(fodder_val, str) else '[combined letters]'
                    result = wp.get('result', '')
                    specific = f"You correctly worked out that '{fodder_display}' gives '{result}'."

                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, wp, 'teaching_result', is_subop, parent_wp,
                        validation={'correct': True, 'expected': expected},
                        teaching={
                            'primaryText': specific,
                            'secondaryText': None
                        }
                    ))
                    return

                # Wrong answer - stay on result phase
                self._send_json(self._build_training_response(
                    clue_entry, wordplays, wp, 'result', is_subop, parent_wp,
                    validation={'correct': False, 'expected': expected}
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

            elif action == 'pass_definition_teaching':
                # Advance from definition teaching to first wordplay
                (next_step, next_parent, next_is_subop) = self._get_next_available_wordplay(wordplays)
                if next_step:
                    next_phase = self._get_wordplay_phase(next_step)
                else:
                    all_solved = all(w.get('state', {}).get('solved', False) for w in wordplays)
                    next_phase = 'complete' if all_solved else 'blocked'

                self._send_json(self._build_training_response(
                    clue_entry, wordplays, next_step, next_phase, next_is_subop, next_parent
                ))

            elif action == 'pass_indicator_teaching':
                # Advance from indicator teaching to fodder phase
                wordplay_id = action_data.get('wordplayId')
                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                self._send_json(self._build_training_response(
                    clue_entry, wordplays, wp, 'fodder', is_subop, parent_wp
                ))

            elif action == 'pass_fodder_teaching':
                # Advance from fodder teaching to result phase (or next wordplay for no-result ops)
                wordplay_id = action_data.get('wordplayId')
                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                # Check if this operation requires result entry
                if wp.get('operation', '') in self.NO_RESULT_OPERATIONS:
                    # No result needed - check for blocked teaching or advance to next wordplay
                    if wp.get('blockedHint'):
                        # Show existing teaching phase (blockedHint teaching)
                        self._send_json(self._build_training_response(
                            clue_entry, wordplays, wp, 'teaching', is_subop, parent_wp
                        ))
                    else:
                        # Advance to next wordplay
                        (next_step, next_parent, next_is_subop) = self._get_next_available_wordplay(wordplays)
                        if next_step:
                            next_phase = self._get_wordplay_phase(next_step)
                        else:
                            all_solved = all(w.get('state', {}).get('solved', False) for w in wordplays)
                            next_phase = 'complete' if all_solved else 'blocked'
                        self._send_json(self._build_training_response(
                            clue_entry, wordplays, next_step, next_phase, next_is_subop, next_parent
                        ))
                else:
                    # Advance to result phase
                    self._send_json(self._build_training_response(
                        clue_entry, wordplays, wp, 'result', is_subop, parent_wp
                    ))

            elif action == 'pass_result_teaching':
                # Advance from result teaching to next wordplay
                wordplay_id = action_data.get('wordplayId')
                (wp, parent_wp, is_subop) = self._find_wordplay_by_id(wordplays, wordplay_id)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                (next_step, next_parent, next_is_subop) = self._get_next_available_wordplay(wordplays)
                all_solved = all(w.get('state', {}).get('solved', False) for w in wordplays)
                next_phase = self._get_wordplay_phase(next_step) if next_step else ('complete' if all_solved else 'blocked')

                # Clean up session when all solved
                if all_solved and clue_id in _training_sessions:
                    del _training_sessions[clue_id]

                self._send_json(self._build_training_response(
                    clue_entry, wordplays, next_step, next_phase, next_is_subop, next_parent,
                    allSolved=all_solved
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
