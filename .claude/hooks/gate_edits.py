#!/usr/bin/env python3
"""
Gates all Edit/Write operations with HARD BLOCK.
Requires valid approval token from two-phase commit system.
No token = No edit. No exceptions.
"""
import json
import sys
import os
import time

def main():
    # Read input from Claude Code
    input_data = json.load(sys.stdin)

    tool_name = input_data.get('tool_name', '')
    tool_input = input_data.get('tool_input', {})

    # Get file path being modified
    file_path = tool_input.get('file_path', 'unknown')

    # Get project directory
    project_dir = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
    claude_dir = os.path.join(project_dir, '.claude')
    token_file = os.path.join(claude_dir, 'approval_granted')
    proposal_file = os.path.join(claude_dir, 'pending_proposal.md')

    # Check if valid approval token exists
    token_valid = False
    block_reason = ""

    if os.path.exists(token_file):
        try:
            with open(token_file, 'r') as f:
                token_data = json.load(f)

            # Check expiry
            if time.time() > token_data.get('expires', 0):
                block_reason = "Approval token expired. Please get fresh approval."
                os.remove(token_file)  # Clean up expired token
            elif token_data.get('used', False):
                block_reason = "Approval token already used. Each edit needs fresh approval."
                os.remove(token_file)  # Clean up used token
            else:
                token_valid = True
        except (json.JSONDecodeError, IOError):
            block_reason = "Approval token corrupted. Please get fresh approval."
            if os.path.exists(token_file):
                os.remove(token_file)
    else:
        # Check if there's a pending proposal
        if os.path.exists(proposal_file):
            block_reason = "Proposal exists but not yet approved. Wait for user to say 'approved'."
        else:
            block_reason = "No approval token. You must: 1) Write proposal to .claude/pending_proposal.md, 2) Ask user for approval, 3) Wait for 'approved'."

    if token_valid:
        # Mark token as used BEFORE allowing edit
        with open(token_file, 'r') as f:
            token_data = json.load(f)
        token_data['used'] = True
        token_data['used_for'] = file_path
        with open(token_file, 'w') as f:
            json.dump(token_data, f, indent=2)

        # Allow the edit
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "decision": {
                    "behavior": "allow"
                }
            }
        }
    else:
        # HARD BLOCK - no exceptions
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "decision": {
                    "behavior": "block",
                    "message": f"BLOCKED: {block_reason}\n\nFile: {file_path}\n\nTwo-phase commit required. No exceptions."
                }
            }
        }

    print(json.dumps(output))
    sys.exit(0)

if __name__ == "__main__":
    main()
