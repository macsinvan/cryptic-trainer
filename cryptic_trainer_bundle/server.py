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

import json
import os
import re
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure we import from the same directory as this script, not cwd
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)

from cryptic_trainer import solve

# --- Clue Storage ---
DB_FILE = os.path.join(_script_dir, 'clues_db.json')
_db_lock = threading.Lock()

def _load_db():
    """Load the clue database from JSON file."""
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {"version": 1, "training_items": {}, "parser_issues": {}}

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
                import time
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
        """Check if a wordplay's dependencies are all solved."""
        deps = wordplay.get('dependencies', [])
        if not deps:
            return False
        for dep_id in deps:
            # Find the dependency wordplay
            dep = next((wp for wp in all_wordplays if wp.get('id') == dep_id), None)
            if dep and not dep.get('state', {}).get('solved', False):
                return True
        return False

    def _get_next_available_wordplay(self, wordplays):
        """Find the first unblocked, unsolved wordplay."""
        for wp in wordplays:
            if wp.get('state', {}).get('solved', False):
                continue  # Already solved
            if not self._is_wordplay_blocked(wp, wordplays):
                return wp
        return None

    def _handle_training_action(self):
        """
        Handle training actions. Server decides what's available.

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

            clue_entry = item.get('clueEntry', {})
            wordplays = clue_entry.get('wordplays', [])

            # Handle different actions
            if action == 'get_state' or action == 'start':
                # Find next available wordplay
                current_wp = self._get_next_available_wordplay(wordplays)

                if not current_wp:
                    # All done or all blocked
                    all_solved = all(wp.get('state', {}).get('solved', False) for wp in wordplays)
                    self._send_json({
                        'success': True,
                        'clueEntry': clue_entry,
                        'currentWordplay': None,
                        'currentPhase': 'complete' if all_solved else 'blocked',
                        'allSolved': all_solved
                    })
                    return

                # Determine phase based on state
                state = current_wp.get('state', {})
                if not state.get('indicatorFound', False):
                    phase = 'indicator'
                elif not state.get('fodderFound', False):
                    phase = 'fodder'
                else:
                    phase = 'result'

                self._send_json({
                    'success': True,
                    'clueEntry': clue_entry,
                    'currentWordplay': current_wp,
                    'currentWordplayIndex': wordplays.index(current_wp),
                    'currentPhase': phase,
                    'blocked': False
                })

            elif action == 'check_indicator':
                wordplay_id = action_data.get('wordplayId')
                selected = action_data.get('selected', '')

                wp = next((w for w in wordplays if w.get('id') == wordplay_id), None)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                expected = wp.get('indicator', '').lower().strip()
                selected_norm = selected.lower().strip()
                correct = selected_norm == expected

                if correct:
                    wp['state']['indicatorFound'] = True
                    _save_db(db)

                # Get next phase
                next_wp = self._get_next_available_wordplay(wordplays)
                next_phase = 'fodder' if correct else 'indicator'

                self._send_json({
                    'success': True,
                    'validation': {'correct': correct, 'expected': expected},
                    'clueEntry': clue_entry,
                    'currentWordplay': next_wp,
                    'currentWordplayIndex': wordplays.index(next_wp) if next_wp else -1,
                    'currentPhase': next_phase
                })

            elif action == 'check_fodder':
                wordplay_id = action_data.get('wordplayId')
                selected = action_data.get('selected', '')

                wp = next((w for w in wordplays if w.get('id') == wordplay_id), None)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                fodder = wp.get('fodder', '')
                expected = fodder.lower().strip() if isinstance(fodder, str) else ''
                selected_norm = selected.lower().strip()
                correct = selected_norm == expected

                if correct:
                    wp['state']['fodderFound'] = True
                    _save_db(db)

                next_wp = self._get_next_available_wordplay(wordplays)
                next_phase = 'result' if correct else 'fodder'

                self._send_json({
                    'success': True,
                    'validation': {'correct': correct, 'expected': expected},
                    'clueEntry': clue_entry,
                    'currentWordplay': next_wp,
                    'currentWordplayIndex': wordplays.index(next_wp) if next_wp else -1,
                    'currentPhase': next_phase
                })

            elif action == 'check_result':
                wordplay_id = action_data.get('wordplayId')
                entered = action_data.get('entered', '')

                wp = next((w for w in wordplays if w.get('id') == wordplay_id), None)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                expected = wp.get('result', '').upper().strip()
                entered_norm = entered.upper().strip()
                correct = entered_norm == expected

                if correct:
                    wp['state']['resultEntered'] = True
                    wp['state']['solved'] = True
                    _save_db(db)

                # After solving, find next available
                next_wp = self._get_next_available_wordplay(wordplays)
                all_solved = all(w.get('state', {}).get('solved', False) for w in wordplays)

                if next_wp:
                    state = next_wp.get('state', {})
                    if not state.get('indicatorFound', False):
                        next_phase = 'indicator'
                    elif not state.get('fodderFound', False):
                        next_phase = 'fodder'
                    else:
                        next_phase = 'result'
                else:
                    next_phase = 'complete' if all_solved else 'blocked'

                self._send_json({
                    'success': True,
                    'validation': {'correct': correct, 'expected': expected},
                    'clueEntry': clue_entry,
                    'currentWordplay': next_wp,
                    'currentWordplayIndex': wordplays.index(next_wp) if next_wp else -1,
                    'currentPhase': next_phase,
                    'allSolved': all_solved
                })

            elif action == 'select_wordplay':
                # User wants to work on a specific wordplay
                wordplay_id = action_data.get('wordplayId')

                wp = next((w for w in wordplays if w.get('id') == wordplay_id), None)
                if not wp:
                    self._send_json({'success': False, 'error': 'Wordplay not found'}, 404)
                    return

                blocked = self._is_wordplay_blocked(wp, wordplays)

                if blocked:
                    # Find unblocked alternative
                    alt_wp = self._get_next_available_wordplay(wordplays)
                    self._send_json({
                        'success': True,
                        'clueEntry': clue_entry,
                        'currentWordplay': alt_wp,
                        'currentWordplayIndex': wordplays.index(alt_wp) if alt_wp else -1,
                        'requestedWordplay': wp,
                        'blocked': True,
                        'blockedHint': wp.get('blockedHint', 'Solve dependencies first'),
                        'currentPhase': 'indicator' if alt_wp else 'blocked'
                    })
                else:
                    state = wp.get('state', {})
                    if not state.get('indicatorFound', False):
                        phase = 'indicator'
                    elif not state.get('fodderFound', False):
                        phase = 'fodder'
                    else:
                        phase = 'result'

                    self._send_json({
                        'success': True,
                        'clueEntry': clue_entry,
                        'currentWordplay': wp,
                        'currentWordplayIndex': wordplays.index(wp),
                        'currentPhase': phase,
                        'blocked': False
                    })

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
