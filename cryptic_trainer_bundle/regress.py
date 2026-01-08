
#!/usr/bin/env python3
"""
Regression runner for cryptic_trainer.

Reads a JSONL or JSON file containing regression cases:
- clue
- length
- known_answer (optional)
- expected_method (optional: method names)
- expected_patternData (optional: patternData field expectations)

Runs cryptic_trainer.py and checks expectations.
"""
import json, subprocess, sys, pathlib

HERE = pathlib.Path(__file__).parent
SOLVER = HERE / "cryptic_trainer.py"

def load_cases(path):
    txt = path.read_text(encoding="utf-8").strip()
    if txt.startswith("["):
        return json.loads(txt)
    return [json.loads(l) for l in txt.splitlines() if l.strip()]

def check_pattern_data(expected_pd: dict, actual_pd: dict) -> list:
    """
    Check patternData fields against expectations.
    Returns list of failure messages (empty if all pass).
    """
    failures = []

    # Check top-level fields
    for field in ["patternId", "answer", "isComplete", "definitionText", "definitionPosition"]:
        if field in expected_pd:
            exp_val = expected_pd[field]
            got_val = actual_pd.get(field)
            if exp_val != got_val:
                failures.append(f"patternData.{field}: expected {exp_val!r}, got {got_val!r}")

    # Check techniquesUsed (if specified, must be subset)
    if "techniquesUsed" in expected_pd:
        exp_techniques = set(expected_pd["techniquesUsed"])
        got_techniques = set(actual_pd.get("techniquesUsed", []))
        missing = exp_techniques - got_techniques
        if missing:
            failures.append(f"patternData.techniquesUsed: missing {missing}")

    # Check wordplaySteps count
    if "wordplayStepsCount" in expected_pd:
        exp_count = expected_pd["wordplayStepsCount"]
        got_count = len(actual_pd.get("wordplaySteps", []))
        if exp_count != got_count:
            failures.append(f"patternData.wordplaySteps: expected {exp_count} steps, got {got_count}")

    # Check wordplaySteps types (first N steps should match)
    if "wordplayStepTypes" in expected_pd:
        exp_types = expected_pd["wordplayStepTypes"]
        got_steps = actual_pd.get("wordplaySteps", [])
        got_types = [s.get("stepType") for s in got_steps]
        for i, exp_type in enumerate(exp_types):
            if i < len(got_types):
                if got_types[i] != exp_type:
                    failures.append(f"patternData.wordplaySteps[{i}].stepType: expected {exp_type!r}, got {got_types[i]!r}")
            else:
                failures.append(f"patternData.wordplaySteps[{i}].stepType: expected {exp_type!r}, but step missing")

    # Check solveExplanation count
    if "solveExplanationCount" in expected_pd:
        exp_count = expected_pd["solveExplanationCount"]
        got_count = len(actual_pd.get("solveExplanation", []))
        if exp_count != got_count:
            failures.append(f"patternData.solveExplanation: expected {exp_count} blocks, got {got_count}")

    # Check setterHint contains expected substrings
    if "setterHintContains" in expected_pd:
        setter_hint = actual_pd.get("setterHint", "")
        for substring in expected_pd["setterHintContains"]:
            if substring not in setter_hint:
                failures.append(f"patternData.setterHint: missing substring {substring!r}")

    return failures

def main():
    if len(sys.argv) < 2:
        print("usage: python regress.py cases.json")
        sys.exit(1)

    cases = load_cases(pathlib.Path(sys.argv[1]))
    total = len(cases)
    passed = 0

    for i, c in enumerate(cases, 1):
        clue = c["clue"]
        length = c["length"]
        known = c.get("known_answer")
        expected_method = c.get("expected_method")
        expected = c.get("expected")
        expected_pattern_data = c.get("expected_patternData")
        training_json = c.get("training_json")

        proc = subprocess.run(
            ["python3", str(SOLVER), "solve", "--clue", clue, "--length", str(length)]
            + (["--known-answer", known] if known else [])
            + (["--training-json", training_json] if training_json else []),
            capture_output=True, text=True
        )
        out = json.loads(proc.stdout)

        answers = [cand["answer"] for cand in out["candidates"]]
        methods = {cand.get("method") for cand in out["candidates"]}
        pattern_data = out.get("patternData", {})

        ok = True
        pattern_data_failures = []

        if known and known not in answers:
            ok = False
        if expected_method and expected_method not in methods:
            ok = False

        # New schema-aware expectations (minimal v1 checks)
        if expected is not None:
            exp_clue = expected.get("clue", {})
            if exp_clue.get("text") and exp_clue.get("text") != clue:
                ok = False
            if isinstance(exp_clue.get("length"), int) and exp_clue.get("length") != length:
                ok = False
            exp_primary = (expected.get("analysis", {}).get("clue_type", {}) or {}).get("primary")
            if exp_primary is not None:
                got_primary = (out.get("analysis", {}).get("clue_type", {}) or {}).get("primary")
                if got_primary != exp_primary:
                    ok = False
            exp_cands = expected.get("candidates") or []
            if exp_cands:
                exp_answers = {ec.get("answer") for ec in exp_cands if isinstance(ec, dict)}
                if exp_answers and not (exp_answers & set(answers)):
                    ok = False

        # Check patternData expectations
        if expected_pattern_data is not None:
            pattern_data_failures = check_pattern_data(expected_pattern_data, pattern_data)
            if pattern_data_failures:
                ok = False

        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {i}/{total} {clue}")
        if not ok:
            print("  expected_answer:", known)
            if expected_method:
                print("  expected_method:", expected_method)
            print("  got_answers:", answers[:10])
            print("  got_methods:", sorted(m for m in methods if m))

            # Show patternData failures
            if pattern_data_failures:
                print("  patternData failures:")
                for f in pattern_data_failures:
                    print(f"    - {f}")

            # Show patternData summary
            print(f"  patternData.patternId: {pattern_data.get('patternId')}")
            print(f"  patternData.answer: {pattern_data.get('answer')}")
            print(f"  patternData.isComplete: {pattern_data.get('isComplete')}")
            print(f"  patternData.techniquesUsed: {pattern_data.get('techniquesUsed')}")

            # Show the best trace we have:
            # 1) If the known answer exists in candidates, print its steps.
            # 2) Otherwise print the top 3 candidates with their steps (if any).
            def _print_steps(label, cand):
                print(f"  trace_for: {label}  method={cand.get('method')}  score={cand.get('score')}")
                steps = cand.get("steps") or []
                if not steps:
                    print("    (no steps)")
                    return
                for s in steps:
                    op = s.get("op")
                    src = s.get("src")
                    outv = s.get("out")
                    note = s.get("note")
                    print(f"    - {op}: {src} -> {outv}" + (f"  ({note})" if note else ""))

            cand_by_answer = {c.get("answer"): c for c in out.get("candidates", []) if isinstance(c, dict)}
            if known and known in cand_by_answer:
                _print_steps("KNOWN_ANSWER", cand_by_answer[known])
            else:
                top = out.get("candidates", [])[:3]
                for idx, cand in enumerate(top, 1):
                    _print_steps(f"TOP_{idx}", cand)
        passed += int(ok)


    print(f"\nSummary: {passed}/{total} passed")
if __name__ == "__main__":
    main()
