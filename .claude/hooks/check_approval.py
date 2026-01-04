#!/usr/bin/env python3
"""
Detects user approval in messages and creates single-use approval token.
Part of the two-phase commit system to enforce protocol compliance.
"""
import json
import sys
import os
import time

def main():
    # Read input from Claude Code
    input_data = json.load(sys.stdin)

    # Get the user's message
    user_message = input_data.get('user_message', '').lower().strip()

    # Get project directory
    project_dir = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
    claude_dir = os.path.join(project_dir, '.claude')
    token_file = os.path.join(claude_dir, 'approval_granted')
    proposal_file = os.path.join(claude_dir, 'pending_proposal.md')

    # Check if user message contains approval
    approval_phrases = ['approved', 'approve', 'yes, approved', 'go ahead', 'proceed']
    is_approval = any(phrase in user_message for phrase in approval_phrases)

    # If approved and proposal exists, create token
    if is_approval and os.path.exists(proposal_file):
        # Read proposal to get approved file
        with open(proposal_file, 'r') as f:
            proposal_content = f.read()

        # Create approval token
        token_data = {
            'timestamp': time.time(),
            'expires': time.time() + 300,  # 5 minute expiry
            'proposal': proposal_content[:500],  # First 500 chars for reference
            'used': False
        }

        with open(token_file, 'w') as f:
            json.dump(token_data, f, indent=2)

        # Clear the proposal (it's now approved)
        os.remove(proposal_file)

        # Add context to inform Claude
        output = {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": "\n[SYSTEM: Approval token created. You may now proceed with the approved edit.]\n"
            }
        }
    else:
        # No approval - inject standard rules reminder
        rules_file = os.path.join(project_dir, 'CLAUDE_RULES.md')
        rules_content = ""
        if os.path.exists(rules_file):
            with open(rules_file, 'r') as f:
                rules_content = f.read()

        context = f"""
<MANDATORY_RULES>
{rules_content}
</MANDATORY_RULES>

REMINDER: You MUST write a proposal to .claude/pending_proposal.md and ask for approval before ANY edit.
"""
        output = {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": context
            }
        }

    print(json.dumps(output))
    sys.exit(0)

if __name__ == "__main__":
    main()
