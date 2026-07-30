// ---------------------------------------------------------
// claude-skills — API-backed frontend (no build step)
// ---------------------------------------------------------

const API_BASE = "/api";

const COMMANDS = [
  { key: "/context", description: "Show current context window usage and a breakdown of what's filling it." },
  { key: "/model", description: "Switch the active model for this session — see models below." },
  { key: "/effort", description: "Set reasoning effort (low / medium / high / xhigh / max) for the current session." },
  { key: "⌥T", description: "Toggle extended thinking on for the next turn." },
  { key: "/skills", description: "List the skills available in this session." },
  { key: "/clear", description: "Start a fresh conversation and drop prior context." },
  { key: "/compact", description: "Summarize and compact the conversation to free up context space." },
  { key: "/help", description: "Show all available commands." },
];

const MODELS = [
  { name: "Opus 5", description: "Deep reasoning for complex engines, coding, cowork tasks." },
  { name: "Sonnet 5", description: "Perfect balance for agentic work, visual design, and cowork tasks." },
  { name: "Haiku 4.5", description: "Best balance for agentic work and visual design." },
];

const PATTERNS = [
  { id: "role-priming", title: "Role priming",
    description: "Anchor the assistant to a specific persona or field of expertise before stating the task, so its defaults — tone, rigor, what it treats as obvious — shift toward that role.",
    snippet: `Approach this as {{a security auditor reviewing production\ncode for a bank}}.\n\n{{task instructions follow, unchanged}}` },
  { id: "few-shot-anchoring", title: "Few-shot anchoring",
    description: "Show 2–3 worked input → output examples ahead of the real task so format and reasoning style transfer without spelling out explicit rules.",
    snippet: `Input: {{example input 1}}\nOutput: {{example output 1}}\n\nInput: {{example input 2}}\nOutput: {{example output 2}}\n\nInput: {{real task}}\nOutput:` },
  { id: "ask-user-question", title: "AskUserQuestion checkpoints",
    description: "Reach for the AskUserQuestion tool at genuine forks instead of guessing or free-texting a question — it presents structured, clickable options so the user decides in one click rather than parsing a paragraph. Applies at whichever phase of the task actually hits a fork.",
    snippet: `Pause and ask when:\n{{scope is ambiguous}} at the start — requirements admit\nmore than one valid reading\n{{a real design fork appears}} mid-build — two approaches\nare equally reasonable\n{{an action is destructive or hard to reverse}} — before\nexecuting it\n{{the output shape is unspecified}} — before finalizing\n\nOtherwise: decide and keep moving. Don't ask what you can infer.` },
  { id: "project-tracking-docs", title: "Project tracking docs",
    description: "At the start of a feature, fix, or refactor, check for (or set up) a PLAN/BUGFIX-style tracking doc, then keep it updated automatically as work lands — without being asked each time.",
    snippet: `At the start of implementation work:\n{{look for an existing PLAN.md / BUGFIX.md in the repo}}\n{{if none exists, create one with scope and open questions}}\n{{update it as each step lands, unprompted}}` },
];

const HERO_EXAMPLES = [
  { prompt: "make a chart of quarterly revenue", matches: ["dataviz"] },
  { prompt: "clean up this diff before I merge it", matches: ["simplify", "code-review"] },
  { prompt: "check this deploy every 5 minutes", matches: ["loop"] },
  { prompt: "allow npm commands without prompting", matches: ["update-config"] },
];

// ---------- state ----------

let SKILLS = [];
let CATEGORIES = [];
let activeView = "skills";
let activeCategory = "all";
let searchQuery = "";
let editingSlug = null; // null = create mode, otherwise editing this slug
let deleteArmedSlug = null; // slug currently showing the "confirm delete" state

// ---------- utilities ----------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body && (body.errors ? body.errors.join("; ") : body.error)) || res.statusText;
    throw new Error(message);
  }
  return body;
}

// ---------- render: skills ----------

