// /policies — browser-facing CRUD UI for cloud policies.
//
// Server-rendered HTML, native <form method="post"> submissions. The three
// templates produce different match_glob + when_clauses shapes but all
// converge into a single PolicyRecord. Once these policies are pulled by
// the OSS gateway, they merge into its in-memory PolicyEngine and block
// matching calls live.

import type { Context } from "hono";
import {
  ensureSchema,
  findOrgByApiKey,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  type PolicyRecord,
  type WhenClause,
} from "./db.ts";

const C = {
  bg: "#0a0a0c",
  surface: "#16161e",
  bg3: "#1a1922",
  border: "#27262e",
  borderStrong: "#3a3942",
  fg: "#fafafa",
  fg2: "#d4d4d8",
  fgDim: "#a1a1aa",
  fgFaint: "#71717a",
  brand: "#dc143c",
  brandDark: "#9f0d2c",
  success: "#22c55e",
  warning: "#f59e0b",
};

const STYLE = `
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{background:${C.bg};color:${C.fg};font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
  .container{max-width:1100px;margin:0 auto;padding:1.5rem 1.25rem 4rem}
  a{color:${C.brand};text-decoration:none}
  a:hover{text-decoration:underline}
  code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em}
  header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1.5rem;border-bottom:1px solid ${C.border};margin-bottom:1.75rem}
  .brand{display:flex;gap:.85rem;align-items:center}
  .brand .mark{width:40px;height:40px;border-radius:10px;background:${C.brand};display:grid;place-items:center;color:#fff;font-weight:800;font-size:1.4rem}
  .brand h1{margin:0;font-size:1.4rem;letter-spacing:-.015em}
  .brand .sub{color:${C.fgDim};font-size:.85rem;margin-top:.15rem}
  .nav-links{display:flex;gap:1.25rem;font-size:.9rem}
  .nav-links a{color:${C.fgDim}}
  .nav-links a.active{color:${C.brand};font-weight:600}
  h2{font-size:1.1rem;font-weight:600;margin:0 0 1rem}
  .card{background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:1.5rem;margin-bottom:1rem}
  .empty{color:${C.fgFaint};padding:2rem;text-align:center;font-style:italic;font-size:.9rem;background:${C.surface};border:1px dashed ${C.border};border-radius:12px}
  .btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1.1rem;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer;border:1px solid transparent;transition:all .15s ease;text-decoration:none}
  .btn-primary{background:${C.brand};color:#fff}
  .btn-primary:hover{background:${C.brandDark};text-decoration:none}
  .btn-ghost{background:transparent;color:${C.fg2};border-color:${C.border}}
  .btn-ghost:hover{border-color:${C.fgDim};text-decoration:none}
  .btn-danger{background:transparent;color:${C.brand};border:1px solid ${C.border}}
  .btn-danger:hover{background:rgba(220,20,60,.1);border-color:${C.brand};text-decoration:none}
  .toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem}
  /* policy list */
  table{width:100%;border-collapse:collapse;font-size:.88rem}
  th{text-align:left;padding:.65rem .85rem;color:${C.fgFaint};font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid ${C.border}}
  td{padding:.85rem;border-bottom:1px solid ${C.bg3};vertical-align:middle}
  tr:hover td{background:${C.bg3}}
  .badge{display:inline-block;padding:.12rem .55rem;border-radius:4px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .badge.deny{background:rgba(220,20,60,.18);color:${C.brand}}
  .badge.allow{background:rgba(34,197,94,.15);color:${C.success}}
  .badge.disabled{background:${C.bg3};color:${C.fgFaint}}
  .badge.template{background:rgba(245,158,11,.12);color:${C.warning}}
  .row-actions{display:flex;gap:.5rem;justify-content:flex-end}
  /* form */
  form{display:flex;flex-direction:column;gap:1.1rem}
  .field{display:flex;flex-direction:column;gap:.4rem}
  .field label{color:${C.fg2};font-size:.85rem;font-weight:600}
  .field .hint{color:${C.fgFaint};font-size:.78rem}
  .field input[type=text],.field textarea,.field select{padding:.6rem .85rem;background:${C.bg};border:1px solid ${C.border};border-radius:8px;color:${C.fg};font-size:.9rem;font-family:inherit}
  .field input[type=text]:focus,.field textarea:focus,.field select:focus{outline:none;border-color:${C.brand}}
  .field input[type=text].mono,.field textarea.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem}
  .field textarea{resize:vertical;min-height:80px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  .actions{display:flex;gap:.5rem;justify-content:flex-end;padding-top:.5rem;border-top:1px solid ${C.border}}
  /* template picker */
  .templates{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem;margin-bottom:1rem}
  .template{padding:1rem;background:${C.bg3};border:2px solid ${C.border};border-radius:10px;cursor:pointer;transition:all .15s ease;text-decoration:none;color:${C.fg};display:block}
  .template:hover{border-color:${C.borderStrong};text-decoration:none}
  .template.active{border-color:${C.brand};background:rgba(220,20,60,.06)}
  .template strong{display:block;color:${C.fg};margin-bottom:.3rem;font-size:.9rem}
  .template span{color:${C.fgDim};font-size:.8rem;line-height:1.4}
  .alert{padding:.85rem 1rem;border-radius:8px;font-size:.88rem;margin-bottom:1rem}
  .alert.error{background:rgba(220,20,60,.1);color:${C.brand};border:1px solid rgba(220,20,60,.3)}
  .alert.success{background:rgba(34,197,94,.1);color:${C.success};border:1px solid rgba(34,197,94,.3)}
`;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);

