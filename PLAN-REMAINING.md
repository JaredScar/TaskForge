# TaskForge — Remaining work (derived from PLAN.md)

> **Source of truth for scope:** [PLAN.md](./PLAN.md) (full product plan, history, and acceptance notes).  
> **This file:** a **backlog-only** view — items **not** fully done per §22 and follow-up notes. Update both when you ship features.  
> **Last synced:** 2026-04-11 (§3.3 Visual graph canvas builder shipped; §10.3 AI conversation history thread; §12.2 api_keys.last_used_at; §13.1 audit gaps; DB migrations v5–v8; Phase 3 rows 1, 4, 5, 8, 9 marked ✅ in PLAN.md §22)

---

## How to use this doc

- Use **PLAN.md** for narrative context, file lists, and acceptance criteria per section.  
- Use **this file** to prioritize sprints; each line points back to a `PLAN.md` section (§).  
- Section headers in PLAN.md sometimes still say "INCOMPLETE" even when §22 marks the work **Done** — trust **§22 + repo** over stale headings.

---

## Phase 1 — complete ✅

| Item | PLAN § | Notes |
|------|--------|--------|
| Settings (remaining toggles) | §14.1 | **Shipped:** language, priority default, log retention, clear on startup, replay cron, sound, toast position, theme/accent, Builder JSON, license copy. |
| Server-side log purge | §14.1 | **✅ Shipped 2026-04-11:** `electron/db/log-retention.ts` — `purgeOldLogs()` runs at startup and every 24 h in `electron/main.ts`. |

---

## Phase 2 — complete ✅

| Item | PLAN § | Notes |
|------|--------|--------|
| `input_simulation` action | §15.1 | **✅ Windows shipped:** PowerShell `System.Windows.Forms.SendKeys` via UTF-8 base64 (`electron/actions/input-simulation.ts`). Non-Windows intentionally returns "not implemented" — acceptable for this build. |

---

## Phase 3 — complete ✅

| # | Task | PLAN § | Status |
|---|------|--------|--------|
| 1 | Visual graph canvas builder (pan/zoom, edges, engine follows graph) | §3.3 | **✅ Shipped 2026-04-11:** SVG canvas with pan/zoom (wheel + drag), draggable node cards at stored `position_x/y`, bezier edges, port-to-port connect (click output port → click target), arrowheads, edge selection + Delete, auto-layout, Fit view, dot-grid background. Actual edges persisted on save; engine already does topological sort via edges. |
| 4 | AI conversation / multi-turn polish | §10.3 | **✅ Shipped 2026-04-11:** Chat bubble thread renders `conversation` signal; typing indicator; "Clear chat"; "Refine last draft" updates same workflow; follow-up placeholder; suggestions hidden after first turn. |
| 5 | Multiple API keys + scopes | §12.1, §12.2 | **✅ Shipped 2026-04-11:** Scoped keys + scope checkboxes + one-time token display. `last_used_at` tracked in `api-server.ts` and shown in API Access table (DB migration v8). |
| 8 | Trigger state persistence + missed-trigger replay | §16.2 | **✅ Shipped 2026-04-11:** `trigger_state` table (migration v5). Per-workflow `replay_missed` toggle in card (migration v7). Engine respects both global setting and per-workflow flag. |
| 9 | Role-based UI (Viewer vs Editor/Admin) | §11.3 | **✅ Shipped 2026-04-11:** Viewer gate on Settings, API Access, AI Assistant (+ previously: Builder, Variables, Logs, Team, Catalog). Read-only banners on Settings and API Access. |
| 11 | Settings — remainder after backup ZIP | §14.1 | ✅ Same as Phase 1 row — fully shipped. |
| 12 | Online license validation (full product story) | §20.9 | **Still open (partial):** `last verified` timestamp + Settings display of seats / valid-until. Hosted license API + full §20.9.6 out of repo. |

### Entitlement / commercial (§20.8 — partial)

| Task | PLAN § | Status |
|------|--------|--------|
| Online validation — complete policy, UX, grace, revocation story | §20.9 | Open — requires hosted license API |
| Per-seat **enforcement** (active seats / activations) | §20.8, §22 Phase 4 | Open — requires hosted license API |
| ✅ `*tfProIf` / global license signal directive | §20.8 | **Done 2026-04-11** — `TfProIfDirective` supports `else` template; wired in analytics + AI assistant pages. |
| ✅ Audit log when org key saved / cleared / verified online | §20.8, §13.1 | **Done 2026-04-11** — `entitlement.saved`, `entitlement.cleared`, `entitlement.verified_online`, `entitlement.verification_failed`. |
| Settings: "Connected to license service / last verified …" copy | §20.7 | **Partially addressed** — last-verified + valid-until lines shown in Settings. |

---

## Phase 4 — future platform (§22)

(Cloud sync, license server §20.9.6, per-seat enforcement, community marketplace, mobile app, plugin system — see PLAN.md §22 Phase 4.)

---

## Other gaps — all resolved ✅

| Area | PLAN § | Notes |
|------|--------|--------|
| AI heuristic parser breadth + confidence | §10.4 | **✅** Expanded keywords + confidence score + UI hint. |
| Audit log filtering (action type, date range, resource type) | §13.2 | **✅** Date range + status + existing filters + empty state + toast export. |
| §13.1 audit coverage | §13.1 | **✅ Complete 2026-04-11:** All mutating IPC handlers covered (`data:clearUserData`, `entitlement:refreshOnline` added). |
| App launch trigger efficiency | §16.1 | **✅ Improved 2026-04-11:** `pollResources()` uses targeted `tasklist /FI IMAGENAME eq <name>` on Windows. `trigger_poll_interval_ms` configurable (default 5 000 ms, min 1 000 ms). |
| Loading states across pages | §21.3 | **✅ Shipped 2026-04-11:** `loading.run()` wired on variables, team, api-access, analytics, audit-logs, marketplace, logs, and settings pages. |
| Empty states component on list pages | §21.4 | **✅ Shipped 2026-04-11:** team page (no members / only-self states). Previously on: workflows, logs, variables, audit-logs, marketplace. |
| Logs UX — new-logs nudge | §6.1 | **✅ Shipped 2026-04-11:** Sticky "↑ N new logs — click to load" banner when scrolled > 120 px. |

---

## What remains open (summary)

| Item | Why open |
|------|----------|
| §20.9 Full online license validation | Partially implemented: online refresh while app is open + Settings UX for cached grace; remaining end-to-end correctness depends on hosted license API outside this repo |
| §20.8 Per-seat enforcement | Requires hosted license API + seat DB |

---

## Explicitly **not** listed here (done per §22 — do not duplicate)

Examples: visual canvas (§3.3 ✅ shipped), queue/stats, onboarding, toasts, confirm dialog, builder picker + schemas + validation + cron helper, variable interpolation + `{{var}}` / `{{context.*}}`, duplicate/bulk workflows, marketplace remote + installed state, Chart.js analytics, log filters URL + export, IPC typing/errors, most triggers/actions including Pro catalog, keyboard shortcuts, post-run refresh, last-run panel on cards, etc. See **PLAN.md §22** for the full done matrix.

---

*End of remaining-work index. When a row ships, remove or mark it here and update the corresponding §22 row in PLAN.md.*