function categoryCounts() {
  const counts = { all: SKILLS.length };
  for (const s of SKILLS) counts[s.category] = (counts[s.category] || 0) + 1;
  return counts;
}

function renderCategoryRail() {
  const counts = categoryCounts();
  const list = document.getElementById("categoryList");
  list.innerHTML = "";
  const allCats = [{ id: "all", label: "." }, ...CATEGORIES];
  for (const cat of allCats) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "rail-item" + (cat.id === activeCategory ? " is-active" : "");
    btn.innerHTML = `<span>${escapeHtml(cat.label)}</span><span class="count">${counts[cat.id] || 0}</span>`;
    btn.addEventListener("click", () => {
      activeCategory = cat.id;
      renderCategoryRail();
      renderSkills();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function matchesQuery(skill, query) {
  if (!query) return true;
  const haystack = `${skill.name} ${skill.description} ${skill.trigger}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderSkills() {
  const grid = document.getElementById("skillGrid");
  const empty = document.getElementById("emptyState");
  const count = document.getElementById("resultCount");

  const filtered = SKILLS.filter(
    (s) => (activeCategory === "all" || s.category === activeCategory) && matchesQuery(s, searchQuery)
  );

  grid.innerHTML = "";
  for (const s of filtered) {
    const card = document.createElement("article");
    card.className = "card";
    const isArmed = deleteArmedSlug === s.slug;
    card.innerHTML = `
      <p class="card-path"><span class="slash">skills/</span>${escapeHtml(s.name)}</p>
      <h3 class="card-name">${escapeHtml(s.name)}</h3>
      <p class="card-desc">${escapeHtml(s.description)}</p>
      <div class="card-footer">
        <span class="badge">${escapeHtml(s.category)}</span>
        <span class="card-trigger">on: ${escapeHtml(s.trigger)}</span>
      </div>
      <div class="card-actions">
        <button class="icon-btn" type="button" data-action="edit" data-slug="${escapeHtml(s.slug)}">edit</button>
        <button class="icon-btn ${isArmed ? "is-armed" : ""}" type="button" data-action="delete" data-slug="${escapeHtml(s.slug)}">${isArmed ? "confirm rm?" : "delete"}</button>
      </div>
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.slug));
  });
  grid.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteClick(btn.dataset.slug));
  });

  empty.hidden = filtered.length !== 0;
  grid.hidden = filtered.length === 0;
  count.textContent = `${filtered.length} of ${SKILLS.length}`;
}

async function handleDeleteClick(slug) {
  if (deleteArmedSlug !== slug) {
    deleteArmedSlug = slug;
    renderSkills();
    setTimeout(() => {
      if (deleteArmedSlug === slug) {
        deleteArmedSlug = null;
        renderSkills();
      }
    }, 3000);
    return;
  }

  deleteArmedSlug = null;
  try {
    await api(`/skills/${encodeURIComponent(slug)}`, { method: "DELETE" });
    SKILLS = SKILLS.filter((s) => s.slug !== slug);
    renderCategoryRail();
    renderSkills();
  } catch (err) {
    showLoadState(`couldn't delete: ${err.message}`, true);
  }
}

// ---------- render: patterns ----------

function highlightSnippet(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\{\{([^}]+)\}\}/g, '<span class="kw">$1</span>');
}

function renderPatternIndex() {
  const list = document.getElementById("patternIndex");
  list.innerHTML = "";
  const anchors = [
    { id: "commands", label: "#commands" },
    { id: "models", label: "#models" },
    ...PATTERNS.map((p) => ({ id: p.id, label: `#${p.id}` })),
  ];
  for (const a of anchors) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = "rail-item";
    link.href = `#${a.id}`;
    link.innerHTML = `<span>${escapeHtml(a.label)}</span>`;
    li.appendChild(link);
    list.appendChild(li);
  }
}

function copyText(button, text) {
  navigator.clipboard?.writeText(text).catch(() => {});
  const original = button.textContent;
  button.classList.add("is-copied");
  button.textContent = "copied";
  setTimeout(() => {
    button.classList.remove("is-copied");
    button.textContent = original;
  }, 1200);
}

