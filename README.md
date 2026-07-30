# claude-skills

A directory of Claude skills and the conditioning patterns used to tune them.

## Run it

```bash
pip install -r requirements.txt
python server.py
```

Then open http://localhost:5050.

The server serves the frontend from `web/` and a small JSON-backed REST API
under `/api`. Skill data lives in `data/skills.json` and is read/written on
every request — no separate database.

## API

| Method | Path                | Description                          |
|--------|---------------------|--------------------------------------|
| GET    | `/api/categories`   | List available skill categories      |
| GET    | `/api/skills`       | List all skills                      |
| GET    | `/api/skills/<slug>`| Get one skill                        |
| POST   | `/api/skills`       | Create a skill (`name`, `category`, `trigger`, `description`) |
| PUT    | `/api/skills/<slug>`| Update a skill (partial payload OK)  |
| DELETE | `/api/skills/<slug>`| Delete a skill                       |

`category` must be one of the ids returned by `/api/categories`. Errors come
back as `{"error": "..."}` or `{"errors": ["...", ...]}` with a 4xx status.

## Layout

```
server.py        Flask app + API
data/skills.json seed data / runtime store
web/              static frontend (index.html, styles.css, app.js)
render.yaml       Render deployment config
```

## Deploy (Render)

1. Push this repo to GitHub (already connected to `origin`).
2. In the Render dashboard: **New > Blueprint**, point it at this repo.
   Render reads `render.yaml` and provisions the web service automatically
   (build: `pip install -r requirements.txt`, start: `gunicorn server:app`).
3. Deploy. Render assigns a `https://<service-name>.onrender.com` URL.

Note: `data/skills.json` lives on the instance's local disk. Render's free
tier has an ephemeral filesystem, so **edits made through the UI will be
lost on the next deploy or restart** — every deploy resets to the
`data/skills.json` checked into the repo. That's fine for an MVP demo; if
you need edits to persist, add a paid persistent disk in the Render
dashboard (or move storage to a real database) later.
