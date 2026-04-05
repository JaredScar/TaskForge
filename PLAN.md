# TaskForge – Full Implementation Plan

> Last updated: 2026-04-04 · *Implementation status is reflected in §22 and inline ✅ notes where noted.*
>
> This plan maps every piece of dummy/hardcoded data and every incomplete feature in the app to concrete implementation tasks. Tasks are grouped by feature area and ordered by dependency. Each item lists the files involved and the acceptance criteria.
>
> **GitHub / open-source note:** TaskForge follows an **open-core model**: the **client and core app are open source**, while **paid Pro and Enterprise capabilities are tied to credentials issued by our servers** (an **organization license key**), not to anything you can forge from the repo alone in official store builds. See [§20](#20-pro--enterprise-entitlement), especially **§20.0** and **§20.9**.

---

## Table of Contents

1. [App Shell & Global State](#1-app-shell--global-state)
2. [Workflows Page](#2-workflows-page)
3. [Workflow Builder](#3-workflow-builder)
4. [Triggers Catalogue Page](#4-triggers-catalogue-page)
5. [Actions Catalogue Page](#5-actions-catalogue-page)
6. [Execution Logs Page](#6-execution-logs-page)
7. [Variables Page](#7-variables-page)
8. [Analytics Page](#8-analytics-page)
9. [Marketplace Page](#9-marketplace-page)
10. [AI Assistant Page](#10-ai-assistant-page)
11. [Team Page](#11-team-page)
12. [API Access Page](#12-api-access-page)
13. [Audit Logs Page](#13-audit-logs-page)
14. [Settings Page](#14-settings-page)
15. [Automation Engine](#15-automation-engine)
16. [Trigger Manager](#16-trigger-manager)
17. [Action Executor](#17-action-executor)
18. [Database & Seed Data](#18-database--seed-data)
19. [IPC / Bridge Layer](#19-ipc--bridge-layer)
20. [Pro & Enterprise Entitlement](#20-pro--enterprise-entitlement)
21. [Cross-Cutting Concerns](#21-cross-cutting-concerns)
22. [Implementation Phases](#22-implementation-phases)

---

## 1. App Shell & Global State

### 1.1 — Engine Status Badge (DUMMY)

**Current state:** The green "Engine Running" badge in the header is always visible regardless of whether the automation engine is actually running.

**What to build:**
- Add an `engine:getStatus` IPC channel in `ipc-handlers.ts` that returns `{ running: boolean, activeWorkflows: number }`.
- In `AutomationEngine`, track a `running` boolean that is set to `true` after `reloadFromDatabase()` completes and `false` if it crashes or is stopped.
- In `app-shell.component.ts`, query engine status on mount and every 10 s alongside the existing `getStats()` poll.
- Render three possible states: **Running** (green), **Starting** (yellow/pulse), **Stopped** (red). Clicking the badge opens a popover with uptime and active job count.

**Files:** `electron/ipc-handlers.ts`, `electron/engine/automation-engine.ts`, `src/app/shared/shell/app-shell.component.ts`, `src/app/shared/shell/app-shell.component.html`

**Acceptance:** Badge reflects actual engine state; goes red if engine process throws an unhandled error.

---

### 1.2 — Sidebar Counters (DUMMY)

**Current state:** "Triggers: 20" and "Actions: 25" are hardcoded strings in `app-shell.component.html`.

**What to build:**
- Extend the existing `app:getStats` IPC handler to also return `{ triggerCount: number, actionCount: number }` computed from `SELECT COUNT(*) FROM workflow_nodes WHERE kind IN (...)`.
- Bind these counts in the shell component's stats signal.

**Files:** `electron/ipc-handlers.ts`, `electron/db/database.ts`, `src/app/shared/shell/app-shell.component.ts`, `src/app/shared/shell/app-shell.component.html`

**Acceptance:** Counters change when workflows with trigger/action nodes are added or removed.

---

### 1.3 — "Team: Engineering" Header Label (DUMMY)

**Current state:** The header shows a hardcoded "Team: Engineering" button with no behaviour.

**What to build:**
- Replace the label with the current user's `display_name` and `role` read from the `team_members` row where `is_self = 1`.
- Clicking the label navigates to `/team`.
- If no `is_self` row exists, hide the label entirely.

**Files:** `src/app/shared/shell/app-shell.component.ts`, `src/app/shared/shell/app-shell.component.html`

**Acceptance:** Label shows real user data from the DB; absent when no self-row exists.

---

### 1.4 — Queue Count Fallback (DUMMY) ✅ IMPLEMENTED

**Current state:** ~~In `ipc-handlers.ts`, `app:getStats` returns `pending || 3` when there are no running logs — hardcoding a queue of 3.~~ Removed.

**Implemented:**
- `app:getStats` **queue** = `COUNT(*)` from `execution_logs WHERE status = 'pending'` **plus** in-memory queued runs in `AutomationEngine` (`concurrency: queue` while another run is in flight — these are not yet rows in the DB).
- `analytics:systemHealth` **queue** uses the same sum (replaces the old placeholder scaling).

**Files:** `electron/ipc-handlers.ts`, `electron/engine/automation-engine.ts`

**Acceptance:** Queue counter shows `0` on a fresh install; increments when workflows are queued (memory queue and/or `pending` log rows).

---

## 2. Workflows Page

### 2.1 — Post-Run Status Refresh

**Current state:** After clicking "Test Run" on a workflow card, the page does not refresh the workflow's `last_run_at` or `last_run_summary` without a full reload.

**What to build:**
- In `workflows-page.component.ts`, after `ipc.runWorkflow(id)` resolves, call `ipc.getWorkflow(id)` and replace the matching item in the local signal array.
- Show an inline spinner on the card during execution (listen for the IPC promise resolving).
- Display the updated `last_run_summary` and a success/error chip on the card immediately.

**Files:** `src/app/features/workflows/workflows-page.component.ts`, `src/app/features/workflows/workflows-page.component.html`

**Acceptance:** Card visually reflects run result within 2 s of run completion without page reload.

---

### 2.2 — Workflow Run History Inline

**Current state:** Workflow cards show no run history beyond `last_run_at`.

**What to build:**
- Add a small "View last run" link on each card that opens an inline slide-out panel showing the most recent `execution_logs` + `log_steps` for that workflow (reuse the logs-page detail component).

**Files:** `src/app/features/workflows/workflows-page.component.ts`, `src/app/features/logs/` (new shared detail component)

---

### 2.3 — Duplicate Workflow

**Current state:** No duplicate action exists.

**What to build:**
- Add `workflows:duplicate` IPC channel that deep-copies a workflow and all its nodes/edges into new rows with a new UUID and name `"Copy of <original>"`.
- Add a "Duplicate" action to the workflow card context menu.

**Files:** `electron/ipc-handlers.ts`, `src/app/features/workflows/workflows-page.component.ts`

---

### 2.4 — Bulk Actions

**Current state:** Actions (delete, toggle) are per-card only.

**What to build:**
- Add a multi-select checkbox mode (shift-click + header "select all").
- Bulk enable / disable / delete via a floating action bar at the bottom of the page.

---

## 3. Workflow Builder

### 3.1 — Node Type Picker UI (INCOMPLETE)

**Current state:** Adding a new node requires manually typing the `kind` field as raw JSON in the config panel — there is no visual picker.

**What to build:**
- Create a `NodePickerComponent` (modal or slide-out sidebar) that lists all available trigger types, condition types, and action types grouped by category with icons and descriptions.
- Each item shows: name, icon, tier badge (Free/Pro), short description.
- Selecting an item inserts a node with the correct `kind` and a pre-populated default config object (so the user sees meaningful fields, not an empty `{}`).
- Data source: a static `NODE_CATALOG` constant (TypeScript) shared between renderer and used for validation in the engine too.

**Files:**
- New: `src/app/features/builder/node-picker/node-picker.component.ts`
- New: `src/app/shared/constants/node-catalog.ts`
- `src/app/features/builder/builder-page.component.ts`

**Acceptance:** User can add any trigger/condition/action node without touching JSON.

---

### 3.2 — Per-Node Config Form (INCOMPLETE)

**Current state:** The config panel is a raw JSON textarea. Users must know the exact config schema.

**What to build:**
- For each `kind`, define a `ConfigSchema` (array of field descriptors: `{ key, label, type: 'text'|'number'|'boolean'|'select'|'file'|'cron', options?, required? }`).
- Render a proper form from the schema in the right-hand config panel — no raw JSON visible by default.
- Provide a "Show JSON" toggle for power users.
- On save, serialize the form back to the config JSON column.

**Config schemas needed (minimum):**
| Kind | Fields |
|---|---|
| `time_trigger` | cron expression (with human-readable preview), timezone |
| `app_launch_trigger` | process name or exe path (file picker) |
| `startup_trigger` | delay seconds |
| `wifi_trigger` | SSID |
| `file_trigger` | path (folder picker), event (create/modify/delete) |
| `cpu_trigger` | threshold %, comparison (above/below) |
| `idle_trigger` | idle seconds |
| `condition_wifi` | SSID |
| `condition_time_window` | start time, end time |
| `condition_app_running` | process name |
| `open_app` | app path (file picker), args |
| `notification` | title, body, icon |
| `open_file` | path (file/folder picker) |
| `run_script` | shell (powershell/cmd/bash), script (multiline editor) |
| `http_request` | method, url, headers (key-value pairs), body |
| `dark_mode` | mode (toggle/enable/disable) |
| `audio_control` | action (mute/unmute/set-volume), volume level |

**Files:**
- New: `src/app/features/builder/node-config-form/node-config-form.component.ts`
- New: `src/app/shared/constants/node-schemas.ts`
- `src/app/features/builder/builder-page.component.ts`

---

### 3.3 — Visual Graph Canvas (V2 Feature)

**Current state:** The builder is a linear drag-and-drop list, not a 2D canvas.

**What to build:**
- Replace the linear list with an SVG/Canvas-based node graph where:
  - Each node is a draggable card at `(position_x, position_y)`.
  - Edges are drawn as bezier curves between node output and input ports.
  - Users can connect nodes by dragging from an output port to an input port.
  - Pan and zoom the canvas (mouse wheel + drag on empty space).
- Save `position_x` / `position_y` per node (already in the schema).
- Edges are saved to `workflow_edges` (already in the schema but currently unused by the engine).

**Files:** `src/app/features/builder/builder-page.component.ts`, `electron/engine/automation-engine.ts` (update to use edges for execution order, not just `sort_order`)

**Note:** This is a V2 feature — the linear builder should remain functional until the canvas is complete.

---

### 3.4 — Builder Validation & Error Highlighting

**Current state:** The builder allows saving a workflow with no trigger, which will never run.

**What to build:**
- Before saving, validate:
  - At least one trigger node exists.
  - At least one action node exists.
  - All required config fields are filled.
  - No duplicate node kinds that shouldn't repeat (e.g., two startup triggers).
- Highlight invalid nodes with a red border and show a tooltip explaining the error.
- Block the "Save" button and show a summary banner listing issues.

---

### 3.5 — Cron Expression Helper

**Current state:** Time trigger config requires a raw cron string.

**What to build:**
- A small inline cron builder component: dropdowns for frequency (minute/hour/day/week/month), with a live human-readable preview: "Every day at 9:00 AM".
- Show next 3 scheduled run times as a preview.

**Files:** New `src/app/features/builder/cron-builder/cron-builder.component.ts`

---

## 4. Triggers Catalogue Page

### 4.1 — From Static to Interactive (INCOMPLETE)

**Current state:** The triggers page is a read-only reference catalogue — cards with descriptions only.

**What to build:**
- Each trigger card shows how many workflows currently use that trigger type (queried from `workflow_nodes`).
- "Create workflow with this trigger" button on each card: navigates to the builder with the trigger node pre-inserted.
- For advanced (Pro) triggers, show a lock overlay with an upgrade CTA.

**Files:** `src/app/features/triggers/triggers-page.component.ts`, `electron/ipc-handlers.ts`

---

## 5. Actions Catalogue Page

### 5.1 — From Static to Interactive (INCOMPLETE)

**Current state:** Same as triggers — read-only reference only.

**What to build:**
- Show usage count per action type (how many workflows use it).
- "Add to workflow" button opens a workflow-picker modal, then navigates to that workflow's builder with the action pre-appended.
- Pro actions locked with upgrade overlay.

**Files:** `src/app/features/actions/actions-page.component.ts`, `electron/ipc-handlers.ts`

---

## 6. Execution Logs Page

### 6.1 — Auto-Refresh ✅ IMPLEMENTED

**Implemented:** `logs:new` is sent from `AutomationEngine` (on run **start** and on completion/skip/error so the list shows `running` rows immediately), `app.onLogsNew` in preload, `logs-page` calls `reload()` on each event.

**Optional later:** Toast/banner when the user is scrolled down (“New logs — scroll to top”).

**Files:** `electron/engine/automation-engine.ts`, `electron/main.ts`, `electron/preload.ts`, `src/app/features/logs/logs-page.component.ts`

---

### 6.2 — Real-Time Step Progress ✅ IMPLEMENTED

**Implemented:**
- Engine emits `logs:stepProgress` with `{ logId, workflowId, stepIndex, stepType, stepKind, status, message, error }` (`automation-engine.ts` / `main.ts`).
- **Live run** panel on the execution logs page: multi-run aware, step list updates in real time, running pulse, outcome badge when the run finishes (after `reload` syncs status), per-run dismiss and **Clear finished**.

**Files:** `src/app/features/logs/logs-page.component.ts`

---

### 6.3 — Log Filtering & Search ✅ IMPLEMENTED

**Implemented:**
- **Status** and text search (workflow name, `message`, `error`, and **trigger_kind** substring).
- **Date range** (`From` / `To`) on the log’s **local calendar day** for `started_at`; if `from` is after `to`, the range is still applied inclusively (comparison swaps the two bounds only for filtering).
- **Trigger kind** dropdown (all distinct `trigger_kind` values in the current loaded page, up to **500** recent logs).
- URL query params: `q`, `status`, **`from`**, **`to`**, **`trigger`** (bookmarkable).
- Table column **Trigger** (humanized labels).

**Files:** `src/app/features/logs/logs-page.component.ts`

---

### 6.4 — Log Export ✅ IMPLEMENTED

**Implemented:**
- CSV and JSON export via save dialog (`logs:export` with `format: 'csv' | 'json'`). JSON includes nested `log_steps` per log.
- Execution logs page: **Export CSV** and **Export JSON** buttons.

**Files:** `electron/ipc-handlers.ts`, `electron/preload.ts`, `src/app/features/logs/logs-page.component.ts`

---

## 7. Variables Page

### 7.1 — Inline Edit ✅ IMPLEMENTED

**Implemented:** Edit / Save / Cancel on each variable row via `variables:update` (`variables-page.component.ts`).

---

### 7.2 — Variable Interpolation in Node Config

**Current state:** Variables exist in the DB but are never referenced in workflow node configs.

**What to build:**
- In `action-executor.ts` and `condition-evaluator.ts`, before executing a node, substitute `{{variableName}}` tokens in any config string value with the corresponding variable from the DB.
- In the builder config form, show an autocomplete dropdown when the user types `{{` in any text field, listing available variables.

**Files:** `electron/engine/action-executor.ts`, `electron/engine/condition-evaluator.ts`, `src/app/features/builder/node-config-form/node-config-form.component.ts`

---

## 8. Analytics Page

### 8.1 — Hardcoded Trend Labels (DUMMY)

**Current state:** "+12% vs last week", "+0.5%", "-15%", "+2" are static strings in the component.

**What to build:**
- In `ipc-handlers.ts`, extend `analytics:summary` to compute real week-over-week deltas:
  - Total runs: `COUNT(*)` for current week vs previous week.
  - Success rate: success count / total for current vs previous week.
  - Avg duration: `AVG(duration_ms)` current vs previous week.
  - Active workflows: current `enabled=1` count vs same 7 days ago (from `updated_at` change log).
- Return `{ value, delta, deltaPercent, trend: 'up'|'down'|'flat' }` for each KPI.
- Render a colored arrow (green up, red down) and real percentage.

**Files:** `electron/ipc-handlers.ts`, `src/app/features/analytics/analytics-page.component.ts`

---

### 8.2 — Real Chart Library

**Current state:** The bar chart for runs-per-workflow is rendered with inline `div` height styling — no real chart library.

**What to build:**
- Install a lightweight chart library (recommended: `Chart.js` with `ng2-charts` wrapper, or `echarts` with `ngx-echarts`).
- Replace the DIV bars with a proper `<canvas>` chart.
- Add a line chart for runs-over-time (last 30 days) on the analytics page.

**Commands:**
```bash
npm install chart.js ng2-charts
```

**Files:** `src/app/features/analytics/analytics-page.component.ts`

---

### 8.3 — Date Range Picker

**Current state:** Analytics always shows all-time data.

**What to build:**
- Add a date range selector (Last 7 days / Last 30 days / Last 90 days / Custom).
- Pass `{ from, to }` params to all `analytics:*` IPC calls; update SQL queries accordingly.

---

## 9. Marketplace Page

### 9.1 — Expand Template Library (DUMMY)

**Current state:** Only 4 templates exist, hardcoded in `marketplace-data.ts`.

**What to build:**
- Add at minimum 12 templates covering the categories described in the design doc:

| Template | Trigger | Actions |
|---|---|---|
| Morning Startup Routine | Time: 9:00 AM Mon–Fri | Open Chrome, Open Slack, Open VS Code |
| Clean Downloads Daily | Time: 11:00 PM daily | Run PowerShell: remove files older than 30 days |
| Shutdown at Midnight | Time: 12:00 AM | Run script: `shutdown /s /t 60` |
| Work Apps on Login | Startup trigger | Open Outlook, Teams, Slack |
| Mute on Headphone Disconnect | Device trigger (USB remove) | Audio: mute |
| Dark Mode at Sunset | Time: 7:00 PM | Dark mode: enable |
| Light Mode at Sunrise | Time: 7:00 AM | Dark mode: disable |
| High CPU Alert | CPU > 90% for 30 s | Notification: "CPU is overloaded" |
| Low Disk Space Alert | File watcher on drive | Notification: "Disk space low" |
| Auto-Lock on Idle | Idle > 5 min | Run script: `rundll32.exe user32.dll,LockWorkStation` |
| Daily Backup | Time: 2:00 AM | File operation: copy folder |
| Welcome Notification | Startup | Notification: "Good morning, ready to work?" |

- Each template includes: `name`, `description`, `category`, `tags`, `tier`, `nodes` (full node array with default configs), `previewImageUrl` (can be a generated SVG).

**Files:** `electron/marketplace-data.ts`

---

### 9.2 — Remote Template Registry (V2) ✅ IMPLEMENTED

**Implemented:** `electron/marketplace-remote.ts` — optional env **`TASKFORGE_MARKETPLACE_URL`** (JSON `{ "templates": [...] }` or a bare array), **5 s** `AbortController` timeout, merge with `MARKETPLACE_ITEMS` (remote wins on same `id`), **SQLite `settings` key** `marketplace_cache_json` for offline fallback, then built-ins only if cache empty.

**Optional later:** Dedicated `marketplace_cache` table + `fetched_at` for auditing.

---

### 9.3 — "Installed" State

**Current state:** Installing a template navigates to the builder, but there is no record that a template was installed.

**What to build:**
- Add a `source_template_id` column to `workflows`.
- After install, show a "Installed" badge on the template card.
- Allow re-installing (creates a second workflow copy) with a confirmation dialog.

---

## 10. AI Assistant Page

### 10.1 — Raw JSON Response ✅ IMPLEMENTED

**Implemented:** Draft preview card (name + node type/kind chips), **Review in Builder** link after create, collapsible developer JSON (`ai-assistant-page.component.ts`). *Optional:* icon per kind, separate **Create & Run** action.

---

### 10.2 — Streaming Responses ✅ IMPLEMENTED

**Implemented:**
- Main process: `streamWorkflowCompletion` in `electron/ai-workflow.ts` with `stream: true`; handler `ai:parseStream` sends chunks via `webContents.send('ai:streamToken', chunk)` (preload subscribes with `ai.onStreamToken`).
- Renderer: `ai-assistant-page` appends streaming text to **Model output (streaming)** during `parseStream`, then clears after the draft is built.

**Files:** `electron/ipc-handlers.ts`, `electron/ai-workflow.ts`, `electron/preload.ts`, `src/app/features/ai-assistant/ai-assistant-page.component.ts`

---

### 10.3 — Conversation History (partial)

**Implemented:** Session `conversation` signal; prior turns passed as `messages` into `ai:parse` / `ai:parseStream` (`ai-assistant-page.component.ts`).

**Remaining:** Token-budget trimming, richer multi-turn UX (e.g. “change the trigger to 8 AM” updating the last draft without always creating a new workflow).

---

### 10.4 — Heuristic Fallback Improvement

**Current state:** The heuristic (non-AI) parser in `ipc-handlers.ts` is very limited.

**What to build:**
- Expand the heuristic parser to cover all trigger and action kinds.
- Use keyword matching: "when I plug in headphones" → `device_trigger`, "at midnight" → `time_trigger` with `0 0 * * *`, "open Chrome" → `open_app` action.
- Return a confidence score; if confidence < 0.5, respond with "I didn't understand that — try describing a trigger and an action separately."

---

## 11. Team Page

### 11.1 — Invite Member (DUMMY)

**Current state:** "Invite Member" button renders but has no handler.

**What to build (local-only version for MVP):**
- Open a modal with fields: display name, email, role (dropdown: Admin / Editor / Viewer).
- On submit, insert a new row into `team_members` with `is_self = 0` and `last_active = null`.
- Show the new member in the list immediately.

**Files:** `src/app/features/team/team-page.component.ts`, `electron/ipc-handlers.ts`

---

### 11.2 — Remove Member

**Current state:** No delete action on member rows.

**What to build:**
- Add a "Remove" action (confirm dialog) that deletes the row from `team_members`.
- Prevent deleting the `is_self = 1` row.

---

### 11.3 — Role-Based UI (Future)

**What to build (V2):**
- Read the current user's role from the `is_self` row.
- Hide destructive actions (delete workflow, clear logs) from Viewer-role users.
- Show a role badge next to the user name in the header.

---

## 12. API Access Page

### 12.1 — API Key Scopes

**Current state:** The API key is a single global key with no scope restrictions.

**What to build:**
- Add a `scopes` column to the `settings` table (JSON array).
- UI: checkboxes for available scopes: `workflows:read`, `workflows:write`, `workflows:run`, `logs:read`.
- Pass the key's scopes through to `api-server.ts` and enforce them per endpoint.

---

### 12.2 — Multiple API Keys

**Current state:** Only one API key exists.

**What to build:**
- Create a dedicated `api_keys` table: `id, name, key_hash, scopes, created_at, last_used_at, enabled`.
- UI: list of keys with name, last used date, scopes, revoke button.
- "Create new key" generates a new key (shown once in a modal, never again).

---

### 12.3 — API Endpoint Expansion

**Current state:** The Express server only has `POST /v1/workflows/run`.

**What to build:**
- `GET /v1/workflows` — list all enabled workflows.
- `GET /v1/workflows/:id` — get workflow detail.
- `GET /v1/logs` — recent executions.
- `GET /v1/logs/:id` — execution detail with steps.
- `GET /v1/variables` — list non-secret variables.
- Document all endpoints in the UI (replace the current single curl example with a full API reference table).

**Files:** `electron/api-server.ts`

---

## 13. Audit Logs Page

### 13.1 — Audit Events from UI Actions (MISSING)

**Current state:** Audit log rows are only written when the REST API is called (`api-server.ts`). UI actions (create/delete workflow, toggle, etc.) are never audited.

**What to build:**
- Create a `writeAuditLog(action, resource, details)` helper in `db/database.ts`.
- Call it from `ipc-handlers.ts` for every mutating operation:
  - `workflow:create`, `workflow:update`, `workflow:delete`, `workflow:toggle`
  - `workflow:run` (manual or scheduled)
  - `variable:create`, `variable:update`, `variable:delete`
  - `settings:set`
  - `api:regenerateKey`
  - `team:invite`, `team:remove`

**Files:** `electron/db/database.ts`, `electron/ipc-handlers.ts`

---

### 13.2 — Audit Log Filtering

**Current state:** The audit log table shows all rows with no filtering.

**What to build:**
- Filter by action type, date range, resource type.
- Search by resource name or details text.

---

## 14. Settings Page

### 14.1 — Single Setting (INCOMPLETE)

**Current state:** Only the OpenAI API key is configurable.

**What to build — new settings sections:**

**General:**
- App language (placeholder for future i18n)
- Default workflow priority (low / medium / high)
- Confirm before deleting workflows (toggle, default on)

**Automation Engine:**
- Engine auto-start on app launch (toggle, default on)
- Max concurrent workflows (number input, default 5)
- Log retention: keep logs for N days (select: 7 / 30 / 90 / Forever)
- Log auto-clear on startup (toggle)

**Notifications:**
- Enable desktop notifications (toggle)
- Sound on workflow failure (toggle)
- Notification position (system default / top-right / etc.)

**Appearance:**
- Theme: Dark / Light / System (for future light mode)
- Accent color picker

**Advanced:**
- Developer mode (shows JSON toggles in builder by default)
- Reset all settings to defaults button
- Export all data (workflows + logs + variables) as a ZIP
- Import data from ZIP
- Danger zone: "Clear all data" button (confirm dialog)

**Files:** `electron/ipc-handlers.ts`, `electron/db/database.ts`, `src/app/features/settings/settings-page.component.ts`

---

## 15. Automation Engine

### 15.1 — Stubs to Implement

**Current state:** `action-executor.ts` has `TODO` stubs for:
- `kill_process`
- `file_operation`
- `input_simulation`

**What to build:**

**`kill_process`:**
- Config: `{ processName: string } | { pid: number }`
- Implementation: use `taskkill /IM <name> /F` via `child_process.exec` on Windows.

**`file_operation`:**
- Config: `{ operation: 'copy'|'move'|'delete'|'rename', source: string, destination?: string }`
- Implementation: use Node.js `fs/promises` (`copyFile`, `rename`, `unlink`, `mkdir`).
- Support glob patterns via `fast-glob` package.

**`input_simulation`:**
- Config: `{ type: 'keypress'|'type'|'mouse_move'|'mouse_click', key?: string, text?: string, x?: number, y?: number }`
- Implementation: use `robotjs` or `@nut-tree/nut-js` npm package.
- Note: this requires a native module — document rebuild steps.

**Files:** `electron/engine/action-executor.ts`, `electron/actions/` (new files per action)

---

### 15.2 — Error Recovery & Retry

**Current state:** If an action fails, the engine stops and marks the run as failed. No retry logic exists.

**What to build:**
- Add optional `retryCount` and `retryDelayMs` fields to node config.
- In `automation-engine.ts`, wrap action execution in a retry loop.
- Log each retry attempt as a separate `log_step` row with status `retrying`.

---

### 15.3 — Workflow Run Queueing

**Current state:** Workflows run immediately when triggered. If a workflow is already running and its trigger fires again, a second instance starts simultaneously.

**What to build:**
- Add a `concurrency: 'allow'|'queue'|'skip'` field to the workflow config.
- `queue`: add to a FIFO queue; run when the previous instance finishes.
- `skip`: if already running, do nothing (log a `skipped` entry).
- Track running workflow IDs in memory in `automation-engine.ts`.

---

## 16. Trigger Manager

### 16.1 — Missing Trigger Implementations

**Current state:** The following triggers are referenced in the design doc but partially or not implemented:

| Trigger | Status |
|---|---|
| `time_trigger` (cron) | Implemented via `node-schedule` |
| `startup_trigger` | Implemented (runs on app start) |
| `app_launch_trigger` | Partially — polls process list every 5 s (high CPU) |
| `wifi_trigger` | Implemented via polling |
| `file_trigger` | Implemented via chokidar |
| `cpu_trigger` | Implemented via polling |
| `idle_trigger` | Not implemented |
| `device_trigger` (USB/headphones) | Not implemented |
| `memory_trigger` | Not implemented |

**`idle_trigger`:**
- Use `electron.powerMonitor.on('lock-screen')` / `'user-did-resign-active'` + idle time from `powerMonitor.getSystemIdleTime()`.
- Config: `{ idleSeconds: number }`.

**`device_trigger`:**
- Listen to Windows device change events. Options:
  - Use `node-usb` npm package for USB events.
  - Use PowerShell `Register-WmiEvent` for device connect/disconnect.
- Config: `{ event: 'connect'|'disconnect', deviceType?: 'usb'|'audio'|'any' }`.

**`memory_trigger`:**
- Already polled via `systeminformation` — add evaluation logic in `trigger-manager.ts`.
- Config: `{ threshold: number, comparison: 'above'|'below' }`.

**App launch trigger improvement:**
- Replace 5 s polling with a `SetWindowsHookEx`-style approach (PowerShell background job or WMI event subscription) to avoid constant CPU usage.

**Files:** `electron/engine/trigger-manager.ts`, possibly new `electron/triggers/` folder.

---

### 16.2 — Trigger State Persistence

**Current state:** Active trigger jobs (cron, file watchers) are re-created on every app start by replaying all enabled workflows. If the trigger manager crashes, scheduled jobs are lost until restart.

**What to build:**
- Add a `trigger_state` table: `workflow_id, trigger_kind, last_fired_at, next_fire_at, missed_count`.
- After engine restart, detect missed triggers (e.g., a 9 AM trigger that was scheduled to run while the app was closed) and optionally re-fire them (configurable per workflow: "run missed triggers" toggle).

---

## 17. Action Executor

### 17.1 — Action Output Chaining

**Current state:** The output of one action is not available to the next node in the chain.

**What to build:**
- In `automation-engine.ts`, maintain a `context: Record<string, unknown>` object that is passed to each node.
- Each action can write to `context` (e.g., `http_request` writes `context.responseBody`, `run_script` writes `context.stdout`).
- In condition evaluator and subsequent action configs, allow `{{context.responseBody}}` interpolation (extends the variable interpolation system in §7.2).

---

## 18. Database & Seed Data

### 18.1 — Remove Demo Seed Data

**Current state:** `seedIfEmpty()` inserts 4 demo workflows, fake team members, fake audit entries, and a fake variable on first launch.

**What to build:**
- Remove the fake workflows, variables, team members, and audit entries from `seedIfEmpty()`.
- Keep only the essential seeds: one `api_key` row, one `team_members` row for `is_self = 1` (the local user), and default `settings` rows (engine auto-start = true, log retention = 30, etc.).
- On first launch (no workflows exist), show an onboarding experience in the renderer instead of fake data (see §18.2).

**Files:** `electron/db/database.ts`

---

### 18.2 — Onboarding Flow (New Feature)

**Current state:** No onboarding. User sees fake data.

**What to build:**
- Detect first launch: `SELECT COUNT(*) FROM workflows = 0`.
- Show a full-page welcome screen with two CTA buttons:
  - "Start from template" → navigates to `/marketplace`.
  - "Build from scratch" → navigates to `/builder/new`.
- Display 3 quick-start cards highlighting the app's core value (replace Task Scheduler, visual builder, reliable logs).

**Files:** New `src/app/features/onboarding/onboarding-page.component.ts`, `app.routes.ts`

---

### 18.3 — Migration System

**Current state:** The schema is applied once via `schema.sql`. There is no migration system — any schema change requires deleting the DB.

**What to build:**
- Add a `schema_migrations` table: `version INTEGER, applied_at TEXT`.
- On app start, compare the current schema version against the DB version and run incremental migration SQL files.
- Migrations live in `electron/db/migrations/001_add_source_template_id.sql`, etc.

**Files:** `electron/db/database.ts`, new `electron/db/migrations/` folder

---

## 19. IPC / Bridge Layer

### 19.1 — Type Safety ✅ IMPLEMENTED (renderer contract)

**Implemented:**
- `src/types/ipc-channels.ts` defines `IpcInvokeMap` (channel → `req` / `res`) and `AppStats`, aligned with `ipc-handlers.ts` / `preload.ts`. Example use: `AppStats` types the shell stats signal.
- Preload remains JavaScript-friendly; channel strings must stay in sync manually (comment in `ipc-channels.ts` points to main + preload).

**Optional later:** Path-alias the same file into the Electron `tsconfig` so `preload.ts` can import channel literals without duplication.

---

### 19.2 — Error Handling ✅ IMPLEMENTED

**Implemented:**
- Every invoke handler is registered via `ipcHandle()` in `electron/ipc-handle.ts`, which wraps `try/catch` and returns `IpcErrorEnvelope` (`__tfIpcErr`, `code`, `message`) on failure (including `EntitlementRequiredError`).
- Preload `inv()` detects the envelope and throws `Error` with `name: 'TaskForgeIpcError'` and `code` set for the renderer.
- `src/app/core/utils/ipc-error.ts` provides `TaskForgeIpcError` / `isTaskForgeIpcFailure()` for UI checks where needed.

---

## 20. Pro & Enterprise Entitlement

> **GitHub / open-source note:** Because the source code is publicly visible, entitlement cannot rely on compile-time feature flags alone. Every gate must be enforced in the Electron main process (not just the renderer). Renderer-only checks (CSS `display:none`, route guards) are UX conveniences, not security — the main-process IPC handlers are the authoritative gatekeepers.

### 20.0 — Open-core commercial model (target)

**Idea:** The **application source is public**, but **paid Pro and Enterprise entitlements** are backed by **your infrastructure**: customers receive an **organization license key** that only unlocks the app when **your license server** (or agreed self-hosted deployment) confirms it. The public tree does not contain your customer key database or billing logic.

**How the pieces fit:**

| Piece | Role |
|---|---|
| **Public GitHub repo** | Source for the desktop app (and optional self-build). Auditable, forkable, community contributions. |
| **Official binaries** (Microsoft Store, your site, etc.) | Built with **`TASKFORGE_LICENSE_API_URL`** pointing at **your** license API and **`TASKFORGE_LICENSE_MODE=online_strict` or `hybrid`** (see §20.9). Pro/Enterprise unlock only when the user enters an **organization license key** (org key) that **your server confirms** is active, within seat limits, and not revoked. No org validation → no paid features — even though the UI code is public. |
| **License / entitlement API** (private) | Source of truth for keys, activations, orgs, revocation — **not** shipped in GitHub. |
| **Self-build / contributors** | Builds without your production URL (or with `LICENSE_MODE=local`) may use **local HMAC keys** or the documented **dev bypass** for development. This path is **not** a substitute for a customer’s org key on **official** builds. |

**Product naming (UX):** Prefer **“Organization license key”** or **“Org license key”** in Settings and marketing copy. Technically the same value may still be stored as `pro_entitlement_key` in SQLite until a rename is justified.

**Why this works for GitHub:** Paying customers run **your** signed installers that talk to **your** servers. Someone who compiles from source gets the **free tier** unless they operate their **own** license server and keys (self-hosted enterprise) — which is an explicit commercial arrangement, not a crack of the public repo.

---

### Tier overview

| Tier | Features | How to unlock |
|---|---|---|
| **Free** | Workflows, basic triggers (time, app launch, startup), basic actions (open app, notification, open file, dark mode, audio), logs, settings | No key needed |
| **Pro** | Everything in Free + advanced triggers, advanced actions, AI Assistant, Variables, Marketplace, Analytics | **Official builds:** organization license key validated by **TaskForge license API** (§20.9). **Local/dev builds:** optional local HMAC or dev bypass (§20.1) — not valid for paid cloud entitlement. |
| **Enterprise** | Everything in Pro + Team management, API Access, Audit Logs | Same org license key tier as Pro on official builds (single key unlocks both); server may return `tier` to distinguish future SKUs. |

### 20.1 — License Key Format & Validation ✅ IMPLEMENTED

> **Local vs server:** Local HMAC proves **format and signature**; **official paid access** still requires that the key is **accepted by your org/license server** (§20.9) when online mode is enabled — subscription state lives server-side.

**Payload expiry:** If the decoded JSON payload includes numeric **`exp`** (Unix seconds), the key is rejected after that time (§20.8 key expiry — implemented client-side).

**Key format:** `tfent1.<base64urlPayload>.<base64urlHMAC>`

- `tfent1` — current fixed prefix; identifies the key type and version. The legacy three-part prefix from pre-rename builds is still accepted if the HMAC is valid.
- `<base64urlPayload>` — base64url-encoded JSON, e.g. `{"v":1,"tier":"pro_enterprise"}`.
- `<base64urlHMAC>` — HMAC-SHA256 of the payload string, keyed with `TASKFORGE_ENTITLEMENT_SECRET` (env var). If unset, the app tries the current dev default and the legacy dev secret from `electron/legacy-paths.ts` so older signed keys still validate locally.

Validation uses `timingSafeEqual` to prevent timing attacks. The key `local-dev-pro-enterprise` is also accepted as a dev bypass (not for distribution).

**Generating a key (dev):**
```bash
node scripts/generate-entitlement-key.mjs
# tfent1.eyJ2IjoxLCJ0aWVyIjoicHJvX2VudGVycHJpc2UifQ.xxxx
```

**For signed production keys**, set `TASKFORGE_ENTITLEMENT_SECRET` to a secret known only to you, then run the same script. Anyone who clones the repo uses the default dev secret, which produces keys that only validate with that same default — they cannot forge keys signed with your production secret.

**Files:** `electron/entitlement.ts`, `scripts/generate-entitlement-key.mjs`

---

### 20.2 — Settings Storage ✅ IMPLEMENTED

- The key is stored in the `settings` table under `pro_entitlement_key`.
- It is distinct from `api_key` (the REST API key for external integrations) and `openai_api_key` (the OpenAI key for AI Assistant).
- Clearing the key (`entitlement:setKey('')`) removes the row and immediately reverts the app to Free tier.

---

### 20.3 — IPC Enforcement ✅ IMPLEMENTED

All Pro / Enterprise IPC handlers call `assertProEnterprise(db)` or `isProEnterpriseUnlocked(db)` before doing any work. Locked callers receive either an empty result or an `EntitlementRequiredError` (message: `ENTITLEMENT_REQUIRED`).

| IPC Channel | Free behaviour | Pro/Enterprise behaviour |
|---|---|---|
| `variables:list` | Returns `[]` | Returns all variables |
| `variables:create` / `update` / `delete` | Throws `ENTITLEMENT_REQUIRED` | Normal operation |
| `analytics:summary` | Returns zeroed KPIs with "Pro license required" trend labels | Returns real computed analytics |
| `analytics:runsByWorkflow` | Returns `[]` | Returns top-10 workflows by run count |
| `analytics:systemHealth` | Returns all-zero health data | Returns real CPU/memory/queue/storage |
| `team:list` | Returns `[]` | Returns all team members |
| `team:invite` / `remove` | Throws `ENTITLEMENT_REQUIRED` | Normal operation |
| `audit:list` | Returns `[]` | Returns latest 500 audit rows |
| `audit:export` | Throws `ENTITLEMENT_REQUIRED` | Opens save dialog and writes CSV |
| `api:getKey` | Returns `''` | Returns stored REST API key |
| `api:regenerateKey` | Throws `ENTITLEMENT_REQUIRED` | Generates and stores new key |
| `marketplace:list` | Returns `[]` | Returns all templates |
| `marketplace:install` | Throws `ENTITLEMENT_REQUIRED` | Installs template as new workflow |
| `ai:parse` | Throws `ENTITLEMENT_REQUIRED` | Calls OpenAI or heuristic fallback |
| `workflows:createFromStarter` (Pro trigger/action kind) | Throws `ENTITLEMENT_REQUIRED` | Creates starter workflow |
| `workflows:appendNode` (Pro kind) | Throws `ENTITLEMENT_REQUIRED` | Appends node to existing workflow |
| `workflows:update` (contains Pro nodes) | Throws `ENTITLEMENT_REQUIRED` | Saves workflow |
| `entitlement:getStatus` | `{ unlocked: false }` | `{ unlocked: true }` |
| `entitlement:setKey` | Validates + stores key | Same |

**Pro trigger kinds:** `network_change`, `file_change`, `cpu_memory_usage`, `device_connected`

**Pro action kinds:** `run_script`, `http_request`

**Files:** `electron/entitlement.ts`, `electron/ipc-handlers.ts`

---

### 20.4 — Angular Route Guards ✅ IMPLEMENTED

`proEntitlementGuard` is applied to all Pro and Enterprise routes. A locked user navigating directly to `/analytics`, `/variables`, `/marketplace`, `/ai-assistant`, `/team`, `/api-access`, or `/audit-logs` is redirected to `/settings?unlock=1`.

Settings (`/settings`) is always accessible regardless of license state — it is the only way to enter a key.

**Files:** `src/app/core/guards/pro-entitlement.guard.ts`, `src/app/app.routes.ts`

---

### 20.5 — Sidebar & Header UI Gating ✅ IMPLEMENTED

- **Tier badge** in the header shows "**Free**" (muted, bordered) or "**Pro**" (green, filled) depending on entitlement.
- **Pro features** section in the sidebar: when locked, all nav links are hidden and replaced with a short message linking to Settings.
- **Enterprise** section in the sidebar: same — links hidden when locked.
- **Team chip** in the header (user name + role): only rendered when unlocked.
- Settings is moved into the Automation section of the sidebar so it is always reachable.

**Files:** `src/app/shared/shell/app-shell.component.ts`, `src/app/shared/shell/app-shell.component.html`

---

### 20.6 — Component-Level Button Disabling ✅ IMPLEMENTED

- On the **Triggers** page, "New workflow with this trigger" buttons for Pro trigger kinds are `disabled` when `proEntitled()` is false.
- On the **Actions** page, "New workflow with this action" and "Add to existing workflow…" buttons for Pro action kinds are `disabled` when locked.
- On the **Builder** page, saving a workflow that contains Pro nodes while locked shows a warning toast and redirects to Settings.

Each component handles the `ENTITLEMENT_REQUIRED` IPC error explicitly — showing a `ToastService.warning()` rather than a generic error, with a navigation prompt to Settings.

**Files:** `src/app/features/triggers/triggers-page.component.ts`, `src/app/features/actions/actions-page.component.ts`, `src/app/features/builder/builder-page.component.ts`, `src/app/core/utils/entitlement-error.ts`

---

### 20.7 — Settings Unlock UI ✅ IMPLEMENTED

A dedicated license card is the first section in Settings (copy may say **“Organization license key”** to align with §20.0). It includes:
- A password-type input for the key.
- "Save license" and "Clear" buttons.
- Live feedback: green "License accepted — Pro and Enterprise features are unlocked." or red "That key is not valid for this build."
- An amber banner shown when the user arrives via `?unlock=1` redirect explaining what the key unlocks.

**Future (§20.9):** On official builds, after the user saves the key, show secondary status text such as “Connected to TaskForge license service” / “Last verified: …” when online validation succeeds.

**Files:** `src/app/features/settings/settings-page.component.ts`

---

### 20.8 — Remaining / Future Work

| # | Task | Priority |
|---|---|---|
| 1 | **Online license validation** — full design in **§20.9**. Hybrid with local HMAC: server is source of truth for revocation, seats, and paid keys; optional offline grace. | V2 |
| 2 | **Key expiry** — encode `exp` (Unix timestamp) in the payload; `validateProEnterpriseKey` checks it. | ✅ Done (local payload `exp`) |
| 3 | **Per-seat scope** — encode `seats: N` in the payload; enforce a concurrent-user limit from the Team page. | V3 |
| 4 | **Upgrade CTA** — replace the "License key required" sidebar text with a proper upgrade card showing tier comparison and a link to a purchase page. | V2 |
| 5 | **`IsTierDirective`** — an Angular structural directive `*appIsTier="'pro'"` as a reusable alternative to the current `@if (proUnlocked())` pattern, once the license state is exposed as a global signal. | V2 |
| 6 | **Audit key activations** — write an audit log entry when a valid key is saved or cleared. | V2 |
| 7 | **Builder node picker tier badges** — once the visual node picker (§3.1) is built, show a lock icon on Pro node types and block insertion rather than only blocking saves. | V2 |

---

### 20.9 — Online license validation (planned)

> **Goal:** This is the **centerpiece of the commercial model** for official builds. TaskForge’s **official** apps must require **your license API** to acknowledge the **organization license key** before Pro/Enterprise IPC unlocks — so publishing source on GitHub does **not** grant free paid features to store-installed users by default.
>
> **Complement to §20.1:** Local HMAC can remain a **format check** or **self-hosted** path; **hybrid** / **online_strict** modes tie entitlement to **server truth** (revocation, seat caps, expiry), pairing the open client with **private**, billing-backed infrastructure.

#### 20.9.1 — Modes of operation

| Mode | Behaviour |
|---|---|
| **Local only** (current) | `isProEnterpriseUnlocked` = local HMAC or dev bypass. No network. |
| **Hybrid** (recommended for paid SKUs) | User must pass **local** format check first, then **online** validation (or a fresh cached OK) for entitlement to be `true`. Local path remains fallback for air-gapped enterprise deals via a compile-time or settings flag. |
| **Online strict** | **Recommended for official store builds:** entitlement requires a successful server response within the policy window; **no** unlock from HMAC alone — the org key must be recognized by **your** API. Dev bypass only in unsigned / dev channel builds if ever needed. |

Configure via environment / build flags, e.g. `TASKFORGE_LICENSE_MODE=local|hybrid|online_strict` (exact names TBD).

**Modes in practice:** **online_strict** store installers always talk to **your** license host for subscription/org state; **local** self-builds use only local HMAC / dev keys unless pointed at your (or a customer’s) license server.

#### 20.9.2 — Client responsibilities (Electron main)

1. **Stable device id** — Generate once on first launch, store in `settings` (e.g. `license_device_id` = UUID). Used as `device_id` or `installation_id` in API calls. Do not use raw hardware serials without hashing + disclosure in privacy policy if ever used.
2. **When to call the server**
   - On **`entitlement:setKey`** after local validation succeeds (activation / refresh).
   - On **app startup** if cached validation is stale (see grace).
   - **Background refresh** on a timer (e.g. every 12–24 h while app is open), rate-limited.
3. **HTTPS only** — Reject non-`https://` base URLs in release builds. Optional **certificate pinning** for the license host in branded builds.
4. **No secrets in logs** — Never log full license keys or bearer tokens; truncate in diagnostics.
5. **Timeout & retries** — e.g. 10 s timeout, exponential backoff, max 3 attempts per user-triggered save.

#### 20.9.3 — Suggested REST contract (license service you host)

Base URL from env: `TASKFORGE_LICENSE_API_URL` (e.g. `https://license.example.com`).

**`POST /v1/licenses/validate`** (or `/activate` on first use)

Request JSON (example):

```json
{
  "license_key": "tfent1....",
  "organization_id": "<optional org slug or UUID from checkout>",
  "device_id": "<uuid from settings>",
  "app_version": "2.1.0",
  "product": "taskforge-desktop"
}
```

Response JSON (example):

```json
{
  "valid": true,
  "tier": "pro_enterprise",
  "organization_name": "Acme Corp",
  "expires_at": "2027-01-01T00:00:00Z",
  "max_activations": 3,
  "activation_index": 1,
  "server_time": "2026-03-30T12:00:00Z",
  "refresh_after_sec": 86400
}
```

**Server semantics:** The server decides whether this key is tied to an **active org subscription** (paid, not revoked, within seats) — the client never trusts itself for that.

Error responses: `401` invalid key, `403` revoked or seat limit exceeded, `429` rate limited, `5xx` / network failure → client applies offline policy (`§20.9.4`).

Optional: server signs a short-lived **JWT** in the response body; client stores JWT and verifies with embedded public key (obfuscated build-time pubkey) to reduce trivial MITM on corporate SSL inspection — document trade-offs.

#### 20.9.4 — Caching and offline grace

Persist in SQLite `settings` (or a small `license_cache` table):

| Key | Purpose |
|---|---|
| `license_last_valid_at` | ISO timestamp of last `valid: true` from server |
| `license_offline_grace_sec` | Echo from server or default (e.g. 72 h) |
| `license_server_snapshot` | Optional: JSON blob of tier/expiry for UI |

**Grace rule:** If `now < license_last_valid_at + grace`, treat as **unlocked** even when offline. If grace **expired** and hybrid mode: either block Pro features until online check succeeds, or fall back to local HMAC-only (product decision — document in README for open-core vs commercial build).

On **revoked** key (`valid: false` from server): clear cache immediately, set entitlement locked, toast "License no longer valid."

#### 20.9.5 — Integration with existing code

- Extend **`electron/entitlement.ts`** (or new `electron/license-remote.ts`) with `refreshEntitlementOnline(db): Promise<OnlineResult>` called from `ipc-handlers.ts` inside `entitlement:setKey` and from a startup hook in `main.ts` after DB init.
- **`isProEnterpriseUnlocked(db)`** becomes:  
  `(localHmacValid(key) && onlinePolicySatisfied(db))` in hybrid mode, where `onlinePolicySatisfied` reads cache + grace.
- **`entitlement:setKey`** flow: trim → local `validateProEnterpriseKey` → if fail, return `invalid_key` → else POST to server → on success persist key + cache → on network error return `{ ok: false, error: 'network' }` or accept with warning (UX choice).
- New IPC optional: `entitlement:refreshOnline` for a manual "Check license" button in Settings.

**Files (planned):** `electron/entitlement.ts`, `electron/license-remote.ts` (new), `electron/ipc-handlers.ts`, `electron/main.ts`, `src/app/features/settings/settings-page.component.ts`, `electron/preload.ts`, `src/types/taskforge-window.d.ts`

#### 20.9.6 — Server-side (out of repo)

The license API is **not** part of the open-source app; implement with your stack (Node, Cloudflare Worker, etc.). Minimum features:

- Key registry (issued keys, tier, expiry, revoked flag).
- Activation rows: `(license_key_id, device_id, first_seen_at, last_seen_at)`.
- Enforce `max_activations`; on excess return `403`.
- Admin endpoint or dashboard to revoke key and force all clients to drop access after grace.

#### 20.9.7 — Open-source / GitHub implications

- **Public repo** ships **local-only** or **hybrid with empty `TASKFORGE_LICENSE_API_URL`** so contributors and self-hosters are not blocked; **commercial entitlement** is still enforced on **official** builds via your license host.
- **Official / store installers** set `TASKFORGE_LICENSE_API_URL` to **your** production host and **`TASKFORGE_LICENSE_MODE=online_strict`** (or strict hybrid) so **only org keys your API accepts** unlock Pro/Enterprise — **open source repo ≠ automatic paid-tier access** on distributed binaries.
- **Strip or disable `DEV_ENTITLEMENT_BYPASS`** in release CI for official channels (keep only in local dev), so bypass strings cannot appear in shipped binaries.
- **README:** State clearly: (1) building from source = free tier + dev keys for development; (2) **purchased** org keys work with **official** apps + **your** license service; (3) large customers may run a **private** license server (enterprise self-host) under contract.

#### 20.9.8 — Acceptance criteria

- With `LICENSE_MODE=hybrid` and URL set: valid server response → Pro IPC works; revoked response → Pro IPC fails within one refresh cycle.
- Airplane mode: app stays unlocked until grace elapses after last success.
- Rate limit: client does not hammer server more than once per N minutes on repeated failures.
- All validation decisions that affect IPC run in **main process**, not renderer.

---

## 21. Cross-Cutting Concerns

### 21.1 — Toast / Notification System

**Current state:** There is no global in-app notification/toast system. Success and error states are handled inconsistently per component.

**What to build:**
- Create a `ToastService` with methods `success(msg)`, `error(msg)`, `info(msg)`, `warning(msg)`.
- Render toasts in the `AppShellComponent` template (top-right corner, auto-dismiss after 4 s).
- Replace all existing ad-hoc alert/status patterns across components with `ToastService` calls.

**Files:** New `src/app/core/services/toast.service.ts`, new `src/app/shared/ui/toast/toast.component.ts`

---

### 21.2 — Confirm Dialog Service

**Current state:** Destructive operations (delete workflow, clear logs) use raw `confirm()` — which is blocked in sandboxed Electron.

**What to build:**
- Create a `ConfirmDialogService` that renders a proper modal: title, body text, confirm button (red), cancel button.
- Replace all `confirm()` calls with this service.

**Files:** New `src/app/core/services/confirm-dialog.service.ts`, new `src/app/shared/ui/confirm-dialog/confirm-dialog.component.ts`

---

### 21.3 — Loading States

**Current state:** Most pages do not show loading spinners while data is being fetched from IPC.

**What to build:**
- Create a `LoadingService` that manages a global loading overlay (for full-page loads) and a `loading` signal that components can use for inline spinners.
- All IPC calls in page components should set loading to `true` before the call and `false` after.

---

### 21.4 — Empty States

**Current state:** When lists are empty (no workflows, no logs, etc.) the page shows nothing or a generic message.

**What to build:**
- Create a reusable `EmptyStateComponent` that accepts: `icon`, `title`, `description`, `ctaLabel`, `ctaRoute`.
- Use it on every list page when data is empty.

---

### 21.5 — Keyboard Shortcuts ✅ IMPLEMENTED

**Implemented (see `app-shell.component.ts` / `.html`):**
- `Ctrl/Cmd+N` → New workflow (skipped when focus is in an input; viewers blocked with toast).
- `Ctrl/Cmd+F` → Focus `[data-tf-focus-search]`.
- In Builder: `Ctrl/Cmd+S` → save (`HotkeysService.saveBuilder$`); `Ctrl/Cmd+R` → test run (`HotkeysService.testRunBuilder$`).
- `Escape` → Close hotkey legend, confirm dialog response (cancel), or other shell-handled overlays.
- `?` (outside inputs) → Toggle keyboard shortcuts legend panel.

---

## 22. Implementation Phases

### Phase 1 — Cleanup & Real Data (2–3 weeks)
Remove all dummy data, connect existing UI to real IPC, fix broken interactions.

| # | Task | Section | Status |
|---|---|---|---|
| 1 | Queue / stats (no dummy queue; real pending + engine queue) | §1.4 | ✅ Done |
| 2 | Remove demo seed data; real default seeds | §18.1 | ✅ Done |
| 3 | Onboarding screen | §18.2 | ✅ Done |
| 4 | Sidebar counters (triggers/actions counts) | §1.2 | ✅ Done |
| 5 | Engine status badge | §1.1 | ✅ Done |
| 6 | Team header label (`is_self` + `/team`) | §1.3 | ✅ Done |
| 7 | Invite Member (local modal + IPC) | §11.1 | ✅ Done |
| 8 | Inline variable edit | §7.1 | ✅ Done |
| 9 | Global ToastService | §21.1 | ✅ Done |
| 10 | ConfirmDialog | §21.2 | ✅ Done |
| 11 | UI audit logging for mutations | §13.1 | ✅ Done (where wired) |
| 12 | Post-run status refresh on workflow cards | §2.1 | ✅ Done |
| 13 | Logs auto-refresh (`logs:new` + subscribe) | §6.1 | ✅ Done |
| 14 | Migration system (`schema_migrations` + `runMigrations`) | §18.3 | ✅ Done |
| 15 | Analytics trend labels (real deltas) | §8.1 | ✅ Done |
| 16 | Settings: log retention, notifications, engine | §14.1 | Partial — core settings keys exist; see §14.1 for any remaining toggles |

### Phase 2 — Feature Completion (3–4 weeks)
Complete all partially-built features and add the missing interactions.

| # | Task | Section | Status |
|---|---|---|---|
| 1 | **Pro/Enterprise entitlement system (license key)** | §20 | ✅ Done |
| 2 | Node type picker UI in builder | §3.1 | ✅ Done |
| 3 | Per-node config forms (replace raw JSON) | §3.2 | ✅ Done (schemas + JSON toggle) |
| 4 | Cron expression helper | §3.5 | ✅ Done |
| 5 | Builder validation & error highlighting | §3.4 | ✅ Done |
| 6 | Variable interpolation in engine | §7.2 | ✅ Done (`{{var}}` + `{{context.*}}`) |
| 7 | Implement `kill_process`, `file_operation`, `input_simulation` | §15.1 | Partial — kill/file ✅; `input_simulation` needs native module (§15.1) |
| 8 | Implement `idle_trigger`, `device_trigger`, `memory_trigger` | §16.1 | ✅ Done |
| 9 | Add retry logic to engine | §15.2 | ✅ Done (`retryCount` / `retryDelayMs` on nodes) |
| 10 | Add workflow concurrency modes | §15.3 | ✅ Done (`concurrency` on workflow) |
| 11 | Add action output chaining / context | §17.1 | ✅ Done |
| 12 | Expand marketplace to 12+ templates | §9.1 | ✅ Done |
| 13 | Replace analytics DIV chart with Chart.js | §8.2 | ✅ Done |
| 14 | Analytics date range picker | §8.3 | ✅ Done |
| 15 | Log filter persistence in URL | §6.3 | ✅ Done (`q`, `status`, `from`, `to`, `trigger`) |
| 16 | Log export (CSV/JSON) | §6.4 | ✅ Done (CSV + JSON) |
| 17 | Triggers/Actions pages: usage counts + "use" buttons | §4.1, §5.1 | ✅ Done |
| 18 | Duplicate workflow | §2.3 | ✅ Done |
| 19 | Bulk workflow actions | §2.4 | ✅ Done |
| 20 | AI response card UI | §10.1 | ✅ Done |
| 21 | AI streaming | §10.2 | ✅ Done |
| 22 | Expand API endpoints | §12.3 | ✅ Done (+ `GET /v1/variables`) |
| 23 | IPC type safety | §19.1 | ✅ Done (`src/types/ipc-channels.ts`) |
| 24 | IPC error handling | §19.2 | ✅ Done (`ipcHandle` + envelope + preload + `ipc-error.ts`) |

### Phase 3 — V2 Visual Builder & Advanced Features (4–6 weeks)
The flagship visual canvas builder and advanced integrations.

| # | Task | Section |
|---|---|---|
| 1 | Visual graph canvas builder | §3.3 |
| 2 | Real-time log step progress | §6.2 · ✅ Done (live panel + `logs:new` on run start) |
| 3 | Workflow run history inline panel | §2.2 · ✅ Done (last run panel on workflow cards) |
| 4 | AI conversation history | §10.3 |
| 5 | Multiple API keys with scopes | §12.1, §12.2 |
| 6 | Remote marketplace registry | §9.2 · ✅ Done (`TASKFORGE_MARKETPLACE_URL` + cache) |
| 7 | Marketplace "installed" state | §9.3 · ✅ Done (`source_template_id` + badge) |
| 8 | Trigger state persistence + missed trigger replay | §16.2 |
| 9 | Role-based UI (team permissions) | §11.3 |
| 10 | Keyboard shortcuts | §21.5 · ✅ Done |
| 11 | Data export / import (ZIP) | §14.1 |
| 12 | Online license validation (client: cache, grace, IPC) | §20.9 · Partial (`license-remote.ts`, `hybrid` / `online_strict`, startup refresh) |
| 13 | License key expiry (`exp` field in payload) | §20.8 · ✅ client decode |
| 14 | Upgrade CTA card replacing the locked-sidebar text | §20.8 |
| 15 | Builder node picker tier badges (lock icon on Pro nodes) | §20.8 |

### Phase 4 — V3 AI & Platform (Future)
Post-MVP AI enhancements and platform expansion.

| # | Task |
|---|---|
| 1 | Smart suggestions (detect repetitive user behaviour) |
| 2 | Template marketplace with community submissions |
| 3 | Cloud sync (workflows + logs across devices) |
| 4 | Team collaboration (shared workspace, real invite emails) |
| 5 | macOS support (replace Windows-specific system calls) |
| 6 | Plugin / extension system |
| 7 | Mobile companion app (view logs, toggle workflows) |
| 8 | **License server** — host the HTTPS API described in §20.9.3 / §20.9.6 (activation DB, revoke, rate limits) |
| 9 | Per-seat enforcement (decode `seats` from key payload, enforce in Team page; tie to server activations in §20.9) |

---

## Entitlement Quick-Reference

> Summary for anyone reading the open-source repo.

### Open-core summary (TaskForge)

| Topic | TaskForge approach |
|---|---|
| Open source | Desktop app source public on GitHub |
| Paid features | **Organization license key** + **your license API** on **official** builds (§20.9); main-process IPC enforcement |
| Self-build / dev | `LICENSE_MODE=local`, local HMAC keys, or documented dev bypass — not a substitute for paid entitlement on **official** installers |
| Why customers pay | Hosted license validation, org billing, revocation, seat limits — logic and key database **outside** the public repo |

### What is locked without a key?

| Feature | Page / Route |
|---|---|
| Variables (read + write) | `/variables` |
| Analytics (all KPIs and charts) | `/analytics` |
| Marketplace (browse + install templates) | `/marketplace` |
| AI Assistant (natural-language workflow builder) | `/ai-assistant` |
| Team management (invite, remove members) | `/team` |
| REST API key (generate, view) | `/api-access` |
| Audit logs (view, export) | `/audit-logs` |
| Advanced triggers: Network Change, File Change, CPU/Memory Usage, Device Connected | Triggers page + Builder |
| Advanced actions: Run Script, HTTP Request | Actions page + Builder |

### What is always free?

- All workflow CRUD (create, edit, delete, toggle, run)
- Basic triggers: Time Schedule, App Launch, System Startup
- Basic actions: Open Application, Show Notification, Open File/Folder, Dark Mode Toggle, Audio Control
- Execution logs (view, filter, clear)
- Settings (including the license key field)
- Onboarding

### How does gating work?

1. **Electron main process** — `electron/entitlement.ts` validates the stored key (format / HMAC today; **plus online org validation** on official builds per §20.9). All Pro/Enterprise `ipcMain.handle()` callbacks call `assertProEnterprise(db)` or `isProEnterpriseUnlocked(db)` before executing.
2. **Angular route guard** — `proEntitlementGuard` redirects direct URL navigation to `/settings?unlock=1`.
3. **Sidebar + UI** — Pro/Enterprise nav items hidden; buttons disabled; header badge shows "Free"/"Pro".

Renderer-side checks are UX only. The main-process IPC handlers are the authoritative gate.

**Official vs built-from-source:** Store-downloaded TaskForge should use **online_strict** so only your license server can grant Pro/Enterprise. A GitHub clone built locally without your production URL follows the **local/dev** path documented below — **not** the same entitlement as paying customers on official builds.

### Getting a key (dev / self-hosted)

```bash
# Uses the default dev secret — works only with that same secret
node scripts/generate-entitlement-key.mjs

# Or use the dev bypass string directly in the Settings input:
local-dev-pro-enterprise
```

For production distribution, set `TASKFORGE_ENTITLEMENT_SECRET` to a private value in the build environment. Keys generated with your secret will not validate on builds that use the default dev secret, and vice versa.

### Paid customers (organization license key)

Customers receive an **organization license key** from checkout or your billing portal. They paste it into Settings in the **official** app; the app contacts **your** license API (§20.9). **Without a key your server accepts**, Pro and Enterprise stay locked — org/premium state is enforced **server-side**, not by trusting the open client alone.

### Planned: online validation (§20.9)

**Online validation** is what ties **public source** to **paid entitlement** for official builds: set `TASKFORGE_LICENSE_API_URL` and **`online_strict`** (or strict hybrid); the app periodically `POST`s the org key for validation, caches the result, and uses **offline grace** (e.g. 24–72 h) after the last success. Revocation, org expiry, and seat limits are enforced **only** on your servers. The public repo documents the **API contract**; the **license service implementation and customer key database** stay private. See **§20.9** for the full specification.

---

*End of plan. Each section above is a self-contained unit of work; they can be assigned individually to implement in any order within a phase, as long as phase 1 prerequisites (real data foundation, IPC error handling) are completed first.*

**Note (2026-04-04):** Large Phase 3 / Phase 4 items (visual canvas §3.3, multi-turn AI §10.3 polish, RBAC §11.3, ZIP import §14.1, full online license server §20.9.6, etc.) remain **future** work where not marked ✅ — the checklist reflects the repo.