function renderCommands() {
  const container = document.getElementById("commands");
  container.innerHTML = `
    <div class="pattern-head">
      <span class="pattern-id">#commands</span>
      <h3 class="pattern-title">Commands</h3>
    </div>
    <p class="pattern-desc">Reach for these before reaching for a longer prompt.</p>
    <div class="ref-list">
      ${COMMANDS.map(
        (c) => `
        <div class="ref-row">
          <button type="button" class="ref-key" data-copy="${escapeHtml(c.key)}">${escapeHtml(c.key)}</button>
          <span class="ref-desc">${escapeHtml(c.description)}</span>
        </div>`
      ).join("")}
    </div>
  `;
  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn, btn.dataset.copy));
  });
}

function renderModels() {
  const container = document.getElementById("models");
  container.innerHTML = `
    <div class="pattern-head">
      <span class="pattern-id">#models</span>
      <h3 class="pattern-title">Models</h3>
    </div>
    <p class="pattern-desc">What <code>/model</code> lets you switch between.</p>
    <div class="ref-list">
      ${MODELS.map(
        (m) => `
        <div class="ref-row">
          <span class="ref-key ref-key--static">${escapeHtml(m.name)}</span>
          <span class="ref-desc">${escapeHtml(m.description)}</span>
        </div>`
      ).join("")}
    </div>
  `;
}

function renderPatterns() {
  const container = document.getElementById("patternList");
  container.innerHTML = "";
  for (const p of PATTERNS) {
    const card = document.createElement("article");
    card.className = "pattern-card";
    card.id = p.id;
    card.innerHTML = `
      <div class="pattern-head">
        <span class="pattern-id">#${p.id}</span>
        <h3 class="pattern-title">${escapeHtml(p.title)}</h3>
      </div>
      <p class="pattern-desc">${escapeHtml(p.description)}</p>
      <div class="snippet">
        <pre>${highlightSnippet(p.snippet)}</pre>
        <button class="copy-btn" type="button" data-snippet="${encodeURIComponent(p.snippet)}">copy</button>
      </div>
    `;
    container.appendChild(card);
  }

  container.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = decodeURIComponent(btn.dataset.snippet).replace(/\{\{|\}\}/g, "");
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        // clipboard API unavailable — silently ignore, button still gives feedback
      }
      btn.textContent = "copied";
      btn.classList.add("is-copied");
      setTimeout(() => {
        btn.textContent = "copy";
        btn.classList.remove("is-copied");
      }, 1400);
    });
  });
}

// ---------- view switching ----------

function setView(view) {
  activeView = view;

  document.getElementById("tab-skills").classList.toggle("is-active", view === "skills");
  document.getElementById("tab-skills").setAttribute("aria-selected", String(view === "skills"));
  document.getElementById("tab-patterns").classList.toggle("is-active", view === "patterns");
  document.getElementById("tab-patterns").setAttribute("aria-selected", String(view === "patterns"));

  document.getElementById("viewSkills").hidden = view !== "skills";
  document.getElementById("railSkills").hidden = view !== "skills";
  document.getElementById("viewPatterns").hidden = view !== "patterns";
  document.getElementById("railPatterns").hidden = view !== "patterns";
  document.getElementById("hero").hidden = view !== "skills";
}

// ---------- loading / error banner ----------

function showLoadState(message, isError) {
  const el = document.getElementById("loadState");
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("is-error", Boolean(isError));
}

// ---------- modal (create / edit) ----------