// ============================================================
// TEMPLATES — three predefined shapes the UI uses to scaffold forms
// ============================================================

type TemplateDef = {
  id: string;
  title: string;
  blurb: string;
  defaults: {
    matchGlob: string;
    whenClauses: Record<string, WhenClause> | null;
    effect: "allow" | "deny";
    reason: string;
  };
  /** form fields beyond the standard name/description */
  fields: Array<{
    key: string;
    label: string;
    hint: string;
    placeholder: string;
  }>;
};

const TEMPLATES: Record<string, TemplateDef> = {
  block_tool: {
    id: "block_tool",
    title: "Block a tool",
    blurb: "Disable a specific tool entirely. Useful for image generation, file deletion, etc.",
    defaults: {
      matchGlob: "image__*",
      whenClauses: null,
      effect: "deny",
      reason: "tool disabled by org policy",
    },
    fields: [
      {
        key: "matchGlob",
        label: "Tool name pattern",
        hint: "Glob over server__tool names. e.g. image__* to block all image tools, dall_e__generate for one tool.",
        placeholder: "image__*",
      },
    ],
  },

  block_keyword: {
    id: "block_keyword",
    title: "Block content keywords",
    blurb: "Block any tool call whose prompt / content / text arg contains a banned word.",
    defaults: {
      matchGlob: "*",
      whenClauses: { prompt: { containsAny: [] } },
      effect: "deny",
      reason: "content matched banned keyword list",
    },
    fields: [
      {
        key: "matchGlob",
        label: "Tool name pattern (use * for everything)",
        hint: "Often '*' here — keyword filters typically apply across all tools.",
        placeholder: "*",
      },
      {
        key: "argName",
        label: "Argument to inspect",
        hint: "Which argument holds user-supplied text. Common: prompt, content, text, query, message.",
        placeholder: "prompt",
      },
      {
        key: "keywords",
        label: "Keywords (comma-separated)",
        hint: "Case-insensitive substring match. Any keyword present triggers the deny.",
        placeholder: "drop table, exec(, eval(, password",
      },
    ],
  },

  block_arg_value: {
    id: "block_arg_value",
    title: "Block by argument value",
    blurb: "Block a tool when one of its args matches a glob. e.g. fs__write_* when path: /etc/*",
    defaults: {
      matchGlob: "filesystem__write_*",
      whenClauses: { path: "/etc/*" },
      effect: "deny",
      reason: "path is on the protected list",
    },
    fields: [
      {
        key: "matchGlob",
        label: "Tool name pattern",
        hint: "e.g. filesystem__write_* or shell__execute",
        placeholder: "filesystem__write_*",
      },
      {
        key: "argName",
        label: "Argument name",
        hint: "The argument whose value you want to gate on.",
        placeholder: "path",
      },
      {
        key: "argGlob",
        label: "Value pattern (glob)",
        hint: "Glob over the argument's value. e.g. /etc/* or */node_modules/* or *.env",
        placeholder: "/etc/*",
      },
    ],
  },
};

// ============================================================
// REQUIRE AUTH VIA ?key=
// ============================================================

async function requireKey(c: Context): Promise<{ orgId: string; key: string } | Response> {
  const key = c.req.query("key");
  if (!key) return c.html(authNeededPage(), 401);
  const auth = await findOrgByApiKey(key);
  if (!auth) return c.html(authNeededPage("Invalid API key."), 401);
  await ensureSchema();
  return { orgId: auth.orgId, key };
}

