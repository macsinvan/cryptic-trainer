#!/usr/bin/env python3
"""
Injects CLAUDE_RULES.md into every prompt.
This ensures Claude always sees the interactive protocol rules.
"""
import json
import sys
import os

def main():
    # Get project directory from environment
    project_dir = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
    rules_file = os.path.join(project_dir, 'CLAUDE_RULES.md')

    # Read the rules file
    rules_content = ""
    if os.path.exists(rules_file):
        with open(rules_file, 'r') as f:
            rules_content = f.read()
    else:
        rules_content = "WARNING: CLAUDE_RULES.md not found."

    # Build context to inject
    context = f"""
<MANDATORY_RULES>
{rules_content}
</MANDATORY_RULES>
"""

    # Output as JSON for Claude Code to consume
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
