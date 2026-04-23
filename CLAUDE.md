# CLAUDE.md — Codex Jana Timesheet

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript 5
- **Database:** PostgreSQL via Prisma ORM 6
- **Auth:** NextAuth v4 (JWT strategy) — default: password + OTP; optional: Azure AD (`AUTH_MODE=azuread`)
- **Styling:** Tailwind CSS 4, PostCSS
- **Email:** Nodemailer
- **Scheduling:** node-cron (runs in `instrumentation.ts` when `ENABLE_SCHEDULER=true`)
- **PDF/Export:** PDFKit
- **Date handling:** date-fns + date-fns-tz (IST timezone throughout)
- **Testing:** Vitest + jsdom

## Local Development

```bash
npm run dev          # Start dev server
npm run build        # prisma generate && next build
npm start            # Production server
npm test             # Run unit tests (Vitest)
npm run test:watch   # Watch mode
npm run smoke        # lint + test

# Database helpers
npm run db:local     # Start local DB
npm run db:migrate   # Apply migrations
npm run db:seed      # Seed data
npm run db:generate  # Regenerate Prisma client
Key env vars: DATABASE_URL, NEXTAUTH_SECRET, APP_BASE_URL, ENABLE_SCHEDULER, AUTH_MODE

Pages
User-facing
Route	Description
/	Root / landing
/login	Login screen
/auth/set-password	Password setup after OTP
/dashboard	Main user dashboard
/timesheets/[id]	Timesheet editor
/timesheets/[id]/confirmation	Submission confirmation
/timesheets/month/[monthKey]	Monthly timesheet view
/forbidden	Access denied
Admin
Route	Description
/admin	Config and oversight
/admin/edit-requests	Edit request management
/admin/reports	Reporting and analytics
Architecture
Layer pattern: app/api/ route handlers → services/ (business logic) → Prisma (data)

API routes live under /api/v1/ with a standardised response wrapper (lib/api-route.ts)
In-memory rate limiting in lib/rate-limit.ts
RBAC matrix in lib/rbac.ts; roles: PROGRAM_HEAD, ASSOCIATE_DIRECTOR, ADMIN, OPERATIONS
Background jobs: auto-submit and freeze run at 0 0 * * * Asia/Kolkata; triggered from instrumentation.ts
Job endpoints accept JWT session or x-job-secret header
Business rules to know:

Time resolution: 10-minute increments
Submission requires totalMinutes === assignedMinutes exactly
Three allocation modes: day (source of truth), week, month
Calendar states: NONE, HALF_DAY, FULL_DAY, manual holiday
Testing
Unit tests are in tests/unit/. Run with npm test. Coverage with npm run test:coverage.

Tests cover: auth flows, RBAC, autosave, timesheet calculations, edit-request lifecycle, reports, workflow rules.

Key Files
File	Purpose
lib/rbac.ts	Role-based access control
lib/timesheet-allocation-forms.ts	Allocation business logic
services/timesheet-service.ts	Core workflow orchestration
services/scheduler-service.ts	Cron job management
lib/autosave.ts	Draft persistence logic
prisma/schema.prisma	Database schema
instrumentation.ts	Scheduler entry point (Next.js hook)


---

## Dark Mode Implementation Rules

The app has full dark mode. All new UI code must follow these rules.

**Use semantic tokens — never hardcode light-theme classes:**

| Intended use | Correct class | Forbidden |
|---|---|---|
| Page / card background | `bg-(--color-surface)` | `bg-white` |
| Raised surface | `bg-(--color-surface-raised)` | `bg-stone-50` |
| Primary text | `text-(--color-text)` | `text-stone-950`, `text-stone-900` |
| Subtle text | `text-(--color-text-subtle)` | `text-stone-700` |
| Muted / label text | `text-(--color-text-muted)` | `text-stone-600`, `text-stone-500` |
| Default border | `border-(--color-border)` | `border-stone-200` |
| Strong border | `border-(--color-border-strong)` | `border-stone-300` |
| Divider | `divide-(--color-border)` | `divide-stone-200`, `divide-stone-100` |
| Error states | `bg-(--color-error-bg) border-(--color-error-border) text-(--color-error-text)` | `bg-rose-50 border-rose-200 text-rose-700` |
| Foreground on yellow fill | `text-stone-950` | `text-(--color-text)` or `text-(--color-primary-text)` inside yellow fills |

**Use `dark:` pairs for semantic status colors and interactive component states:**
- Semantic status: `bg-emerald-50 dark:bg-emerald-950`, `border-emerald-200 dark:border-emerald-900`, etc. (badge, toast, calendar cells — multiple hues per state).
- Interactive component states where no semantic token covers the need: e.g. inactive view tabs use `dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700`.
- Never use `dark:` for plain structural layout — that's what tokens are for.

**Native form controls on dark surfaces:** `globals.css` sets `color-scheme: dark` on `.dark` (and `color-scheme: light` on `:root`). This is the primary control that makes native browser overlays — especially `<select>` dropdown popup lists — readable in dark mode: OS-rendered popup layers follow the page-level `color-scheme`, not individual element-level overrides. Additionally, add `dark:[color-scheme:dark]` to individual `<input>` elements for their in-element widgets (calendar icon, date picker, scrollbars). The shared `Input` component already includes this. Do not rely solely on element-level `color-scheme` for `<select>` popups.

**`<option>` elements inside `<select>`:** The OS popup layer that renders `<option>` items is not directly controlled by the page `color-scheme`. Apply inline styles `{ colorScheme: "light", color: "CanvasText", backgroundColor: "Canvas" }` to each `<option>` so the popup list items use system color keywords and remain legible on all platforms. The `<select>` itself still gets `dark:[color-scheme:dark]` for its collapsed-state widget. Reference implementation: `calendarDayStateOptionStyle` in `components/timesheets/timesheet-editor.tsx`.

**CSS layer order — critical rule:** Tailwind places all utilities in `@layer utilities`. Any CSS written outside a layer (unlayered) beats layered CSS regardless of specificity. The `a { color: inherit }` base reset is inside `@layer base` for this reason — do not move it out. If you add new global element resets to `app/globals.css`, put them inside `@layer base` so Tailwind utilities can override them.

**Key files:**
- `app/globals.css` — all token definitions under `:root` and `.dark`; `@layer base` resets (`a { color: inherit }`); `::selection` / `.dark ::selection` highlight colors; `button, input, textarea, select { font: inherit }` form-control font reset (outside `@layer base`, intentionally — no utility ever needs to override font on these elements)
- `components/common/theme-provider.tsx` — `useTheme()` hook
- `components/common/theme-toggle.tsx` — sun/moon toggle button
- `components/common/input.tsx` — shared `Input` component with `dark:[color-scheme:dark]`
- `components/timesheets/timesheet-editor.tsx` — `calendarDayStateOptionStyle` constant: reference for `<option>` inline-style pattern

**Login page animation layer:**
`components/auth/login-screen.tsx` contains an inline `<style>` block (`loginBgStyles`) that defines three keyframes (`login-float-up`, `login-float-diagonal`, `login-float-sway`) and a `.login-bg-shape` base class. The animation canvas is a `fixed inset-0 z-0` div inserted as the first child of `<main>`, after `<ThemeToggle>`. The main content wrapper carries `relative z-10` to sit above it. Shape colours use `var(--color-border)` for strokes and `var(--color-surface-raised)` for neutral fills — these resolve automatically in both themes. Amber fills use the literal `rgba(252,211,77,0.14)` value because amber-300 is theme-invariant (same hex in both `:root` and `.dark` per `globals.css`). The vignette uses `color-mix(in srgb, var(--color-bg) 96%, transparent)` so it fades to the correct background in both modes. Do not replace token-based values with hardcoded hex when modifying this component.

**Rule:** Any future change that modifies theme-related infrastructure (new tokens, new toggle placement, persistence mechanism change) must update both `README.md` (user-facing dark mode section) and `CLAUDE.md` (this rules section) in the same pass.