"""
Training Handler - Template-based step system

Each step type has a predefined template (90% generic).
Clue data provides only specific values (10%).
"""

import re

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def parse_enumeration(enum_str):
    """Parse enumeration like '3-4' or '10' to total letter count."""
    numbers = re.findall(r'\d+', str(enum_str))
    return sum(int(n) for n in numbers) if numbers else 0

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
                    "title": "Before solving, identify the clue type",
                    "text": "Scan the clue structure, don't solve yet:\n\n• Instruction words (rearranged, inside, about, sounds like) → Standard clue\n• Clear definition at start or end → Standard clue\n• Short clue, no instruction words → Double definition\n• Single playful description, no clear split → Cryptic definition\n• Every word serves both meaning AND wordplay → &lit"
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
                    "title": "Spotting the Definition",
                    "text": "The definition is the 'straight' part — a normal dictionary meaning of the answer.\n\nIt's always at the very beginning OR the very end of the clue.",
                    "example": "Ignore the surface story. Look for a phrase at start or end that could define a word."
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
                    "title": "DEFINITION FOUND: {result}",
                    "instruction": "The definition is always at the start or end — never buried in the middle. Here you found it at the {position}."
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
                "intro": {
                    "title": "Find the Fodder",
                    "text": "The fodder is always adjacent to the indicator.",
                    "example": "Look for words right before or after the indicator"
                },
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
                    "title": "ANAGRAM FOUND: {result}",
                    "instruction": "'{indicator}' tells us to rearrange '{fodder}' ({letterCount} letters)"
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
                    "text": "Some indicators tell you to extract specific letters from words."
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
                    "title": "LETTERS EXTRACTED: {result}",
                    "instruction": "'{indicator}' tells us to take {extractionType}s from '{fodder}'"
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
                    "text": "You've gathered all the letters: {fodder}. Now rearrange them to find the answer that meets the definition '{definition}'."
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
                    "title": "SOLVED: {result}",
                    "instruction": "'{indicator}' tells us to rearrange {fodder} → {result} = '{definition}'"
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
                    "title": "CONTAINER: {result}",
                    "instruction": "'{indicator}' tells us {inner} goes inside {outer}"
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
                    "text": "Two separate meanings of the same answer, sitting side by side.\n\nNo wordplay — both parts simply define the word in different ways.",
                    "example": "Tip: Short clue with no wordplay indicators? Probably a double definition."
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
                "intro": {
                    "title": "Solve",
                    "text": "Find a {letterCount} letter word that means both '{def1}' and '{def2}'."
                },
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
                    "title": "SOLVED: {result}",
                    "instruction": "Both '{def1}' and '{def2}' define the answer. No wordplay needed — just two meanings!"
                },
                "inputMode": "none",
                "button": {"label": "Complete →", "action": "complete"}
            }
        ]
    },

    "synonym": {
        "phases": [
            {
                "id": "fodder",
                "actionPrompt": "Tap the word to find a synonym for",
                "intro": {
                    "title": "Synonym",
                    "text": "A synonym is a word with the same or similar meaning.",
                    "example": '"Mums" → MOTHERS, "like" → AS'
                },
                "panel": {
                    "title": "FIND WORD",
                    "instruction": "Tap the word we need to find a synonym for."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Look for a word that has a synonym"}
            },
            {
                "id": "result",
                "actionPrompt": "Type the synonym",
                "panel": {
                    "title": "ENTER SYNONYM",
                    "instruction": "Type a synonym for '{fodder}'."
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Think of another word that means '{fodder}'"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "SYNONYM: {result}",
                    "instruction": "'{fodder}' gives us {result}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "abbreviation": {
        "phases": [
            {
                "id": "fodder",
                "actionPrompt": "Tap the word to abbreviate",
                "intro": {
                    "title": "Abbreviation",
                    "text": "Common words can be abbreviated to single letters or short forms.",
                    "example": '"hot" → H, "east" → E, "quiet" → P (piano)'
                },
                "panel": {
                    "title": "FIND WORD",
                    "instruction": "Tap the word that abbreviates to a letter."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Look for a word with a common abbreviation"}
            },
            {
                "id": "result",
                "actionPrompt": "Type the abbreviation",
                "panel": {
                    "title": "ENTER ABBREVIATION",
                    "instruction": "Type the abbreviation for '{fodder}'."
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "What letter or short form represents '{fodder}'?"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "ABBREVIATION: {result}",
                    "instruction": "'{fodder}' abbreviates to {result}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "deletion": {
        "phases": [
            {
                "id": "indicator",
                "actionPrompt": "Tap the deletion indicator",
                "intro": {
                    "title": "Deletion",
                    "text": "A deletion indicator tells you to remove letters from a word.",
                    "example": '"dropping", "losing", "without" all suggest deletion'
                },
                "panel": {
                    "title": "FIND INDICATOR",
                    "instruction": "Tap the word that signals deletion."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
                "onWrong": {"message": "Look for a word meaning 'remove' or 'without'"}
            },
            {
                "id": "result",
                "actionPrompt": "Type what remains",
                "panel": {
                    "title": "ENTER RESULT",
                    "instruction": "After removing '{deleteTarget}' from {fodder}, what's left?"
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Remove '{deleteTarget}' from {fodder}"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "DELETION: {result}",
                    "instruction": "'{indicator}' tells us to remove '{deleteTarget}' from {fodder}, leaving {result}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "charade": {
        "phases": [
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "intro": {
                    "title": "Charade",
                    "text": "The components join together in sequence to form the answer."
                },
                "panel": {
                    "title": "CHARADE: {result}",
                    "instruction": "Joining {components} gives us {result}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "hidden": {
        "phases": [
            {
                "id": "indicator",
                "actionPrompt": "Tap the hidden word indicator",
                "intro": {
                    "title": "Hidden Word",
                    "text": "The answer is hidden within the consecutive letters of other words.",
                    "example": '"some", "in", "partly", "held by" all suggest hidden words'
                },
                "panel": {
                    "title": "FIND INDICATOR",
                    "instruction": "Tap the word that signals a hidden answer."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
                "onWrong": {"message": "Look for a word suggesting something is hidden inside"}
            },
            {
                "id": "fodder",
                "actionPrompt": "Tap the words hiding the answer",
                "panel": {
                    "title": "FIND HIDING PLACE",
                    "instruction": "Tap the words that contain the hidden answer."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Look at the words adjacent to the indicator"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "HIDDEN: {result}",
                    "instruction": "'{indicator}' tells us the answer is hidden in '{fodder}' → {result}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "homophone": {
        "phases": [
            {
                "id": "indicator",
                "actionPrompt": "Tap the homophone indicator",
                "intro": {
                    "title": "Homophone",
                    "text": "A homophone is a word that sounds like another word.",
                    "example": '"sounds like", "heard", "spoken", "say" all suggest homophones'
                },
                "panel": {
                    "title": "FIND INDICATOR",
                    "instruction": "Tap the word that signals a sound-alike."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
                "onWrong": {"message": "Look for a word about speaking or hearing"}
            },
            {
                "id": "result",
                "actionPrompt": "Type the sound-alike word",
                "panel": {
                    "title": "ENTER HOMOPHONE",
                    "instruction": "What word sounds like '{fodder}'?"
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Say '{fodder}' aloud - what other word sounds the same?"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "HOMOPHONE: {result}",
                    "instruction": "'{indicator}' tells us '{fodder}' sounds like {result}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "reversal": {
        "phases": [
            {
                "id": "indicator",
                "actionPrompt": "Tap the reversal indicator",
                "intro": {
                    "title": "Reversal",
                    "text": "A reversal indicator tells you to reverse the letters.",
                    "example": '"back", "up" (in down clues), "west" (in across clues) suggest reversal'
                },
                "panel": {
                    "title": "FIND INDICATOR",
                    "instruction": "Tap the word that signals reversal."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
                "onWrong": {"message": "Look for a word suggesting backwards direction"}
            },
            {
                "id": "fodder",
                "actionPrompt": "Tap the words to reverse",
                "panel": {
                    "title": "FIND FODDER",
                    "instruction": "Tap the words whose letters get reversed."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Look at the words adjacent to the indicator"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "REVERSAL: {result}",
                    "instruction": "'{indicator}' tells us to reverse '{fodder}' → {result}."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "connector": {
        "phases": [
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "intro": {
                    "title": "Connector Word",
                    "text": "Some words in a clue are structural connectors — they link parts together but don't contribute letters to the answer."
                },
                "panel": {
                    "title": "CONNECTOR: {text}",
                    "instruction": "'{text}' is a connector word — it links the wordplay components but doesn't add any letters to the answer."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "literal": {
        "phases": [
            {
                "id": "fodder",
                "actionPrompt": "Tap the literal letter",
                "intro": {
                    "title": "Literal Letter",
                    "text": "Sometimes a letter in the clue represents itself literally — it's used directly in the answer.",
                    "example": '"A" means the letter A, not "one" or another interpretation'
                },
                "panel": {
                    "title": "FIND LITERAL",
                    "instruction": "Tap the letter that appears literally in the answer."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "PURPLE", "role": "literal"}},
                "onWrong": {"message": "Look for a letter used directly"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "LITERAL: {result}",
                    "instruction": "'{fodder}' is used literally — it contributes the letter(s) {result} directly to the answer."
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "cryptic_definition": {
        "phases": [
            {
                "id": "teaching",
                "actionPrompt": "Continue to solve",
                "intro": {
                    "title": "Cryptic Definition",
                    "text": "This entire clue is a cryptic definition — a whimsical or punning description of the answer with no standard wordplay.",
                    "example": "The whole clue describes the answer in a playful, misleading way"
                },
                "panel": {
                    "title": "CRYPTIC DEFINITION",
                    "instruction": "{explanation}"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
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
    "synonym": "standard",
    "abbreviation": "standard",
    "deletion": "standard",
    "charade": "standard",
    "hidden": "standard",
    "homophone": "standard",
    "reversal": "standard",
    "connector": "standard",
    "literal": "standard",
    "cryptic_definition": "cryptic_definition",
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
        "highlights": [],
        "learnings": []  # Accumulated teaching summaries
    }
    return get_render(clue_id, clue)

def get_session(clue_id):
    """Get existing session or None."""
    return _sessions.get(clue_id)

def clear_session(clue_id):
    """Clear session for a clue (e.g., on exit). Returns True if session existed."""
    if clue_id in _sessions:
        del _sessions[clue_id]
        return True
    return False

# =============================================================================
# RENDER
# =============================================================================

def substitute_variables(text, step, session, clue=None):
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
    for key in ["position", "result", "fodder", "indicator", "extractionType", "letterCount", "definition", "inner", "outer", "deleteTarget", "text"]:
        if key in step:
            val = step[key]
            # Handle dict with text field
            if isinstance(val, dict) and "text" in val:
                subs[key] = val["text"]
            else:
                subs[key] = str(val)

    # Handle components array for charade
    if "components" in step:
        components = step["components"]
        subs["components"] = " + ".join(components)

    # Get letterCount from clue enumeration if not in step (for double_definition)
    if "letterCount" not in subs and clue:
        enumeration = clue.get("clue", {}).get("enumeration", "")
        if enumeration:
            subs["letterCount"] = enumeration

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
            "actionPrompt": "Solved!",
            "learnings": session.get("learnings", []),
            "inputMode": "none"
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
        "actionPrompt": phase.get("actionPrompt", ""),
        "learnings": session.get("learnings", [])
    }

    # Add difficulty for clue type identification step (step_index == -1)
    if session["step_index"] == -1:
        difficulty = clue.get("difficulty")
        if difficulty:
            render["difficulty"] = difficulty

    # Add intro if present
    if "intro" in phase:
        render["intro"] = {
            "title": substitute_variables(phase["intro"].get("title", ""), step, session, clue),
            "text": substitute_variables(phase["intro"].get("text", ""), step, session, clue),
            "example": substitute_variables(phase["intro"].get("example", ""), step, session, clue)
        }

    # Add panel
    if "panel" in phase:
        render["panel"] = {
            "title": substitute_variables(phase["panel"].get("title", ""), step, session, clue),
            "instruction": substitute_variables(phase["panel"].get("instruction", ""), step, session, clue)
        }

    # Add button if present
    if "button" in phase:
        render["button"] = phase["button"]

    # Special handling for letter_selection result phase - use training.hint if available
    if step["type"] == "letter_selection" and phase["id"] == "result":
        training = step.get("training", {})
        if training.get("hint"):
            render["panel"]["instruction"] = training["hint"]

    # Special handling for container order phase - use training.hint if available
    if step["type"] == "container" and phase["id"] == "order":
        training = step.get("training", {})
        if training.get("hint"):
            render["panel"]["instruction"] = training["hint"]

    # Special handling for standard_definition teaching phase - use training.hint if available
    if step["type"] == "standard_definition" and phase["id"] == "teaching":
        training = step.get("training", {})
        if training.get("hint"):
            render["panel"]["instruction"] = training["hint"]

    # Special handling for charade teaching phase - use training.hint if available
    if step["type"] == "charade" and phase["id"] == "teaching":
        training = step.get("training", {})
        if training.get("hint"):
            render["panel"]["instruction"] = training["hint"]

    # Special handling for anagram_find teaching phase
    if step["type"] == "anagram_find" and phase["id"] == "teaching":
        letter_count = step.get("letterCount", 0)
        enumeration = parse_enumeration(clue.get("clue", {}).get("enumeration", "0"))

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
        # Compare text (case-insensitive, letters only - strip hyphens/spaces)
        if isinstance(value, str) and expected:
            import re
            user_letters = re.sub(r'[^A-Z]', '', value.upper())
            expected_letters = re.sub(r'[^A-Z]', '', expected)
            correct = user_letters == expected_letters
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
            "message": substitute_variables(message, step, session, clue),
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
    phase = template["phases"][session["phase_index"]]

    # If this is a teaching phase, capture the learning before advancing
    if phase["id"] == "teaching" and "panel" in phase:
        learning_text = substitute_variables(phase["panel"].get("instruction", ""), step, session, clue)
        # Apply same special handling as in get_render for anagram_find and double_definition
        if step["type"] == "anagram_find":
            letter_count = step.get("letterCount", 0)
            enumeration = parse_enumeration(clue.get("clue", {}).get("enumeration", "0"))
            if letter_count == enumeration:
                learning_text = f"'{step['indicator']['text']}' tells us to rearrange '{step['fodder']['text']}' → {step['result']} ({letter_count} letters). This is our full anagram!"
            else:
                learning_text = f"\"{step['indicator']['text'].capitalize()}\" is an anagram indicator, telling us to rearrange {step['fodder']['text'].upper()}. That gives {letter_count} letters, but the answer requires {enumeration}, so we know additional letters must be added from elsewhere in the clue."
        elif step["type"] == "double_definition":
            definitions = step.get("definitions", [])
            def1_text = definitions[0]["text"] if len(definitions) > 0 else ""
            def2_text = definitions[1]["text"] if len(definitions) > 1 else ""
            result = step.get("result", "")
            learning_text = f"Both '{def1_text}' and '{def2_text}' define {result}. No wordplay needed — just two meanings!"
        elif step["type"] == "standard_definition":
            training = step.get("training", {})
            if training.get("hint"):
                learning_text = training["hint"]

        if learning_text:
            learning_title = substitute_variables(phase["panel"].get("title", ""), step, session, clue)
            session["learnings"].append({
                "title": learning_title,
                "text": learning_text
            })

    # Advance to next phase
    session["phase_index"] += 1
    if session["phase_index"] >= len(template["phases"]):
        session["step_index"] += 1
        session["phase_index"] = 0

    return get_render(clue_id, clue)

def get_all_learnings(clue):
    """Generate all learnings for a clue (used when user solves early)."""
    definition_learnings = []
    other_learnings = []
    steps = clue.get("steps", [])

    for step in steps:
        template = STEP_TEMPLATES.get(step["type"])
        if not template:
            continue

        # Find the teaching phase
        for phase in template["phases"]:
            if phase["id"] == "teaching" and "panel" in phase:
                # Generate learning text with special handling for each step type
                learning_text = substitute_variables(phase["panel"].get("instruction", ""), step, {}, clue)

                if step["type"] == "anagram_find":
                    letter_count = step.get("letterCount", 0)
                    enumeration = parse_enumeration(clue.get("clue", {}).get("enumeration", "0"))
                    if letter_count == enumeration:
                        learning_text = f"'{step['indicator']['text']}' tells us to rearrange '{step['fodder']['text']}' → {step['result']} ({letter_count} letters). This is our full anagram!"
                    else:
                        learning_text = f"\"{step['indicator']['text'].capitalize()}\" is an anagram indicator, telling us to rearrange {step['fodder']['text'].upper()}. That gives {letter_count} letters, but the answer requires {enumeration}, so we know additional letters must be added from elsewhere in the clue."
                elif step["type"] == "double_definition":
                    definitions = step.get("definitions", [])
                    def1_text = definitions[0]["text"] if len(definitions) > 0 else ""
                    def2_text = definitions[1]["text"] if len(definitions) > 1 else ""
                    result = step.get("result", "")
                    learning_text = f"Both '{def1_text}' and '{def2_text}' define {result}. No wordplay needed — just two meanings!"
                elif step["type"] == "standard_definition":
                    training = step.get("training", {})
                    if training.get("hint"):
                        learning_text = training["hint"]

                if learning_text:
                    learning_title = substitute_variables(phase["panel"].get("title", ""), step, {}, clue)
                    learning = {
                        "title": learning_title,
                        "text": learning_text
                    }
                    # Definition steps go first
                    if step["type"] in ("standard_definition", "double_definition"):
                        definition_learnings.append(learning)
                    else:
                        other_learnings.append(learning)
                break  # Only one teaching phase per step

    # Definition learnings first, then others
    return definition_learnings + other_learnings
