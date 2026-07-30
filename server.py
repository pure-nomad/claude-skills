"""claude-skills API server.

Serves the static frontend from web/ and a small JSON-backed REST API
for browsing and editing the skill catalog under /api.
"""

import json
import re
import threading
from pathlib import Path

from flask import Flask, jsonify, request, abort

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "skills.json"
WEB_DIR = BASE_DIR / "web"

CATEGORIES = [
    {"id": "design", "label": "design"},
    {"id": "workflow", "label": "workflow"},
    {"id": "dev-tools", "label": "dev-tools"},
    {"id": "automation", "label": "automation"},
    {"id": "docs", "label": "docs"},
]
CATEGORY_IDS = {c["id"] for c in CATEGORIES}

FIELD_LIMITS = {
    "name": 80,
    "trigger": 140,
    "description": 400,
}

_lock = threading.Lock()

app = Flask(__name__, static_folder=str(WEB_DIR), static_url_path="")


def load_skills():
    if not DATA_FILE.exists():
        return []
    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_skills(skills):
    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(skills, f, indent=2, ensure_ascii=False)
        f.write("\n")


def slugify(name):
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "skill"


def unique_slug(base, existing_slugs):
    if base not in existing_slugs:
        return base
    n = 2
    while f"{base}-{n}" in existing_slugs:
        n += 1
    return f"{base}-{n}"


def validate_payload(payload, partial=False):
    """Returns a list of error strings. `partial` allows omitted fields on update."""
    errors = []
    for field in ("name", "category", "trigger", "description"):
        if field not in payload:
            if not partial:
                errors.append(f"'{field}' is required")
            continue
        value = payload[field]
        if not isinstance(value, str) or not value.strip():
            errors.append(f"'{field}' must be a non-empty string")
            continue
        limit = FIELD_LIMITS.get(field)
        if limit and len(value) > limit:
            errors.append(f"'{field}' must be {limit} characters or fewer")
    if "category" in payload and payload["category"] not in CATEGORY_IDS:
        errors.append(f"'category' must be one of: {', '.join(sorted(CATEGORY_IDS))}")
    return errors


def public_fields(payload):
    return {k: payload[k].strip() if isinstance(payload[k], str) else payload[k]
            for k in ("name", "category", "trigger", "description") if k in payload}


# ---------- static frontend ----------

@app.get("/")
def index():
    return app.send_static_file("index.html")


# ---------- API ----------

@app.get("/api/categories")
def get_categories():
    return jsonify(CATEGORIES)


@app.get("/api/skills")
def list_skills():
    with _lock:
        return jsonify(load_skills())


@app.get("/api/skills/<slug>")
def get_skill(slug):
    with _lock:
        skills = load_skills()
    skill = next((s for s in skills if s["slug"] == slug), None)
    if skill is None:
        abort(404, description="skill not found")
    return jsonify(skill)


@app.post("/api/skills")
def create_skill():
    payload = request.get_json(silent=True) or {}
    errors = validate_payload(payload)
    if errors:
        return jsonify({"errors": errors}), 400

    with _lock:
        skills = load_skills()
        existing_slugs = {s["slug"] for s in skills}
        slug = unique_slug(slugify(payload["name"]), existing_slugs)
        skill = {"slug": slug, **public_fields(payload)}
        skills.append(skill)
        save_skills(skills)

    return jsonify(skill), 201


@app.put("/api/skills/<slug>")
def update_skill(slug):
    payload = request.get_json(silent=True) or {}
    errors = validate_payload(payload, partial=True)
    if errors:
        return jsonify({"errors": errors}), 400

    with _lock:
        skills = load_skills()
        skill = next((s for s in skills if s["slug"] == slug), None)
        if skill is None:
            abort(404, description="skill not found")
        skill.update(public_fields(payload))
        save_skills(skills)

    return jsonify(skill)


@app.delete("/api/skills/<slug>")
def delete_skill(slug):
    with _lock:
        skills = load_skills()
        remaining = [s for s in skills if s["slug"] != slug]
        if len(remaining) == len(skills):
            abort(404, description="skill not found")
        save_skills(remaining)

    return "", 204


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": getattr(e, "description", "not found")}), 404
    return e


@app.errorhandler(400)
def bad_request(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": getattr(e, "description", "bad request")}), 400
    return e


if __name__ == "__main__":
    # 5000 collides with macOS AirPlay Receiver by default; 5050 avoids it.
    app.run(debug=True, port=5050)
