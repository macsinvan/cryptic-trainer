"""
Training Handler - V2 Template-based step system

Implements hypothesis-driven solving:
1. Find definition → form hypothesis
2. Scan for common vocabulary (anchors) and indicators
3. Start with what you KNOW, discover unknowns

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
                    "title": "DEFINITION FOUND",
                    "instruction": "The definition is at the {position}. Form a hypothesis — what word fits this definition?"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
            # Note: "solve" phase added dynamically when recommendedApproach == "definition"
        ]
    },

    "wordplay_overview": {
        # Phases are generated dynamically based on common_vocabulary count
        "phases": []  # Placeholder - built dynamically
    },

    "deletion_discover": {
        "phases": [
            {
                "id": "fodder",
                "actionPrompt": "Tap the word the indicator operates on",
                "panel": {
                    "title": "FIND FODDER",
                    "instruction": "Tap the word that '{indicator}' operates on."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Indicators operate on adjacent words."}
            },
            {
                "id": "result",
                "actionPrompt": "Type the letters after shortening",
                "panel": {
                    "title": "TYPE RESULT",
                    "instruction": "Type the {letters_needed} letters after shortening."
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "If the shortened word doesn't fit, find a synonym first, then shorten."}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "DELETION CONFIRMED",
                    "instruction": "{fodder_word} = {fodder_synonym}, shortened = {result}"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "container_verify": {
        "phases": [
            {
                "id": "order",
                "actionPrompt": "Select which piece goes inside which",
                "panel": {
                    "title": "CONTAINER ORDER",
                    "instruction": "'{indicator}' means one thing surrounds another. Which arrangement fits your hypothesis?"
                },
                "inputMode": "multiple_choice",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Think about what '{indicator}' means - which piece wraps around the other?"}
            },
            {
                "id": "result",
                "actionPrompt": "Type the combined result",
                "panel": {
                    "title": "TYPE RESULT",
                    "instruction": "Put {inner} inside {outer}. What do you get?"
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "The outer piece splits to wrap the inner piece."}
            },
            {
                "id": "teaching",
                "actionPrompt": "Complete training",
                "panel": {
                    "title": "COMPLETE",
                    "instruction": "{outer_split} = {result} ✓"
                },
                "inputMode": "none",
                "button": {"label": "Complete →", "action": "complete"}
            }
        ]
    },

    "charade_verify": {
        "phases": [
            {
                "id": "result",
                "actionPrompt": "Type the combined result",
                "panel": {
                    "title": "COMBINE PIECES",
                    "instruction": "Combine your known pieces: {components_display}. What do you get?"
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Combine the pieces in order."}
            },
            {
                "id": "teaching",
                "actionPrompt": "Continue to next step",
                "panel": {
                    "title": "CHARADE CONFIRMED",
                    "instruction": "{components_display} = {result} ({letters_so_far} of {letters_needed} letters)"
                },
                "inputMode": "none",
                "button": {"label": "Continue →", "action": "next_step"}
            }
        ]
    },

    "alternation_discover": {
        "phases": [
            {
                "id": "fodder",
                "actionPrompt": "Tap the letters the indicator operates on",
                "panel": {
                    "title": "FIND FODDER",
                    "instruction": "Tap the letters that '{indicator}' operates on."
                },
                "inputMode": "tap_words",
                "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
                "onWrong": {"message": "Indicators operate on adjacent words."}
            },
            {
                "id": "result",
                "actionPrompt": "Type the alternating letters",
                "panel": {
                    "title": "TYPE RESULT",
                    "instruction": "Take alternating letters. What {letters_needed} letters complete your hypothesis?"
                },
                "inputMode": "text",
                "onCorrect": {"message": "Correct!"},
                "onWrong": {"message": "Take every other letter from the fodder."}
            },
            {
                "id": "teaching",
                "actionPrompt": "Complete training",
                "panel": {
                    "title": "COMPLETE",
                    "instruction": "Alternating letters from {fodder} = {result} ✓"
                },
                "inputMode": "none",
                "button": {"label": "Complete →", "action": "complete"}
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
                    "example": "Short clue with no wordplay indicators? Probably a double definition."
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
                "onWrong": {"message": "Think of a word that means both definitions"}
            },
            {
                "id": "teaching",
                "actionPrompt": "Complete training",
                "panel": {
                    "title": "SOLVED",
                    "instruction": "Both definitions point to {result}. No wordplay needed!"
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

STEP_TO_CLUE_TYPE = {
    "standard_definition": "standard",
    "wordplay_overview": "standard",
    "deletion_discover": "standard",
    "container_verify": "standard",
    "charade_verify": "standard",
    "alternation_discover": "standard",
    "double_definition": "double_definition",
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
# DYNAMIC PHASE GENERATION
# =============================================================================

def build_wordplay_overview_phases(step):
    """Build phases for wordplay_overview based on common_vocabulary count."""
    phases = []

    # Normalize common_vocabulary to list
    common_vocab = step.get("common_vocabulary", [])
    if isinstance(common_vocab, dict):
        common_vocab = [common_vocab]

    # Phase for each vocabulary item: tap then type
    for i, vocab in enumerate(common_vocab):
        vocab_num = i + 1
        is_first = i == 0

        # Tap phase
        tap_phase = {
            "id": f"vocabulary_tap_{vocab_num}",
            "actionPrompt": "Tap a word with a common cryptic meaning",
            "panel": {
                "title": "FIND COMMON VOCABULARY",
                "instruction": "Tap another word with a common cryptic meaning." if not is_first else "Tap a word with a common cryptic meaning."
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "BLUE", "role": f"vocabulary_{vocab_num}"}},
            "onWrong": {"message": "Look for a word with a synonym that might appear in your answer."}
        }
        if is_first:
            tap_phase["intro"] = {
                "title": "Wordplay Overview",
                "text": "Now scan the remaining words for:\n\n• Common cryptic vocabulary (words with well-known short meanings)\n• Indicator words (signals for operations like deletion, container, anagram)",
                "example": ""  # Don't give away specific answers
            }
        phases.append(tap_phase)

        # Type phase
        type_phase = {
            "id": f"vocabulary_type_{vocab_num}",
            "actionPrompt": "Type the synonym",
            "panel": {
                "title": "TYPE SYNONYM",
                "instruction": "What's the common cryptic synonym for this word?"
            },
            "inputMode": "text",
            "onCorrect": {"message": "Correct!"},
            "onWrong": {"message": "Think of the common cryptic meaning for this word."}
        }
        phases.append(type_phase)

    # Indicator phases - one at a time
    indicators = step.get("expected_indicators", [])
    num_indicators = len(indicators)
    for i, indicator in enumerate(indicators):
        ind_num = i + 1
        operation = indicator.get("operation", "wordplay")

        if num_indicators == 1:
            instruction = "Which remaining word signals a wordplay operation?"
        elif ind_num == 1:
            instruction = f"There are {num_indicators} indicators. Find the first one."
        else:
            instruction = f"Find indicator {ind_num} of {num_indicators}."

        indicator_phase = {
            "id": f"indicator_tap_{ind_num}",
            "actionPrompt": f"Tap indicator {ind_num}" if num_indicators > 1 else "Tap the indicator",
            "panel": {
                "title": "FIND INDICATOR",
                "instruction": instruction
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "ORANGE", "role": f"indicator_{ind_num}"}},
            "onWrong": {"message": f"Look for a word that signals {operation}."}
        }
        phases.append(indicator_phase)

    # Teaching phase
    teaching_phase = {
        "id": "teaching",
        "actionPrompt": "Continue to next step",
        "panel": {
            "title": "OVERVIEW COMPLETE",
            "instruction": ""  # Built dynamically in get_render
        },
        "inputMode": "none",
        "button": {"label": "Continue →", "action": "next_step"}
    }
    phases.append(teaching_phase)

    return phases

def build_standard_definition_phases(step, clue):
    """Build phases for standard_definition, adding solve phase if recommendedApproach is 'definition'."""
    base_phases = STEP_TEMPLATES["standard_definition"]["phases"].copy()

    # Check if we should add solve phase
    difficulty = clue.get("difficulty", {})
    recommended_approach = difficulty.get("recommendedApproach", "wordplay")

    if recommended_approach == "definition":
        # Insert solve phase after teaching
        solve_phase = {
            "id": "solve",
            "actionPrompt": "Type your answer",
            "intro": {
                "title": "Solve from Definition",
                "text": "The definition is clear enough to guess the answer. What word fits?",
                "example": "Hint: Think of a common word that means the definition you just found."
            },
            "panel": {
                "title": "SOLVE FROM DEFINITION",
                "instruction": "Based on the definition, type your answer."
            },
            "inputMode": "text",
            "onCorrect": {"message": "Correct!"},
            "onWrong": {"message": "Think of a word that matches the definition."}
        }
        # Insert after teaching (index 1), before any next steps
        phases = base_phases[:2] + [solve_phase]
        return phases

    return base_phases

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
        "learnings": [],
        "answer_known": False  # True if user solved from definition (now reviewing wordplay)
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

def get_step_phases(step, clue):
    """Get phases for a step, handling dynamic phase generation."""
    step_type = step.get("type")

    if step_type == "wordplay_overview":
        return build_wordplay_overview_phases(step)
    elif step_type == "standard_definition":
        return build_standard_definition_phases(step, clue)
    else:
        template = STEP_TEMPLATES.get(step_type)
        if template:
            return template["phases"]
        return []

def substitute_variables(text, step, session, clue=None):
    """Replace {variable} placeholders with values from step data."""
    if not isinstance(text, str):
        return text

    subs = {}

    # Handle expected.text for definition
    if "expected" in step and isinstance(step["expected"], dict):
        subs["result"] = step["expected"].get("text", "")
        subs["definition_text"] = step["expected"].get("text", "")

    # Position
    if "position" in step:
        subs["position"] = step["position"]

    # Direct fields
    for key in ["result", "fodder_synonym", "letters_needed", "inner", "outer",
                "letters_so_far", "pattern"]:
        if key in step:
            subs[key] = str(step[key])

    # Handle indicator
    if "indicator" in step:
        ind = step["indicator"]
        if isinstance(ind, dict):
            subs["indicator"] = ind.get("text", "")
        else:
            subs["indicator"] = str(ind)

    # Handle fodder_word
    if "fodder_word" in step:
        fw = step["fodder_word"]
        if isinstance(fw, dict):
            subs["fodder_word"] = fw.get("text", "")
        else:
            subs["fodder_word"] = str(fw)

    # Handle fodder
    if "fodder" in step:
        f = step["fodder"]
        if isinstance(f, dict):
            subs["fodder"] = f.get("text", "")
        else:
            subs["fodder"] = str(f)

    # Handle components for charade_verify
    if "components" in step:
        components = step["components"]
        subs["components_display"] = " + ".join(components)

    # Handle outer_split for container_verify teaching
    if "inner" in step and "outer" in step and "result" in step:
        inner = step["inner"]
        outer = step["outer"]
        result = step["result"]
        # Find where inner fits in result to show split
        inner_upper = inner.upper()
        result_upper = result.upper()
        idx = result_upper.find(inner_upper)
        if idx > 0:
            before = result_upper[:idx]
            after = result_upper[idx + len(inner_upper):]
            subs["outer_split"] = f"{before} + {inner_upper} + {after}"
        else:
            subs["outer_split"] = f"{outer} around {inner}"

    # Handle definitions for double_definition
    if "definitions" in step:
        definitions = step["definitions"]
        if len(definitions) > 0:
            subs["def1"] = definitions[0].get("text", "")
        if len(definitions) > 1:
            subs["def2"] = definitions[1].get("text", "")

    # Get letterCount from clue enumeration
    if clue:
        enumeration = clue.get("clue", {}).get("enumeration", "")
        if enumeration:
            subs["letterCount"] = str(parse_enumeration(enumeration))
            subs["letters_needed"] = str(parse_enumeration(enumeration))

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
    answer = clue.get("clue", {}).get("answer", "")
    enumeration = clue.get("clue", {}).get("enumeration", "")

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
        phases = STEP_TEMPLATES["clue_type_identify"]["phases"]
    else:
        step = steps[session["step_index"]]
        phases = get_step_phases(step, clue)

    if not phases:
        return {"error": f"No phases for step type: {step.get('type')}"}

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
        "learnings": session.get("learnings", []),
        "answerKnown": session.get("answer_known", False)
    }

    # Add step progress (for showing "Step 1 of 3" in UI)
    # Count phases excluding teaching phases
    non_teaching_phases = [p for p in phases if p.get("id") != "teaching"]
    current_phase_num = session["phase_index"] + 1
    total_phases = len(non_teaching_phases)

    # Only show progress for interactive phases (not teaching/complete)
    if phase.get("inputMode") != "none" and total_phases > 1:
        # Find which non-teaching phase we're on
        non_teaching_index = 0
        for i, p in enumerate(phases):
            if p.get("id") == "teaching":
                continue
            if i == session["phase_index"]:
                render["stepProgress"] = {
                    "current": non_teaching_index + 1,
                    "total": total_phases,
                    "label": f"Step {non_teaching_index + 1} of {total_phases}"
                }
                break
            non_teaching_index += 1

    # Add difficulty for clue type identification step
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

    # Special handling for wordplay_overview teaching phase
    if step["type"] == "wordplay_overview" and phase["id"] == "teaching":
        render["panel"]["instruction"] = build_wordplay_teaching(step, clue)

    # Special handling for deletion_discover teaching
    if step["type"] == "deletion_discover" and phase["id"] == "teaching":
        fodder_word = step.get("fodder_word", {}).get("text", "")
        fodder_synonym = step.get("fodder_synonym", "")
        result = step.get("result", "")
        render["panel"]["instruction"] = f"{fodder_word} = {fodder_synonym}, shortened = {result}\n\n**Remember:** Deletion indicators often require finding a synonym first, then shortening it."

    # Special handling for container_verify teaching
    if step["type"] == "container_verify" and phase["id"] == "teaching":
        inner = step.get("inner", "")
        outer = step.get("outer", "")
        result = step.get("result", "")
        # Build the split display
        inner_upper = inner.upper()
        result_upper = result.upper()
        idx = result_upper.find(inner_upper)
        if idx > 0:
            before = result_upper[:idx]
            after = result_upper[idx + len(inner_upper):]
            split_display = f"{before} + {inner_upper} + {after}"
        else:
            split_display = f"{outer} around {inner}"

        definition_text = ""
        if steps and steps[0].get("type") == "standard_definition":
            definition_text = steps[0].get("expected", {}).get("text", "")

        render["panel"]["instruction"] = f"{split_display} = {result} ✓\nDefinition: \"{definition_text}\" = {result} ✓\n\n**Remember:** Container indicators (about, holds, around, inside, carries) tell you to put one piece inside another."

    # Special handling for alternation_discover teaching
    if step["type"] == "alternation_discover" and phase["id"] == "teaching":
        fodder = step.get("fodder", {}).get("text", "")
        result = step.get("result", "")
        pattern = step.get("pattern", "even")

        # Get the previous charade result if available
        charade_result = ""
        for i, s in enumerate(steps):
            if s.get("type") == "charade_verify":
                charade_result = s.get("result", "")
                break

        definition_text = ""
        if steps and steps[0].get("type") == "standard_definition":
            definition_text = steps[0].get("expected", {}).get("text", "")

        final_answer = answer
        render["panel"]["instruction"] = f"Taking alternate letters from {fodder}: {result}\n{charade_result} + {result} = {final_answer} ✓\nDefinition: \"{definition_text}\" = {final_answer} ✓\n\n**Remember:** Alternation indicators (by turns, oddly, evenly, regularly) tell you to take every other letter."

    # Add expected for validation
    if phase.get("inputMode") == "tap_words":
        phase_id = phase["id"]
        if phase_id == "select" and "expected" in step:
            render["expected"] = step["expected"]["indices"]
        elif phase_id.startswith("indicator_tap_"):
            # Get the indicator index
            ind_num = int(phase_id.split("_")[-1])
            indicators = step.get("expected_indicators", [])
            if ind_num <= len(indicators):
                render["expected"] = indicators[ind_num - 1].get("indices", [])
        elif phase_id.startswith("vocabulary_tap_"):
            # Get the vocabulary index
            vocab_num = int(phase_id.split("_")[-1])
            common_vocab = step.get("common_vocabulary", [])
            if isinstance(common_vocab, dict):
                common_vocab = [common_vocab]
            if vocab_num <= len(common_vocab):
                render["expected"] = common_vocab[vocab_num - 1].get("indices", [])
        elif phase_id == "fodder":
            if "fodder_word" in step:
                render["expected"] = step["fodder_word"]["indices"]
            elif "fodder" in step and isinstance(step["fodder"], dict):
                render["expected"] = step["fodder"]["indices"]
        elif phase_id == "first_def" and "definitions" in step:
            render["expected"] = step["definitions"][0]["indices"]
        elif phase_id == "second_def" and "definitions" in step:
            render["expected"] = step["definitions"][1]["indices"]

        # Add autoCheck flag for single-word taps
        if "expected" in render and isinstance(render["expected"], list) and len(render["expected"]) == 1:
            render["autoCheck"] = True
        else:
            render["autoCheck"] = False
    elif phase.get("inputMode") == "text":
        phase_id = phase["id"]
        if phase_id.startswith("vocabulary_type_"):
            vocab_num = int(phase_id.split("_")[-1])
            common_vocab = step.get("common_vocabulary", [])
            if isinstance(common_vocab, dict):
                common_vocab = [common_vocab]
            if vocab_num <= len(common_vocab):
                render["expected"] = common_vocab[vocab_num - 1].get("meaning", "")
        elif phase_id == "result":
            render["expected"] = step.get("result", "")
        elif phase_id == "solve":
            render["expected"] = answer
    elif phase.get("inputMode") == "multiple_choice":
        if "options" in step:
            render["options"] = step["options"]

    return render

def build_wordplay_teaching(step, clue):
    """Build the teaching instruction for wordplay_overview."""
    lines = []

    # Common vocabulary
    common_vocab = step.get("common_vocabulary", [])
    if isinstance(common_vocab, dict):
        common_vocab = [common_vocab]

    total_vocab_letters = 0
    for vocab in common_vocab:
        text = vocab.get("text", "")
        meaning = vocab.get("meaning", "")
        letters = vocab.get("letters", len(meaning))
        total_vocab_letters += letters
        lines.append(f"• {text} = {meaning} ({letters} letters) — your anchor")

    # Indicators
    indicators = step.get("expected_indicators", [])
    for ind in indicators:
        text = ind.get("text", "")
        operation = ind.get("operation", "")
        lines.append(f"• \"{text}\" = {operation} indicator")

    # Letter math
    enumeration = parse_enumeration(clue.get("clue", {}).get("enumeration", "0"))
    letters_needed = enumeration - total_vocab_letters
    lines.append(f"• You have {total_vocab_letters} letters. You need {letters_needed} more.")

    return "\n".join(lines)

# =============================================================================
# INPUT HANDLING
# =============================================================================

def handle_input(clue_id, clue, value):
    """Process user input (tap or text)."""
    session = _sessions.get(clue_id)
    if not session:
        return {"error": "No session"}

    steps = clue.get("steps", [])
    answer = clue.get("clue", {}).get("answer", "")

    # Handle clue type identification step (step_index == -1)
    if session["step_index"] == -1:
        step = build_clue_type_step(clue)
        phases = STEP_TEMPLATES["clue_type_identify"]["phases"]
    else:
        step = steps[session["step_index"]]
        phases = get_step_phases(step, clue)

    phase = phases[session["phase_index"]]

    # Determine expected value
    expected = None
    phase_id = phase["id"]

    if phase.get("inputMode") == "tap_words":
        if phase_id == "select" and "expected" in step:
            expected = step["expected"]["indices"]
        elif phase_id.startswith("indicator_tap_"):
            ind_num = int(phase_id.split("_")[-1])
            indicators = step.get("expected_indicators", [])
            if ind_num <= len(indicators):
                expected = indicators[ind_num - 1].get("indices", [])
        elif phase_id.startswith("vocabulary_tap_"):
            vocab_num = int(phase_id.split("_")[-1])
            common_vocab = step.get("common_vocabulary", [])
            if isinstance(common_vocab, dict):
                common_vocab = [common_vocab]
            if vocab_num <= len(common_vocab):
                expected = common_vocab[vocab_num - 1].get("indices", [])
        elif phase_id == "fodder":
            if "fodder_word" in step:
                expected = step["fodder_word"]["indices"]
            elif "fodder" in step and isinstance(step["fodder"], dict):
                expected = step["fodder"]["indices"]
        elif phase_id == "first_def" and "definitions" in step:
            expected = step["definitions"][0]["indices"]
        elif phase_id == "second_def" and "definitions" in step:
            expected = step["definitions"][1]["indices"]
    elif phase.get("inputMode") == "text":
        if phase_id.startswith("vocabulary_type_"):
            vocab_num = int(phase_id.split("_")[-1])
            common_vocab = step.get("common_vocabulary", [])
            if isinstance(common_vocab, dict):
                common_vocab = [common_vocab]
            if vocab_num <= len(common_vocab):
                expected = common_vocab[vocab_num - 1].get("meaning", "").upper()
        elif phase_id == "result":
            expected = step.get("result", "").upper()
        elif phase_id == "solve":
            expected = answer.upper()
    elif phase.get("inputMode") == "multiple_choice":
        if "options" in step:
            for i, opt in enumerate(step["options"]):
                if opt.get("correct"):
                    expected = i
                    break

    # Check answer
    correct = False
    if phase.get("inputMode") == "tap_words":
        if isinstance(value, list) and isinstance(expected, list):
            correct = set(value) == set(expected)
    elif phase.get("inputMode") == "text":
        if isinstance(value, str) and expected:
            user_letters = re.sub(r'[^A-Z]', '', value.upper())
            expected_letters = re.sub(r'[^A-Z]', '', expected)
            correct = user_letters == expected_letters
    elif phase.get("inputMode") == "multiple_choice":
        correct = value == expected

    if correct:
        # Add highlight if specified
        if "onCorrect" in phase and "highlight" in phase["onCorrect"]:
            highlight_indices = expected if isinstance(expected, list) else []
            session["highlights"].append({
                "indices": highlight_indices,
                "color": phase["onCorrect"]["highlight"]["color"],
                "role": phase["onCorrect"]["highlight"].get("role", "")
            })

        # Check if this is a solve phase (definition approach)
        if phase_id == "solve" and step["type"] == "standard_definition":
            # User solved from definition - continue to wordplay steps for review
            # Advance past the standard_definition step to the next step
            session["step_index"] += 1
            session["phase_index"] = 0
            session["answer_known"] = True  # Flag that user already knows answer
            return {
                "correct": True,
                "render": get_render(clue_id, clue)
            }

        # Advance to next phase
        session["phase_index"] += 1
        if session["phase_index"] >= len(phases):
            session["step_index"] += 1
            session["phase_index"] = 0

        return {
            "correct": True,
            "render": get_render(clue_id, clue)
        }
    else:
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
        phases = STEP_TEMPLATES["clue_type_identify"]["phases"]
    else:
        step = steps[session["step_index"]]
        phases = get_step_phases(step, clue)

    phase = phases[session["phase_index"]]

    # If this is a teaching phase, capture the learning
    if phase["id"] == "teaching" and "panel" in phase:
        learning_text = substitute_variables(phase["panel"].get("instruction", ""), step, session, clue)

        # Apply special handling for various step types
        if step["type"] == "wordplay_overview":
            learning_text = build_wordplay_teaching(step, clue)
        elif step["type"] == "deletion_discover":
            fodder_word = step.get("fodder_word", {}).get("text", "")
            fodder_synonym = step.get("fodder_synonym", "")
            result = step.get("result", "")
            learning_text = f"{fodder_word} = {fodder_synonym}, shortened = {result}\n\n**Remember:** Deletion indicators often require finding a synonym first, then shortening it."
        elif step["type"] == "container_verify":
            inner = step.get("inner", "")
            result = step.get("result", "")
            inner_upper = inner.upper()
            result_upper = result.upper()
            idx = result_upper.find(inner_upper)
            if idx > 0:
                before = result_upper[:idx]
                after = result_upper[idx + len(inner_upper):]
                split_display = f"{before} + {inner_upper} + {after}"
            else:
                split_display = f"{step.get('outer', '')} around {inner}"

            definition_text = ""
            if steps and steps[0].get("type") == "standard_definition":
                definition_text = steps[0].get("expected", {}).get("text", "")

            learning_text = f"{split_display} = {result} ✓\nDefinition: \"{definition_text}\" = {result} ✓\n\n**Remember:** Container indicators (about, holds, around, inside, carries) tell you to put one piece inside another."
        elif step["type"] == "alternation_discover":
            fodder = step.get("fodder", {}).get("text", "")
            result = step.get("result", "")
            charade_result = ""
            for s in steps:
                if s.get("type") == "charade_verify":
                    charade_result = s.get("result", "")
                    break
            definition_text = ""
            if steps and steps[0].get("type") == "standard_definition":
                definition_text = steps[0].get("expected", {}).get("text", "")
            final_answer = clue.get("clue", {}).get("answer", "")
            learning_text = f"Taking alternate letters from {fodder}: {result}\n{charade_result} + {result} = {final_answer} ✓\nDefinition: \"{definition_text}\" = {final_answer} ✓\n\n**Remember:** Alternation indicators (by turns, oddly, evenly, regularly) tell you to take every other letter."

        if learning_text:
            learning_title = substitute_variables(phase["panel"].get("title", ""), step, session, clue)
            session["learnings"].append({
                "title": learning_title,
                "text": learning_text
            })

    # Advance to next phase
    session["phase_index"] += 1
    if session["phase_index"] >= len(phases):
        session["step_index"] += 1
        session["phase_index"] = 0

    return get_render(clue_id, clue)

def get_all_learnings(clue):
    """Generate all learnings for a clue (used when user solves early)."""
    learnings = []
    steps = clue.get("steps", [])
    answer = clue.get("clue", {}).get("answer", "")

    for step in steps:
        step_type = step.get("type")

        if step_type == "standard_definition":
            definition_text = step.get("expected", {}).get("text", "")
            position = step.get("position", "")
            learnings.append({
                "title": "DEFINITION FOUND",
                "text": f"\"{definition_text}\" is the definition (at {position})."
            })

        elif step_type == "wordplay_overview":
            learnings.append({
                "title": "WORDPLAY OVERVIEW",
                "text": build_wordplay_teaching(step, clue)
            })

        elif step_type == "deletion_discover":
            fodder_word = step.get("fodder_word", {}).get("text", "")
            fodder_synonym = step.get("fodder_synonym", "")
            result = step.get("result", "")
            learnings.append({
                "title": "DELETION",
                "text": f"{fodder_word} = {fodder_synonym}, shortened = {result}\n\n**Remember:** Deletion indicators often require finding a synonym first, then shortening it."
            })

        elif step_type == "container_verify":
            inner = step.get("inner", "")
            result = step.get("result", "")
            inner_upper = inner.upper()
            result_upper = result.upper()
            idx = result_upper.find(inner_upper)
            if idx > 0:
                before = result_upper[:idx]
                after = result_upper[idx + len(inner_upper):]
                split_display = f"{before} + {inner_upper} + {after}"
            else:
                split_display = f"{step.get('outer', '')} around {inner}"

            definition_text = ""
            if steps and steps[0].get("type") == "standard_definition":
                definition_text = steps[0].get("expected", {}).get("text", "")

            learnings.append({
                "title": "CONTAINER",
                "text": f"{split_display} = {result} ✓\nDefinition: \"{definition_text}\" = {result} ✓\n\n**Remember:** Container indicators (about, holds, around, inside, carries) tell you to put one piece inside another."
            })

        elif step_type == "charade_verify":
            components = step.get("components", [])
            result = step.get("result", "")
            letters_so_far = step.get("letters_so_far", len(result))
            letters_needed = step.get("letters_needed", parse_enumeration(clue.get("clue", {}).get("enumeration", "0")))
            components_display = " + ".join(components)
            learnings.append({
                "title": "CHARADE",
                "text": f"{components_display} = {result} ({letters_so_far} of {letters_needed} letters)"
            })

        elif step_type == "alternation_discover":
            fodder = step.get("fodder", {}).get("text", "")
            result = step.get("result", "")
            charade_result = ""
            for s in steps:
                if s.get("type") == "charade_verify":
                    charade_result = s.get("result", "")
                    break
            definition_text = ""
            if steps and steps[0].get("type") == "standard_definition":
                definition_text = steps[0].get("expected", {}).get("text", "")
            learnings.append({
                "title": "ALTERNATION",
                "text": f"Taking alternate letters from {fodder}: {result}\n{charade_result} + {result} = {answer} ✓\nDefinition: \"{definition_text}\" = {answer} ✓\n\n**Remember:** Alternation indicators (by turns, oddly, evenly, regularly) tell you to take every other letter."
            })

        elif step_type == "double_definition":
            definitions = step.get("definitions", [])
            def1 = definitions[0].get("text", "") if len(definitions) > 0 else ""
            def2 = definitions[1].get("text", "") if len(definitions) > 1 else ""
            result = step.get("result", "")
            learnings.append({
                "title": "DOUBLE DEFINITION",
                "text": f"Both \"{def1}\" and \"{def2}\" define {result}. No wordplay needed!"
            })

    return learnings