function authNeededPage(error?: string): string {
  return shell(
    "Sign in — Trabecc Cloud",
    `<div class="card" style="max-width:480px;margin:6rem auto 0">
      <h2>Sign in to manage policies</h2>
      ${error ? `<div class="alert error">${esc(error)}</div>` : ""}
      <form method="get">
        <div class="field">
          <label>API key</label>
          <input class="mono" type="text" name="key" placeholder="tk_live_..." autofocus required/>
          <span class="hint">Generated from the admin CLI. See <a href="https://github.com/rrosshan10/trabecc">README</a>.</span>
        </div>
        <div class="actions"><button class="btn btn-primary" type="submit">Continue</button></div>
      </form>
    </div>`,
  );
}

function shell(title: string, body: string, navActive?: "dashboard" | "policies"): string {
  return `<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <meta name="theme-color" content="${C.brand}"/>
  <style>${STYLE}</style>
</head><body><div class="container">
  <header>
    <div class="brand">
      <div class="mark">T</div>
      <div><h1>Trabecc Cloud</h1><div class="sub">policy &amp; audit control plane</div></div>
    </div>
    <nav class="nav-links">
      <a class="${navActive === "dashboard" ? "active" : ""}" href="/">Dashboard</a>
      <a class="${navActive === "policies" ? "active" : ""}" href="/policies">Policies</a>
    </nav>
  </header>
  ${body}
</div></body></html>`;
}

// ============================================================
// PAGES
// ============================================================

export async function pageList(c: Context): Promise<Response> {
  const auth = await requireKey(c);
  if (auth instanceof Response) return auth;
  const policies = await listPolicies(auth.orgId);
  const message = c.req.query("msg");

  const rows = policies.length === 0
    ? `<div class="empty">No policies yet. Click "New policy" to create one — the gateway pulls these in and merges them with your local YAML rules.</div>`
    : `<table>
        <thead><tr><th>Name</th><th>Match</th><th>Effect</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>${policies.map((p) => `
          <tr>
            <td><strong>${esc(p.name)}</strong>${p.description ? `<div style="color:${C.fgFaint};font-size:.78rem;margin-top:.15rem">${esc(p.description)}</div>` : ""}</td>
            <td><code>${esc(p.matchGlob)}</code>${p.whenClauses ? `<div style="color:${C.fgFaint};font-size:.78rem;margin-top:.15rem"><code>when</code>: ${esc(Object.keys(p.whenClauses).join(", "))}</div>` : ""}</td>
            <td><span class="badge ${p.effect}">${esc(p.effect)}</span></td>
            <td>${p.enabled ? `<span class="badge allow">active</span>` : `<span class="badge disabled">disabled</span>`}${p.template ? ` <span class="badge template" title="Template">${esc(p.template)}</span>` : ""}</td>
            <td class="mono" style="color:${C.fgFaint};font-size:.78rem">${p.createdAt.toISOString().slice(0, 10)}</td>
            <td class="row-actions">
              <a class="btn btn-ghost" href="/policies/${esc(p.id)}?key=${esc(auth.key)}">Edit</a>
              <form method="post" action="/policies/${esc(p.id)}/delete?key=${esc(auth.key)}" onsubmit="return confirm('Delete policy &quot;${esc(p.name)}&quot;? This cannot be undone.')" style="display:inline">
                <button type="submit" class="btn btn-danger">Delete</button>
              </form>
            </td>
          </tr>`).join("")}</tbody>
      </table>`;

  return c.html(shell(
    "Policies — Trabecc Cloud",
    `${message ? `<div class="alert success">${esc(message)}</div>` : ""}
    <div class="toolbar">
      <h2 style="margin:0">Policies</h2>
      <a class="btn btn-primary" href="/policies/new?key=${esc(auth.key)}">+ New policy</a>
    </div>
    <div class="card" style="padding:.25rem .5rem">${rows}</div>
    <div style="margin-top:1.5rem;color:${C.fgFaint};font-size:.85rem">
      Policies are pulled by the OSS gateway every 60 seconds (when <code>cloud.pullPolicies: true</code> is set) and merged with the local YAML rules. Until v0.3.1 ships, these policies are stored but not yet enforced by the gateway — they are reviewable + queryable via <code>GET /v1/policies</code>.
    </div>`,
    "policies",
  ));
}

