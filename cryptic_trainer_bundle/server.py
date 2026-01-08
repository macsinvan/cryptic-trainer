#!/usr/bin/env python3
"""
Simple HTTP server wrapper for the cryptic trainer solver.
Run with: python3 server.py
Listens on http://localhost:5001/solve
"""

import json
import os
import re
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure we import from the same directory as this script, not cwd
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)

from cryptic_trainer import solve

class SolverHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path != '/solve':
            self.send_error(404)
            return

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

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))

        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

    def log_message(self, format, *args):
        print(f"[solver] {args[0]}")

if __name__ == '__main__':
    port = 5001
    server = HTTPServer(('localhost', port), SolverHandler)
    print(f"Cryptic Trainer Solver running on http://localhost:{port}/solve")
    print("Press Ctrl+C to stop")
    server.serve_forever()
