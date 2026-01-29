#!/usr/bin/env python3
"""Find clues with reported issues in the database."""

import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'clues_db.json')

def main():
    with open(DB_PATH, 'r') as f:
        db = json.load(f)

    items = db.get('training_items', {})
    issues = []

    for clue_id, item in items.items():
        if item.get('reported_issue'):
            issues.append({
                'id': clue_id,
                'clue': item.get('clue', {}).get('text', ''),
                'answer': item.get('clue', {}).get('answer', ''),
                'issue': item['reported_issue']
            })

    if not issues:
        print("No clues with reported issues found.")
        return

    print(f"Found {len(issues)} clue(s) with reported issues:\n")
    for i, item in enumerate(issues, 1):
        print(f"{i}. {item['id']}")
        print(f"   Clue: {item['clue']}")
        print(f"   Answer: {item['answer']}")
        print(f"   Issue: {item['issue']}")
        print()

if __name__ == '__main__':
    main()
