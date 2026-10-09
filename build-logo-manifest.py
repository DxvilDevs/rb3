#!/usr/bin/env python3
"""Generate logos/manifest.json from image files in this folder."""
from pathlib import Path
import json
import re

LOGO_DIR = Path(__file__).resolve().parent / "logos"
OUTPUT = LOGO_DIR / "manifest.json"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif"}

def display_name(filename: str) -> str:
    stem = Path(filename).stem
    return re.sub(r"[-_]+", " ", stem).strip().title()

logos = []
for path in sorted(LOGO_DIR.iterdir(), key=lambda p: p.name.lower()):
    if path.is_file() and path.suffix.lower() in EXTENSIONS and path.name != OUTPUT.name:
        logos.append({
            "name": display_name(path.name),
            "src": f"logos/{path.name}"
        })

OUTPUT.write_text(json.dumps(logos, indent=2) + "\\n", encoding="utf-8")
print(f"Wrote {len(logos)} logo(s) to {OUTPUT.relative_to(Path.cwd()) if OUTPUT.is_relative_to(Path.cwd()) else OUTPUT}")