function openModal(slug) {
  editingSlug = slug || null;
  const form = document.getElementById("skillForm");
  const title = document.getElementById("modalTitle");
  const errorEl = document.getElementById("formError");
  errorEl.hidden = true;
  form.reset();

  const categorySelect = document.getElementById("fieldCategory");
  categorySelect.innerHTML = CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`
  ).join("");

  if (editingSlug) {
    const skill = SKILLS.find((s) => s.slug === editingSlug);
    title.textContent = `edit skills/${skill.name}`;
    document.getElementById("fieldName").value = skill.name;
    document.getElementById("fieldCategory").value = skill.category;
    document.getElementById("fieldTrigger").value = skill.trigger;
    document.getElementById("fieldDescription").value = skill.description;
  } else {
    title.textContent = "new skill";
  }

  document.getElementById("modalOverlay").hidden = false;
  document.getElementById("fieldName").focus();
}

function closeModal() {
  document.getElementById("modalOverlay").hidden = true;
  editingSlug = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById("formError");
  errorEl.hidden = true;

  const payload = {
    name: document.getElementById("fieldName").value.trim(),
    category: document.getElementById("fieldCategory").value,
    trigger: document.getElementById("fieldTrigger").value.trim(),
    description: document.getElementById("fieldDescription").value.trim(),
  };

  const submitBtn = document.getElementById("modalSubmit");
  submitBtn.disabled = true;
  try {
    let saved;
    if (editingSlug) {
      saved = await api(`/skills/${encodeURIComponent(editingSlug)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      SKILLS = SKILLS.map((s) => (s.slug === editingSlug ? saved : s));
    } else {
      saved = await api("/skills", { method: "POST", body: JSON.stringify(payload) });
      SKILLS = [...SKILLS, saved];
    }
    closeModal();
    renderCategoryRail();
    renderSkills();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------- hero typing animation ----------

function runHero() {
  const promptEl = document.getElementById("heroPrompt");
  const resultEl = document.getElementById("heroResult");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    const example = HERO_EXAMPLES[0];
    promptEl.textContent = `"${example.prompt}"`;
    resultEl.innerHTML = `→ matched <span class="match">${escapeHtml(example.matches.join(", "))}</span>`;
    return;
  }

  let exampleIndex = 0;

  function typeExample() {
    const example = HERO_EXAMPLES[exampleIndex % HERO_EXAMPLES.length];
    const full = `"${example.prompt}"`;
    let charIndex = 0;
    promptEl.textContent = "";
    resultEl.innerHTML = "";

    const typeInterval = setInterval(() => {
      charIndex++;
      promptEl.textContent = full.slice(0, charIndex);
      if (charIndex >= full.length) {
        clearInterval(typeInterval);
        setTimeout(() => {
          resultEl.innerHTML = `→ matched <span class="match">${escapeHtml(example.matches.join(", "))}</span>`;
        }, 300);
        setTimeout(() => {
          exampleIndex++;
          typeExample();
        }, 3200);
      }
    }, 38);
  }

  typeExample();
}

// ---------- init ----------

async function loadData() {
  showLoadState("loading skills…", false);
  try {
    const [categories, skills] = await Promise.all([
      api("/categories"),
      api("/skills"),
    ]);
    CATEGORIES = categories;
    SKILLS = skills;
    showLoadState(null);
  } catch (err) {
    showLoadState(`couldn't reach the API — is server.py running? (${err.message})`, true);
  }
  renderCategoryRail();
  renderSkills();
}

function init() {
  renderPatternIndex();
  renderCommands();
  renderModels();
  renderPatterns();
  runHero();
  loadData();

  document.getElementById("tab-skills").addEventListener("click", () => setView("skills"));
  document.getElementById("tab-patterns").addEventListener("click", () => setView("patterns"));

  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderSkills();
  });

  document.getElementById("clearSearch").addEventListener("click", () => {
    searchQuery = "";
    searchInput.value = "";
    activeCategory = "all";
    renderCategoryRail();
    renderSkills();
    searchInput.focus();
  });

  document.getElementById("newSkillBtn").addEventListener("click", () => openModal(null));
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("skillForm").addEventListener("submit", handleFormSubmit);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("modalOverlay").hidden) closeModal();
  });
}

document.addEventListener("DOMContentLoaded", init);
