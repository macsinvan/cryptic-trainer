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

# --- User Authentication ---
USERS = {
    "andrew": {"password": "cryptic", "role": "admin"}
}

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
    return {"version": 2, "training_items": {}, "parser_issues": {}, "settings": {"letterChecking": True}}

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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS')
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
        elif self.path == '/import-logs':
            self._handle_get_import_logs()
        elif self.path == '/settings':
            self._handle_get_settings()
        else:
            self.send_error(404)

    def do_PATCH(self):
        """Handle PATCH requests."""
        path = self.path.split('?')[0]

        # PATCH /clues/<id>/admin - Update admin fields (verified, reported_issue)
        if path.startswith('/clues/') and path.endswith('/admin'):
            clue_id = path[7:-6]  # Remove '/clues/' prefix and '/admin' suffix
            self._handle_update_clue_admin(clue_id)
        else:
            self.send_error(404)

    def do_DELETE(self):
        """Handle DELETE requests."""
        # Parse path and query string
        parsed = self.path.split('?')
        path = parsed[0]
        query = parsed[1] if len(parsed) > 1 else ''

        if path.startswith('/clues/'):
            clue_id = path[7:]  # Remove '/clues/' prefix
            db = _load_db()
            items = db.get('training_items', {})
            if clue_id in items:
                del items[clue_id]
                _save_db(db)
                self._send_json({'success': True})
            else:
                self._send_json({'success': False, 'error': 'Not found'}, 404)
        elif path == '/import-logs' and query == 'clearAll=true':
            self._handle_clear_import_logs()
        elif path.startswith('/import-logs/'):
            log_id = path[13:]  # Remove '/import-logs/' prefix
            self._handle_delete_import_log(log_id)
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
        elif self.path == '/training/clear':
            self._handle_training_clear()
        elif self.path == '/training/learnings':
            self._handle_training_learnings()
        elif self.path == '/settings':
            self._handle_save_settings()
        elif self.path == '/auth/login':
            self._handle_login()
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
        Validate a ClueEntry against the step-based schema.
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

        # Validate words array
        words = clue_entry.get('words')
        if not words:
            errors.append('Missing words array')
        elif not isinstance(words, list):
            errors.append('words must be an array')
        elif len(words) == 0:
            errors.append('words array cannot be empty')

        # Validate steps array
        steps = clue_entry.get('steps')
        if not steps:
            errors.append('Missing steps array')
        elif not isinstance(steps, list):
            errors.append('steps must be an array')
        elif len(steps) == 0:
            errors.append('steps array cannot be empty')
        else:
            # Get available templates from training_handler
            available_templates = list(training_handler.STEP_TEMPLATES.keys())

            for i, step in enumerate(steps):
                step_prefix = f'steps[{i}]'

                # Check step has a type
                step_type = step.get('type')
                if not step_type:
                    errors.append(f'{step_prefix}.type is required')
                elif step_type not in available_templates:
                    errors.append(
                        f'{step_prefix} has type "{step_type}" but no template exists. '
                        f'Available: {", ".join(available_templates)}'
                    )

        return errors

    def _handle_import_puzzle(self):
        """
        Import a puzzle file using the V2 step-based schema.

        Supports two formats:
        1. Flat format (V2): {"clue-id-1": {...}, "clue-id-2": {...}}
        2. Wrapped format: {"metadata": {...}, "clues": {...}}

        - Validates each clue against the step-based schema
        - Skips invalid clues (logs actionable errors)
        - Skips duplicates (by clue ID)
        - Stores valid clues in flat format

        Schema: See DESIGN_SPEC.md for complete step-based schema.
        """
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            puzzle_data = data.get('puzzle')
            publication_id = data.get('publicationId', 'times')

            # Validate JSON integrity
            if not puzzle_data:
                self._send_json({'success': False, 'error': 'Missing puzzle data'}, 400)
                return

            # Detect format: flat (V2) vs wrapped
            # V2 flat format: keys are clue IDs like "times-29439-1a"
            # Wrapped format: has "metadata" and "clues" keys
            if 'metadata' in puzzle_data and 'clues' in puzzle_data:
                # Wrapped format
                metadata = puzzle_data.get('metadata', {})
                clues_dict = puzzle_data['clues']
            else:
                # V2 flat format - puzzle_data IS the clues dict
                metadata = {}
                clues_dict = puzzle_data
                # Try to extract metadata from first clue's ID
                if clues_dict:
                    first_key = next(iter(clues_dict.keys()))
                    parts = first_key.split('-')
                    if len(parts) >= 2:
                        metadata['publisher'] = parts[0].title()
                        metadata['puzzle_number'] = parts[1]

            db = _load_db()
            saved = 0
            skipped = 0
            failed = 0
            errors = []

            # Process each clue
            for clue_key, clue_entry in clues_dict.items():
                # Validate against step-based schema
                validation_errors = self._validate_clue_entry(clue_key, clue_entry)

                if validation_errors:
                    failed += 1
                    errors.append({
                        'clueId': clue_key,
                        'clueNumber': clue_entry.get('clue', {}).get('number', '?'),
                        'clueText': clue_entry.get('clue', {}).get('text', '(no text)'),
                        'errors': validation_errors
                    })
                    continue

                # Check for duplicates by ID
                if clue_key in db['training_items']:
                    skipped += 1
                    continue

                # Store in flat format
                training_item = {
                    'id': clue_key,
                    'clue': clue_entry['clue'],
                    'words': clue_entry['words'],
                    'steps': clue_entry['steps'],
                    'metadata': metadata,
                    'publicationId': publication_id
                }

                # Copy optional fields if present
                if 'difficulty' in clue_entry:
                    training_item['difficulty'] = clue_entry['difficulty']

                db['training_items'][clue_key] = training_item
                saved += 1

            # Create import log entry
            import_id = f"{int(time.time())}-{metadata.get('puzzle_number', 'unknown')}"
            import_log = {
                'id': import_id,
                'timestamp': int(time.time()),
                'publicationId': publication_id,
                'puzzleFile': metadata.get('file', 'unknown'),
                'puzzleNumber': metadata.get('puzzle_number', 'unknown'),
                'summary': {
                    'saved': saved,
                    'skipped': skipped,
                    'failed': failed
                },
                'errors': errors
            }

            # Initialize import_logs if needed
            if 'import_logs' not in db:
                db['import_logs'] = {}

            db['import_logs'][import_id] = import_log
            _save_db(db)

            # Return response with counts and errors
            self._send_json({
                'success': True,  # Import always succeeds (invalid clues are skipped)
                'saved': saved,
                'skipped': skipped,
                'failed': failed,
                'errors': errors,
                'importLogId': import_id
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

    def _handle_get_import_logs(self):
        """Get all import logs, sorted by timestamp descending."""
        db = _load_db()
        logs = list(db.get('import_logs', {}).values())
        # Sort by timestamp descending (most recent first)
        logs.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        self._send_json({'logs': logs})

    def _handle_delete_import_log(self, log_id):
        """Delete a single import log entry."""
        db = _load_db()
        if log_id not in db.get('import_logs', {}):
            self._send_json({'success': False, 'error': 'Log not found'}, 404)
            return
        del db['import_logs'][log_id]
        _save_db(db)
        self._send_json({'success': True})

    def _handle_clear_import_logs(self):
        """Clear all import logs."""
        db = _load_db()
        db['import_logs'] = {}
        _save_db(db)
        self._send_json({'success': True})

    def _handle_get_settings(self):
        """Get current settings."""
        db = _load_db()
        settings = db.get('settings', {'letterChecking': True})
        self._send_json(settings)

    def _handle_save_settings(self):
        """Save settings."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            new_settings = json.loads(body)

            db = _load_db()
            if 'settings' not in db:
                db['settings'] = {'letterChecking': True}
            db['settings'].update(new_settings)
            _save_db(db)

            self._send_json({'success': True, 'settings': db['settings']})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_login(self):
        """Handle user login."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            username = data.get('username', '').strip().lower()
            password = data.get('password', '')

            user = USERS.get(username)
            if user and user['password'] == password:
                self._send_json({
                    'success': True,
                    'user': {'username': username, 'role': user['role']}
                })
            else:
                self._send_json({'success': False, 'error': 'Invalid credentials'}, 401)
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_update_clue_admin(self, clue_id):
        """Update admin fields (verified, reported_issue) on a clue."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            db = _load_db()
            if clue_id not in db.get('training_items', {}):
                self._send_json({'success': False, 'error': 'Clue not found'}, 404)
                return

            item = db['training_items'][clue_id]

            # Update admin fields
            if 'verified' in data:
                item['verified'] = bool(data['verified'])
            if 'reported_issue' in data:
                item['reported_issue'] = data['reported_issue'] if data['reported_issue'] else None

            db['training_items'][clue_id] = item
            _save_db(db)

            self._send_json({
                'success': True,
                'verified': item.get('verified', False),
                'reported_issue': item.get('reported_issue')
            })
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

    def _handle_training_clear(self):
        """Clear training session (e.g., on exit). Allows fresh start next time."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            clue_id = data.get('clueId')

            if not clue_id:
                self._send_json({'success': False, 'error': 'Missing clueId'}, 400)
                return

            cleared = training_handler.clear_session(clue_id)
            self._send_json({'success': True, 'cleared': cleared})

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'success': False, 'error': str(e)}, 500)

    def _handle_training_learnings(self):
        """Get all learnings for a clue (for early solve)."""
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

            learnings = training_handler.get_all_learnings(item)
            self._send_json({'success': True, 'learnings': learnings})

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'success': False, 'error': str(e)}, 500)

    def log_message(self, format, *args):
        print(f"[solver] {args[0]}")

if __name__ == '__main__':
    port = 5001
    server = HTTPServer(('0.0.0.0', port), SolverHandler)
    print(f"Cryptic Trainer Solver running on http://0.0.0.0:{port}/solve")
    print("Access from local network via your machine's IP address")
    print("Press Ctrl+C to stop")
    server.serve_forever()