export async function pageNew(c: Context): Promise<Response> {
  const auth = await requireKey(c);
  if (auth instanceof Response) return auth;
  const templateId = c.req.query("template") ?? "block_tool";
  const template = TEMPLATES[templateId] ?? TEMPLATES["block_tool"]!;

  const templateCards = Object.values(TEMPLATES)
    .map((t) => `
      <a class="template ${t.id === template.id ? "active" : ""}" href="/policies/new?template=${esc(t.id)}&key=${esc(auth.key)}">
        <strong>${esc(t.title)}</strong>
        <span>${esc(t.blurb)}</span>
      </a>`).join("");

  // Template-specific fields rendered below the standard name/description
  const templateFields = renderTemplateFields(template, null);

  const body = `
    <div class="toolbar">
      <h2 style="margin:0">New policy</h2>
      <a class="btn btn-ghost" href="/policies?key=${esc(auth.key)}">← Back to list</a>
    </div>
    <div class="card">
      <div style="margin-bottom:1.25rem;color:${C.fgDim};font-size:.9rem">Pick a template:</div>
      <div class="templates">${templateCards}</div>
    </div>
    <div class="card">
      <h2>${esc(template.title)}</h2>
      <p style="color:${C.fgDim};font-size:.9rem;margin:0 0 1.5rem">${esc(template.blurb)}</p>
      <form method="post" action="/policies/new?key=${esc(auth.key)}">
        <input type="hidden" name="template" value="${esc(template.id)}"/>
        <div class="row">
          <div class="field">
            <label>Name *</label>
            <input type="text" name="name" required placeholder="e.g. Block writes to /etc"/>
          </div>
          <div class="field">
            <label>Effect</label>
            <select name="effect">
              <option value="deny" ${template.defaults.effect === "deny" ? "selected" : ""}>Deny</option>
              <option value="allow" ${template.defaults.effect === "allow" ? "selected" : ""}>Allow</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Description (optional)</label>
          <textarea name="description" placeholder="Why this policy exists — visible to your team in the audit log."></textarea>
        </div>
        ${templateFields}
        <div class="field">
          <label>Reason shown to the agent on deny</label>
          <input type="text" name="reason" value="${esc(template.defaults.reason)}"/>
          <span class="hint">Sent back to the MCP client so the agent (and your logs) can see why the call was blocked.</span>
        </div>
        <div class="actions">
          <a class="btn btn-ghost" href="/policies?key=${esc(auth.key)}">Cancel</a>
          <button type="submit" class="btn btn-primary">Create policy</button>
        </div>
      </form>
    </div>`;

  return c.html(shell("New policy — Trabecc Cloud", body, "policies"));
}

export async function pageEdit(c: Context): Promise<Response> {
  const auth = await requireKey(c);
  if (auth instanceof Response) return auth;
  const id = c.req.param("id");
  if (!id) return c.html(shell("Not found", `<div class="empty">Missing policy id.</div>`, "policies"), 404);
  const policy = await getPolicy(auth.orgId, id);
  if (!policy) return c.html(shell("Not found", `<div class="empty">Policy not found.</div>`, "policies"), 404);

  const templateId = policy.template ?? "block_tool";
  const template = TEMPLATES[templateId] ?? TEMPLATES["block_tool"]!;
  const templateFields = renderTemplateFields(template, policy);

  const body = `
    <div class="toolbar">
      <h2 style="margin:0">Edit policy</h2>
      <a class="btn btn-ghost" href="/policies?key=${esc(auth.key)}">← Back</a>
    </div>
    <div class="card">
      <form method="post" action="/policies/${esc(policy.id)}?key=${esc(auth.key)}">
        <input type="hidden" name="template" value="${esc(template.id)}"/>
        <div class="row">
          <div class="field">
            <label>Name *</label>
            <input type="text" name="name" required value="${esc(policy.name)}"/>
          </div>
          <div class="field">
            <label>Effect</label>
            <select name="effect">
              <option value="deny" ${policy.effect === "deny" ? "selected" : ""}>Deny</option>
              <option value="allow" ${policy.effect === "allow" ? "selected" : ""}>Allow</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea name="description">${esc(policy.description ?? "")}</textarea>
        </div>
        ${templateFields}
        <div class="field">
          <label>Reason shown to the agent on deny</label>
          <input type="text" name="reason" value="${esc(policy.reason ?? "")}"/>
        </div>
        <div class="field">
          <label><input type="checkbox" name="enabled" ${policy.enabled ? "checked" : ""}/> Enabled</label>
          <span class="hint">Disable to keep the rule around but stop it from being pulled by gateways.</span>
        </div>
        <div class="actions">
          <a class="btn btn-ghost" href="/policies?key=${esc(auth.key)}">Cancel</a>
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </div>`;
  return c.html(shell(`Edit ${policy.name}`, body, "policies"));
}

// ============================================================
// FORM HANDLERS
// ============================================================

