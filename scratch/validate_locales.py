import json
import os
import re

locales_dir = r'c:\Users\Roy\Dev\Personal\ai-sidebar\_locales'
key_pattern = re.compile(r'^[a-z0-9_]+$')

errors = []

for root, dirs, files in os.walk(locales_dir):
    for file in files:
        if file == 'messages.json':
            path = os.path.join(root, file)
            print(f"Checking {path}...")
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for key in data.keys():
                        if not key_pattern.match(key):
                            errors.append(f"Invalid key '{key}' in {path}")
            except Exception as e:
                errors.append(f"Error reading {path}: {e}")

if errors:
    print("\n".join(errors))
else:
    print("All keys are valid!")
