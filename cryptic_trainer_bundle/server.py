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
        elif self.path == '/clues/bulk':
            self._handle_bulk_import()
        elif self.path == '/clues/clear':
            self._handle_clear()
        elif self.path == '/parser-issues':
            self._handle_save_parser_issue()
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

    def log_message(self, format, *args):
        print(f"[solver] {args[0]}")

if __name__ == '__main__':
    port = 5001
    server = HTTPServer(('localhost', port), SolverHandler)
    print(f"Cryptic Trainer Solver running on http://localhost:{port}/solve")
    print("Press Ctrl+C to stop")
    server.serve_forever()