export async function postCreate(c: Context): Promise<Response> {
  const auth = await requireKey(c);
  if (auth instanceof Response) return auth;
  const form = await c.req.parseBody();
  const built = buildPolicyFromForm(form);
  if (built instanceof Error) {
    return c.redirect(`/policies/new?key=${encodeURIComponent(auth.key)}&template=${encodeURIComponent(String(form["template"] ?? "block_tool"))}`);
  }
  await createPolicy(auth.orgId, built);
  return c.redirect(`/policies?key=${encodeURIComponent(auth.key)}&msg=Policy+created`);
}

export async function postUpdate(c: Context): Promise<Response> {
  const auth = await requireKey(c);
  if (auth instanceof Response) return auth;
  const id = c.req.param("id");
  if (!id) return c.redirect(`/policies?key=${encodeURIComponent(auth.key)}&msg=Missing+id`);
  const form = await c.req.parseBody();
  const built = buildPolicyFromForm(form);
  if (built instanceof Error) {
    return c.redirect(`/policies/${id}?key=${encodeURIComponent(auth.key)}`);
  }
  const patch = { ...built, enabled: form["enabled"] === "on" };
  await updatePolicy(auth.orgId, id, patch);
  return c.redirect(`/policies?key=${encodeURIComponent(auth.key)}&msg=Policy+updated`);
}

export async function postDelete(c: Context): Promise<Response> {
  const auth = await requireKey(c);
  if (auth instanceof Response) return auth;
  const id = c.req.param("id");
  if (!id) return c.redirect(`/policies?key=${encodeURIComponent(auth.key)}&msg=Missing+id`);
  await deletePolicy(auth.orgId, id);
  return c.redirect(`/policies?key=${encodeURIComponent(auth.key)}&msg=Policy+deleted`);
}

// ============================================================
// FORM RENDERING & PARSING
// ============================================================

function renderTemplateFields(template: TemplateDef, existing: PolicyRecord | null): string {
  // Initial values per template — either from the existing policy or the template default.
  const values: Record<string, string> = {};

  if (existing) {
    values["matchGlob"] = existing.matchGlob;
    const wc = existing.whenClauses;
    if (template.id === "block_keyword" && wc) {
      const argName = Object.keys(wc)[0] ?? "prompt";
      values["argName"] = argName;
      const clause = wc[argName] as WhenClause | undefined;
      if (clause && typeof clause === "object" && "containsAny" in clause && clause.containsAny) {
        values["keywords"] = clause.containsAny.join(", ");
      }
    } else if (template.id === "block_arg_value" && wc) {
      const argName = Object.keys(wc)[0] ?? "path";
      values["argName"] = argName;
      const clause = wc[argName] as WhenClause | undefined;
      values["argGlob"] = typeof clause === "string" ? clause : clause?.glob ?? "";
    }
  } else {
    values["matchGlob"] = template.defaults.matchGlob;
    const wc = template.defaults.whenClauses;
    if (wc) {
      const argName = Object.keys(wc)[0] ?? "";
      values["argName"] = argName;
    }
  }

  return template.fields.map((f) => `
    <div class="field">
      <label>${esc(f.label)}</label>
      <input type="text" class="mono" name="${esc(f.key)}" placeholder="${esc(f.placeholder)}" value="${esc(values[f.key] ?? "")}" required/>
      <span class="hint">${esc(f.hint)}</span>
    </div>`).join("");
}

function buildPolicyFromForm(form: Record<string, unknown>): Parameters<typeof createPolicy>[1] | Error {
  const templateId = String(form["template"] ?? "block_tool");
  const template = TEMPLATES[templateId];
  if (!template) return new Error("unknown template");

  const name = String(form["name"] ?? "").trim();
  if (!name) return new Error("name required");

  const effect = (form["effect"] === "allow" ? "allow" : "deny") as "allow" | "deny";
  const description = String(form["description"] ?? "").trim() || null;
  const reason = String(form["reason"] ?? "").trim() || null;
  const matchGlob = String(form["matchGlob"] ?? template.defaults.matchGlob).trim();

  let whenClauses: Record<string, WhenClause> | null = null;

  if (templateId === "block_keyword") {
    const argName = String(form["argName"] ?? "prompt").trim() || "prompt";
    const keywordsRaw = String(form["keywords"] ?? "");
    const keywords = keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean);
    if (keywords.length > 0) {
      whenClauses = { [argName]: { containsAny: keywords } };
    }
  } else if (templateId === "block_arg_value") {
    const argName = String(form["argName"] ?? "").trim();
    const argGlob = String(form["argGlob"] ?? "").trim();
    if (argName && argGlob) {
      whenClauses = { [argName]: argGlob };
    }
  }
  // block_tool has no when_clauses

  return {
    name,
    description,
    matchGlob,
    whenClauses,
    effect,
    reason,
    template: templateId,
  };
}
