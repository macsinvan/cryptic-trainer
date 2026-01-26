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
    "clue_type_identify": {
        "phases": [
            {
                "id": "choose",
                "actionPrompt": "Select clue type",
                "intro": {
                    "title": "What Type of Clue Is This?",
                    "text": "Before solving, identify the clue structure. Look for a clean split between the definition (always at start or end) and wordplay (the rest). Stay flexible — let the clue tell you how it wants to be read.",
                    "example": "Tip: ? often signals wordplay or a cryptic definition. ! traditionally marks an &lit clue."
                },
                "panel": {
                    "title": "IDENTIFY CLUE TYPE",
                    "instruction": "Select the type of clue you think this is."
                },
                "inputMode": "multiple_choice",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Not quite. Look again at the clue structure."}
            }
        ]
    },

    "standard_definition": {
        "phases": [
            {
                "id": "select",
                "actionPrompt": "Tap the definition words",
                "intro": {
                    "title": "Spotting the Definition in a Standard Cryptic Clue",
                    "text": "In most cryptic crossword clues, the definition is the straight part of the clue — a normal dictionary-style meaning of the answer. It's usually found either at the very beginning or the very end of the clue, with the rest of the words providing the wordplay that builds the answer.",
                    "example": "First, ignore the surface story. Look for a phrase at start or end that could define a word. Check that remaining words can plausibly explain how to construct that word."
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
                "actionPrompt": "Continue to next step",
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
                "actionPrompt": "Tap the anagram indicator",
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
                "actionPrompt": "Tap the fodder words",
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
                "actionPrompt": "Continue to next step",
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
                "actionPrompt": "Tap the letter selection indicator",
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
                "actionPrompt": "Tap the source words",
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
                "actionPrompt": "Type the extracted letters",
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
                "actionPrompt": "Continue to next step",
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
                "actionPrompt": "Type the answer",
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
                "actionPrompt": "Complete training",
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
                "actionPrompt": "Tap the container indicator",
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
                "actionPrompt": "Select the correct order",
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
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "Container Complete",
                    "instruction": "'{indicator}' tells us {inner} goes inside {outer} → {result}"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "double_definition": {
        "phases": [
            {
                "id": "first_def",
                "actionPrompt": "Tap the first definition",
                "intro": {
                    "title": "Double Definition",
                    "text": "A double definition clue gives two separate meanings of the same answer. There's no wordplay to build the solution — instead, both parts of the clue define the word in different ways. The definitions usually sit side by side, and either meaning should make sense on its own.",
                    "example": "Coaching tip: if a clue feels unusually short and nothing looks like wordplay (no indicators for anagrams, containers, deletions, etc.), it's often a double definition."
                },
                "panel": {
                    "title": "FIRST DEFINITION",
                    "instruction": "Tap the first definition."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "GREEN", "role": "definition1"}},
                "onWrong": {"message": "Look for a word or phrase that defines the answer"}
            },
            {
                "id": "second_def",
                "actionPrompt": "Tap the second definition",
                "panel": {
                    "title": "SECOND DEFINITION",
                    "instruction": "Tap the second definition."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "definition2"}},
                "onWrong": {"message": "Look for another word or phrase that also defines the answer"}
            },
            {
                "id": "solve",
                "actionPrompt": "Type the answer",
                "panel": {
                    "title": "SOLVE",
                    "instruction": "Type the word that matches both definitions."
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Think of a word that means both '{def1}' and '{def2}'"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Complete training",
                "panel": {
                    "title": "Double Definition Complete",
                    "instruction": "Both '{def1}' and '{def2}' define {result}. No wordplay needed — just two meanings!"
                },
                "inputMode": "none",
                "button": {"label": "Complete →", "action": "complete"}
            }
        ]
    }
}

# =============================================================================
# CLUE TYPE IDENTIFICATION
# =============================================================================

# Map step types to clue type categories
STEP_TO_CLUE_TYPE = {
    "standard_definition": "standard",
    "anagram_find": "standard",
    "anagram_solve": "standard",
    "letter_selection": "standard",
    "container": "standard",
    "double_definition": "double_definition",
    # Add more mappings as needed
}

CLUE_TYPE_OPTIONS = [
    {
        "id": "standard",
        "label": "Standard",
        "description": "Definition at start or end, with wordplay indicators in the rest"
    },
    {
        "id": "double_definition",
        "label": "Double Definition",
        "description": "Two separate meanings with no wordplay indicators"
    },
    {
        "id": "cryptic_definition",
        "label": "Cryptic Definition",
        "description": "Whole clue is one whimsical description with no obvious wordplay"
    },
    {
        "id": "and_lit",
        "label": "&lit",
        "description": "Whole clue both describes AND constructs the answer simultaneously"
    }
]

def get_clue_type(clue):
    """Determine the clue type from the first step."""
    steps = clue.get("steps", [])
    if not steps:
        return "standard"
    first_step_type = steps[0].get("type", "")
    return STEP_TO_CLUE_TYPE.get(first_step_type, "standard")

def build_clue_type_step(clue):
    """Build a synthetic clue_type_identify step with correct answer."""
    correct_type = get_clue_type(clue)
    options = []
    for opt in CLUE_TYPE_OPTIONS:
        options.append({
            "label": opt["label"],
            "description": opt["description"],
            "correct": opt["id"] == correct_type
        })
    return {
        "type": "clue_type_identify",
        "options": options
    }

# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

_sessions = {}  # clue_id -> session state

def start_session(clue_id, clue):
    """Initialize a new training session."""
    _sessions[clue_id] = {
        "clue_id": clue_id,
        "step_index": -1,  # Start at -1 for clue type identification step
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

    # Handle definitions array for double_definition
    if "definitions" in step:
        definitions = step["definitions"]
        if len(definitions) > 0:
            subs["def1"] = definitions[0].get("text", "")
        if len(definitions) > 1:
            subs["def2"] = definitions[1].get("text", "")

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

    # Get the answer from clue data
    answer = clue.get("clue", {}).get("answer", "")

    # Check if complete
    if session["step_index"] >= len(steps):
        return {
            "complete": True,
            "highlights": session["highlights"],
            "answer": answer,
            "actionPrompt": "Training complete!"
        }

    # Handle clue type identification step (step_index == -1)
    if session["step_index"] == -1:
        step = build_clue_type_step(clue)
    else:
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
        "highlights": session["highlights"],
        "answer": answer,
        "actionPrompt": phase.get("actionPrompt", "")
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

    # Special handling for anagram_find teaching phase
    if step["type"] == "anagram_find" and phase["id"] == "teaching":
        letter_count = step.get("letterCount", 0)
        enumeration = int(clue.get("clue", {}).get("enumeration", "0"))

        if letter_count == enumeration:
            # Complete anagram - can solve directly
            render["panel"]["instruction"] = f"'{step['indicator']['text']}' tells us to rearrange '{step['fodder']['text']}' → {step['result']} ({letter_count} letters). This is our full anagram!"
        else:
            # Partial anagram - more letters needed
            render["panel"]["instruction"] = f"\"{step['indicator']['text'].capitalize()}\" is an anagram indicator, telling us to rearrange {step['fodder']['text'].upper()}. That gives {letter_count} letters, but the answer requires {enumeration}, so we know additional letters must be added from elsewhere in the clue."

    # Special handling for double_definition teaching phase
    if step["type"] == "double_definition" and phase["id"] == "teaching":
        definitions = step.get("definitions", [])
        def1_text = definitions[0]["text"] if len(definitions) > 0 else ""
        def2_text = definitions[1]["text"] if len(definitions) > 1 else ""
        result = step.get("result", "")
        render["panel"]["instruction"] = f"Both '{def1_text}' and '{def2_text}' define {result}. No wordplay needed — just two meanings!"

    # Add expected for validation (tap_words needs indices)
    if phase.get("inputMode") == "tap_words":
        phase_id = phase["id"]
        if phase_id == "select" and "expected" in step:
            render["expected"] = step["expected"]["indices"]
        elif phase_id == "indicator" and "indicator" in step:
            render["expected"] = step["indicator"]["indices"]
        elif phase_id == "fodder" and "fodder" in step:
            render["expected"] = step["fodder"]["indices"]
        elif phase_id == "first_def" and "definitions" in step:
            render["expected"] = step["definitions"][0]["indices"]
        elif phase_id == "second_def" and "definitions" in step:
            render["expected"] = step["definitions"][1]["indices"]
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

    # Handle clue type identification step (step_index == -1)
    if session["step_index"] == -1:
        step = build_clue_type_step(clue)
    else:
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
        elif phase_id == "first_def" and "definitions" in step:
            expected = step["definitions"][0]["indices"]
        elif phase_id == "second_def" and "definitions" in step:
            expected = step["definitions"][1]["indices"]
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

    # Handle clue type identification step (step_index == -1)
    if session["step_index"] == -1:
        step = build_clue_type_step(clue)
    else:
        step = steps[session["step_index"]]

    template = STEP_TEMPLATES[step["type"]]

    # Advance to next phase
    session["phase_index"] += 1
    if session["phase_index"] >= len(template["phases"]):
        session["step_index"] += 1
        session["phase_index"] = 0

    return get_render(clue_id, clue)
