"""
Training Handler - Template-based step system

Each step type has a predefined template (90% generic).
Clue data provides only specific values (10%).
"""

import re

# =============================================================================
# STEP TEMPLATES
# =============================================================================

STEP_TEMPLATES = {
    "standard_definition": {
        "phases": [
            {
                "id": "select",
                "intro": {
                    "title": "Standard",
                    "text": "Do you see a definition at the start or end, with wordplay indicators in the rest?",
                    "example": '"Crazy golf equipment (7)" → PUTTERS (anagram of "putters")'
                },
                "panel": {
                    "title": "FIND DEFINITION",
                    "instruction": "Tap the definition words above. It's always at the **start** or **end** of the clue."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "GREEN", "role": "definition"}},
                "onWrong": {"message": "Not quite - look at the start or end"}
            },
            {
                "id": "teaching",
                "panel": {
                    "title": "Definition Found",
                    "instruction": "The definition is always at the start or end — never buried in the middle. Here you found '{result}' at the {position}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "anagram_find": {
        "phases": [
            {
                "id": "indicator",
                "intro": {
                    "title": "Anagram",
                    "text": "An anagram indicator signals that letters need rearranging.",
                    "example": '"crazy", "wild", "broken", "mixed" all suggest anagrams'
                },
                "panel": {
                    "title": "FIND INDICATOR",
                    "instruction": "Tap the anagram indicator - a word suggesting disorder or change."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
                "onWrong": {"message": "Look for a word suggesting rearrangement"}
            },
            {
                "id": "fodder",
                "panel": {
                    "title": "FIND FODDER",
                    "instruction": "Tap the fodder - the letters to be rearranged. It's adjacent to the indicator."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Look for words adjacent to the indicator"}
            },
            {
                "id": "teaching",
                "panel": {
                    "title": "Anagram Identified",
                    "instruction": "'{indicator}' tells us to rearrange '{fodder}' → {result} ({letterCount} letters)"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "letter_selection": {
        "phases": [
            {
                "id": "indicator",
                "intro": {
                    "title": "Letter Selection",
                    "text": "Some indicators tell you to extract specific letters from words.",
                    "example": '"at last" = final letters, "initially" = first letters'
                },
                "panel": {
                    "title": "FIND INDICATOR",
                    "instruction": "Tap the letter selection indicator."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
                "onWrong": {"message": "Look for a phrase about which letters to take"}
            },
            {
                "id": "fodder",
                "panel": {
                    "title": "FIND SOURCE WORDS",
                    "instruction": "Tap the words we extract letters from."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Which words contribute letters?"}
            },
            {
                "id": "result",
                "panel": {
                    "title": "EXTRACT LETTERS",
                    "instruction": "Type the extracted letters from '{fodder}'."
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Take the {extractionType} of each word"}
            },
            {
                "id": "teaching",
                "panel": {
                    "title": "Letters Extracted",
                    "instruction": "'{indicator}' tells us to take {extractionType}s from '{fodder}' → {result}"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "anagram_solve": {
        "phases": [
            {
                "id": "result",
                "intro": {
                    "title": "Solve the Anagram",
                    "text": "You've gathered all the letters. Now rearrange them to find the answer."
                },
                "panel": {
                    "title": "SOLVE",
                    "instruction": "Rearrange {fodder} to form a {letterCount}-letter word meaning '{definition}'."
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Try rearranging the letters differently"}
            },
            {
                "id": "teaching",
                "panel": {
                    "title": "Solved!",
                    "instruction": "{fodder} rearranges to {result} - {definition}."
                },
                "inputMode": "none",
                "button": {"label": "Complete →", "action": "complete"}
            }
        ]
    },

    "container": {
        "phases": [
            {
                "id": "indicator",
                "intro": {
                    "title": "Container",
                    "text": "A container indicator tells you one thing goes inside another.",
                    "example": '"nurses", "holds", "contains", "swallows" all suggest insertion'
                },
                "panel": {
                    "title": "FIND INDICATOR",
                    "instruction": "Tap the container indicator - a word suggesting something goes inside something else."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
                "onWrong": {"message": "Look for a word meaning 'holds' or 'contains'"}
            },
            {
                "id": "order",
                "panel": {
                    "title": "WHAT GOES WHERE?",
                    "instruction": "Which element goes inside which?"
                },
                "inputMode": "multiple_choice",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Think about what '{indicator}' means - who is doing the holding?"}
            },
            {
                "id": "teaching",
                "panel": {
                    "title": "Container Complete",
                    "instruction": "'{indicator}' tells us {inner} goes inside {outer} → {result}"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    }
}

# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

_sessions = {}  # clue_id -> session state

def start_session(clue_id, clue):
    """Initialize a new training session."""
    _sessions[clue_id] = {
        "clue_id": clue_id,
        "step_index": 0,
        "phase_index": 0,
        "highlights": []
    }
    return get_render(clue_id, clue)

def get_session(clue_id):
    """Get existing session or None."""
    return _sessions.get(clue_id)

# =============================================================================
# RENDER
# =============================================================================

def substitute_variables(text, step, session):
    """Replace {variable} placeholders with values from step data."""
    if not isinstance(text, str):
        return text

    # Build substitution dict from step data
    subs = {}

    # Handle expected.text for definition
    if "expected" in step and isinstance(step["expected"], dict):
        subs["result"] = step["expected"].get("text", "")

    # Direct fields
    for key in ["position", "result", "fodder", "indicator", "extractionType", "letterCount", "definition", "inner", "outer"]:
        if key in step:
            val = step[key]
            # Handle dict with text field
            if isinstance(val, dict) and "text" in val:
                subs[key] = val["text"]
            else:
                subs[key] = str(val)

    # Perform substitution
    for key, val in subs.items():
        text = text.replace("{" + key + "}", str(val))

    return text

def get_render(clue_id, clue):
    """Build render object for current state."""
    session = _sessions.get(clue_id)
    if not session:
        return {"error": "No session"}

    steps = clue.get("steps", [])

    # Check if complete
    if session["step_index"] >= len(steps):
        return {
            "complete": True,
            "highlights": session["highlights"]
        }

    step = steps[session["step_index"]]
    template = STEP_TEMPLATES.get(step["type"])
    if not template:
        return {"error": f"Unknown step type: {step['type']}"}

    phases = template["phases"]
    if session["phase_index"] >= len(phases):
        return {"error": "Phase index out of range"}

    phase = phases[session["phase_index"]]

    # Build render
    render = {
        "stepIndex": session["step_index"],
        "phaseIndex": session["phase_index"],
        "stepType": step["type"],
        "phaseId": phase["id"],
        "inputMode": phase.get("inputMode", "none"),
        "highlights": session["highlights"]
    }

    # Add intro if present
    if "intro" in phase:
        render["intro"] = {
            "title": phase["intro"].get("title", ""),
            "text": phase["intro"].get("text", ""),
            "example": phase["intro"].get("example", "")
        }

    # Add panel
    if "panel" in phase:
        render["panel"] = {
            "title": phase["panel"].get("title", ""),
            "instruction": substitute_variables(phase["panel"].get("instruction", ""), step, session)
        }

    # Add button if present
    if "button" in phase:
        render["button"] = phase["button"]

    # Add expected for validation (tap_words needs indices)
    if phase.get("inputMode") == "tap_words":
        phase_id = phase["id"]
        if phase_id == "select" and "expected" in step:
            render["expected"] = step["expected"]["indices"]
        elif phase_id == "indicator" and "indicator" in step:
            render["expected"] = step["indicator"]["indices"]
        elif phase_id == "fodder" and "fodder" in step:
            render["expected"] = step["fodder"]["indices"]
    elif phase.get("inputMode") == "text":
        if "result" in step:
            render["expected"] = step["result"]
    elif phase.get("inputMode") == "multiple_choice":
        # Send options to UI for rendering
        if "options" in step:
            render["options"] = step["options"]

    return render

# =============================================================================
# INPUT HANDLING
# =============================================================================

def handle_input(clue_id, clue, value):
    """Process user input (tap or text)."""
    session = _sessions.get(clue_id)
    if not session:
        return {"error": "No session"}

    steps = clue.get("steps", [])
    step = steps[session["step_index"]]
    template = STEP_TEMPLATES[step["type"]]
    phase = template["phases"][session["phase_index"]]

    # Determine expected value
    expected = None
    phase_id = phase["id"]

    if phase.get("inputMode") == "tap_words":
        if phase_id == "select" and "expected" in step:
            expected = step["expected"]["indices"]
        elif phase_id == "indicator" and "indicator" in step:
            expected = step["indicator"]["indices"]
        elif phase_id == "fodder" and "fodder" in step:
            expected = step["fodder"]["indices"]
    elif phase.get("inputMode") == "text":
        if "result" in step:
            expected = step["result"].upper()
    elif phase.get("inputMode") == "multiple_choice":
        # For multiple choice, expected is the index of the correct option
        if "options" in step:
            for i, opt in enumerate(step["options"]):
                if opt.get("correct"):
                    expected = i
                    break

    # Check answer
    correct = False
    if phase.get("inputMode") == "tap_words":
        # Compare indices (as sets for order-independence)
        if isinstance(value, list) and isinstance(expected, list):
            correct = set(value) == set(expected)
    elif phase.get("inputMode") == "text":
        # Compare text (case-insensitive)
        if isinstance(value, str) and expected:
            correct = value.upper().strip() == expected
    elif phase.get("inputMode") == "multiple_choice":
        # Compare selected option index
        correct = value == expected

    if correct:
        # Add highlight if specified
        if "onCorrect" in phase and "highlight" in phase["onCorrect"]:
            session["highlights"].append({
                "indices": expected if isinstance(expected, list) else [],
                "color": phase["onCorrect"]["highlight"]["color"],
                "role": phase["onCorrect"]["highlight"].get("role", "")
            })

        # Advance to next phase
        session["phase_index"] += 1
        if session["phase_index"] >= len(template["phases"]):
            session["step_index"] += 1
            session["phase_index"] = 0

        return {
            "correct": True,
            "render": get_render(clue_id, clue)
        }
    else:
        # Wrong answer
        message = phase.get("onWrong", {}).get("message", "Try again")
        return {
            "correct": False,
            "message": substitute_variables(message, step, session),
            "render": get_render(clue_id, clue)
        }

def handle_continue(clue_id, clue):
    """Handle continue button press."""
    session = _sessions.get(clue_id)
    if not session:
        return {"error": "No session"}

    steps = clue.get("steps", [])
    step = steps[session["step_index"]]
    template = STEP_TEMPLATES[step["type"]]

    # Advance to next phase
    session["phase_index"] += 1
    if session["phase_index"] >= len(template["phases"]):
        session["step_index"] += 1
        session["phase_index"] = 0

    return get_render(clue_id, clue)
