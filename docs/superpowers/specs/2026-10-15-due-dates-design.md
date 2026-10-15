# Due Dates and Reminders: Design

Date: 2026-10-15
Status: Draft, awaiting review

## Goal

Round 4 of five follow-up rounds for Noteboard:

1. Backup + drag to reorder (done)
2. Rich text / Markdown (done)
3. Images in notes (done)
4. **Due dates and reminders** (this spec)
5. Kanban boards (next round)

Sharing notes with other people is out of scope for this version.

A note or list can have a date (with an optional time and a repeat). Noteboard reminds you when it's due while the app is open, shows what's overdue, and lists dated notes in an **Upcoming** agenda. Purposes: task deadlines, timed nudges, repeating chores and planning.

### Success criteria

- Setting "Tomorrow 9:00 am" on a note takes two clicks; the date shows on the note and its card.
- While Noteboard is open (any tab, even in the background), a reminder alerts at its time, once, in one tab.
- Reminders that came due while Noteboard was closed alert when it's next opened.
- A repeating note moves to its next date when marked done.
- Upcoming shows Overdue, Today, Tomorrow, Next 7 days, Later and Done.
- Old notes and old backups keep working.

### Constraints

- Same as earlier specs: no server, data in the browser (IndexedDB via Dexie), Next.js 16 Pages Router, React 19 with the React Compiler lint rules, Radix + CSS Modules, WCAG 2.2 AA, functional text at least 11px.
- No push server: reminders only fire while a Noteboard tab or the installed app is open. No calendar (.ics) export.
- No new date library; `Intl` and plain functions do the work.

## Decisions

| Topic | Decision |
|---|---|
| Date model | One date per note, optional time, optional repeat |
| Storage | `Note.due: Due | null`, local date and time strings (not timestamps) |
| Delivery | In-app only: system notification when the page is hidden, a reminder panel always |
| No time set | Alerts at 9:00 am; overdue from the next day |
| Done | "Mark done" keeps the note; a repeating note moves to its next date (lists get unticked) |
| Repeats | Daily, Weekdays, Weekly, Monthly, Yearly, Custom (every N days/weeks/months/years, chosen weekdays); ends never, on a date, or after N times |
| Alert actions | Open, Snooze (10 min, 1 hour, Tomorrow 9:00 am), Mark done, dismiss |
| Planning view | "Upcoming" filter chip: an agenda with sections |
| Editor | ⏰ "Date" button next to Pin opens a popover; a chip under the title |
| Backup | Format version 3 adds `due`; versions 1 and 2 still restore |
| Not included | Per-item dates in lists, alerts while the app is closed, calendar export, a settings screen, kanban |

## Part 1: Data and date rules

### Data

```ts
type Due = {
  date: string;              // 'YYYY-MM-DD', local date
  time: string | null;       // 'HH:MM' local, 24-hour; null = no time
  repeat: Repeat | null;
  doneAt: number | null;     // ms; set by Mark done on a note that doesn't repeat (or whose repeat has ended)
  alertedAt: number | null;  // ms; the alert for the current date (or snooze) has been shown
  snoozedUntil: number | null; // ms
};

type Repeat = {
  every: number;                              // whole number, 1–99
  unit: 'day' | 'week' | 'month' | 'year';
  weekdays: number[];                         // unit 'week' only; 0 = Sunday … 6 = Saturday; [] = the date's own weekday
  anchor: string;                             // 'YYYY-MM-DD', the date the repeat started from
  ends:
    | { type: 'never' }
    | { type: 'on'; date: string }            // last allowed date, inclusive
    | { type: 'after'; count: number; done: number }; // count 1–999; done = occurrences used so far
};
```

- `Note` gains `due: Due | null`. Dexie schema version 4 has the same stores as version 3 and an upgrade that sets `due: null` on every note without one. Versions 1–3 and their upgrades are unchanged. Nothing new is indexed.
- `NoteChanges` does not include `due`; it changes only through the functions below.
- Presets are stored as rules:
  - Daily: `{ every: 1, unit: 'day' }`
  - Weekdays: `{ every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5] }`
  - Weekly: `{ every: 1, unit: 'week', weekdays: [] }`
  - Monthly: `{ every: 1, unit: 'month' }`
  - Yearly: `{ every: 1, unit: 'year' }`

### Rules (`lib/due.ts`, `lib/repeat.ts`)

- **Due moment**: the date at its time, or at 09:00 when there's no time, in local time.
- **Alert time**: `snoozedUntil` when set, otherwise the due moment.
- **Overdue** (not done only): with a time, now is past the due moment; without a time, today (local) is after the date.
- **Done**: `doneAt` is set.
- **Next date** of a repeat, strictly after a given date:
  - Days: anchor + k × every days.
  - Weeks with weekdays: the listed weekdays, in weeks that are a multiple of `every` from the anchor's week (weeks start Monday).
  - Weeks without weekdays: anchor + k × every weeks.
  - Months: the anchor's day of the month, k × every months later, using the month's last day when it's shorter (anchor 31 Jan → 28/29 Feb → 31 Mar).
  - Years: the anchor's month and day, k × every years later (29 Feb → 28 Feb in other years).
  - Ends: none after `ends.date`; none once `done` reaches `count`.
- **Mark done**:
  - No repeat, or the repeat has no next date: set `doneAt` (now).
  - Repeat: move `date` to the next date after the current one; if that is still before today, keep moving to the first date on or after today. Each date moved past counts toward "after N times". If the series ends during this, the note stays on its last date and is marked done. Lists have all items unticked.
  - Clears `alertedAt` and `snoozedUntil`.
  - A toast "Marked done" (or "Moved to Fri 16 Oct") offers Undo, which puts back the previous `due` and items.
- **Setting, changing or removing** the date, time or repeat clears `doneAt`, `alertedAt` and `snoozedUntil`. Setting a repeat sets its `anchor` to the date.
- **Snooze**: sets `snoozedUntil`, clears `alertedAt`. "Tomorrow" means tomorrow at 09:00.
- **`updatedAt`**: bumped by setting/removing a date, Mark done, Undo and Snooze. Not bumped by recording `alertedAt`.
- **Archive and Trash**: notes there never alert and are left out of Upcoming; their `due` is kept, so restoring brings it back.
- **Make a copy**: copies `date`, `time` and `repeat`; `doneAt`, `alertedAt` and `snoozedUntil` start empty.
- **Converting** between note and list keeps the date.
- Board order, pinning and search ignore dates.

## Part 2: Reminder clock and alerts

### Clock (`lib/reminders.ts`, `useReminderClock()` called in `pages/_app.tsx`)

- Each tab requests the Web Lock `noteboard-reminders` and holds it while open; only the holder runs the clock. When it closes, a waiting tab gets the lock. Without Web Locks, every tab runs the clock.
- The clock watches (live query) notes that are not trashed or archived, not done, have `alertedAt === null` and have a `due`.
- It sets one timer for the earliest alert time, never more than 60 seconds ahead, and re-checks when the page becomes visible or gains focus.
- On a check, every watched note whose alert time has passed is due. In one transaction it sets `alertedAt` (now) on each, re-reading each note first so a note changed in another tab isn't alerted twice; then it alerts once for the batch.
- Reminders that came due while Noteboard was closed are due at the first check after opening, so they alert together.

### System notification

- Shown only when `document.visibilityState !== 'visible'` and `Notification.permission === 'granted'`.
- Through `navigator.serviceWorker.ready` → `registration.showNotification(...)` when a service worker is active; otherwise `new Notification(...)` (development, where the service worker is off).
- One note: title = note title (or "Untitled note"), body = the due text (e.g. "Today, 6:00 pm"), tag `reminder-<noteId>`, data `{ url: '/note?id=<noteId>' }`.
- Several notes: title "N reminders", body = their titles joined by ", " (cut to 120 characters), tag `reminders`, data `{ url: '/?view=upcoming' }`.
- `worker/index.js` handles `notificationclick`: closes the notification, focuses an open Noteboard window and navigates it to the URL, or opens a new window.
- Permission is requested when a date is saved from the popover and `Notification.permission === 'default'` (a click, so browsers allow the prompt). When it's `'denied'` or the API is missing, the popover shows: "Notifications are blocked. You'll see reminders while Noteboard is open." Saving works either way.

### Reminder panel (`components/ui/ReminderAlerts.tsx`)

- Lives in `_app` beside the toast provider; shows alerts from the clock in this tab.
- A panel at the bottom left (full width on screens narrower than 600px), above page content and below dialogs. It does not disappear on its own.
- It is a region named "Reminders"; new alerts are announced through a polite live region ("Reminder: Groceries, today 6:00 pm" or "3 reminders").
- One row per note, newest batch first, at most 3 rows; then "+N more · View in Upcoming" (a link to `/?view=upcoming`).
- Each row: note title, due text, and buttons **Open** (opens the note, removes the row), **Snooze** (a menu: 10 minutes, 1 hour, Tomorrow 9:00 am), **Mark done**, and **Dismiss** (✕, named "Dismiss reminder for <title>").
- Snooze, Mark done and Dismiss remove the row. Dismiss changes nothing else: the note stays overdue.
- A row is removed when its note is deleted, trashed, archived, marked done or its date changes elsewhere.
- Rows are not kept across reloads (the note's overdue state is).

## Part 3: Screens, backup and export

### Editor

- An icon button ⏰ "Date" (named "Add date", or "Change date" when set) in the top bar next to Pin. Not shown in Trash.
- It opens a Radix Popover:
  - Quick picks that save at once: "Later today · 6:00 pm" (shown before 17:00), "Tomorrow · 9:00 am", "Next week · Mon 9:00 am". They keep the current repeat.
  - Date (`<input type="date">`, required) and Time (`<input type="time">`, optional, with a "No time" button that clears it).
  - Repeat (`<select>`): Doesn't repeat, Daily, Weekdays (Mon–Fri), Weekly on <weekday>, Monthly on day <N>, Yearly on <d Mon>, Custom…
  - Custom shows: Every [number] [days / weeks / months / years]; for weeks, seven weekday toggle buttons (`aria-pressed`); Ends: Never / On [date] / After [number] times (radio group).
  - Buttons: Save, Cancel, and "Remove date" when the note has one.
  - Errors shown next to the field: missing date ("Choose a date."), an end date before the date ("The end date must be after the date."), numbers out of range.
- A chip under the title when the note has a date: "⏰ Today, 6:00 pm · ↻ Weekly". Clicking it opens the popover; an ✕ beside it ("Remove date") removes the date with an Undo toast. Overdue shows "Overdue" in the chip.
- Beside the chip: **Mark done** (hidden when done); when done, the chip reads "✓ Done" and offers "Undo".
- In Trash the chip shows without buttons.
- A new, unsaved note is created when its first date is set (same as typing).

### Date text (`formatDue`)

- Uses the browser's locale and 12/24-hour preference through `Intl.DateTimeFormat`.
- "Today", "Tomorrow", "Yesterday"; otherwise weekday and date ("Fri 16 Oct"); the year is added when it isn't this year ("Fri 16 Oct 2027"); then ", 6:00 pm" when there's a time.
- Repeat text: "Daily", "Weekdays", "Weekly", "Every 2 weeks on Mon, Thu", "Monthly", "Every 3 months", "Yearly"; plus ", until 1 Mar" or ", 3 times left".

### Cards (`components/board/CardDue.tsx`)

- A small chip at the bottom of the card: "⏰ Today, 6:00 pm · ↻" (↻ when it repeats).
- Overdue: red text and the word "Overdue" (colour is not the only cue). Done: "✓" and muted text. Contrast meets AA in light and dark themes.
- The card's accessible description gains e.g. "Due today, 6:00 pm, overdue, repeats weekly".

### Upcoming view

- `BoardView` gains `'upcoming'`; the chip "Upcoming" sits after Lists; URL `/?view=upcoming`. Label chips are hidden and `labelId` is ignored in this view; search applies.
- Notes with a date, not trashed or archived, in sections (each an `h2` over the usual card grid):
  - **Overdue**: overdue, oldest first.
  - **Today**, **Tomorrow**: not overdue, by time (no time first).
  - **Next 7 days**: the 5 days after tomorrow.
  - **Later**: everything after that.
  - **Done**: done in the last 30 days, newest first; collapsed behind a button "Done (N)" (`aria-expanded`).
- A note is placed by its date (snoozing doesn't move it). Empty sections are not shown.
- No drag to reorder and no Pinned group in this view.
- Empty: "No upcoming dates. Add one from a note's ⏰ button."

### Backup format version 3

- `BACKUP_VERSION = 3`; notes include `due`.
- Version 1 and 2 backups restore with `due: null`. A `due` that fails validation (bad date or time string, bad repeat) is dropped and the note is kept. Version 4 or higher: "This backup is from a newer version of Noteboard."
- Merge rules are unchanged (the newer note wins as a whole, `due` included). Restored notes whose alert time has already passed keep `alertedAt` as stored; when it's missing they get `alertedAt` = restore time, so a restore doesn't set off a burst of old alerts.

### Markdown export

- A note with a date gets a line after its labels line: `⏰ Due Fri 16 Oct 2026, 9:30 am · repeats weekly`, or `⏰ Done (was due Fri 16 Oct 2026)`.

## Code structure

| Path | Responsibility |
|---|---|
| `lib/types.ts` | `Due`, `Repeat`; `Note.due`; `BoardView` gains `'upcoming'` |
| `lib/db.ts` | Schema v4 (`due: null` upgrade) |
| `lib/repeat.ts` | Presets, `nextDate(repeat, after)`, repeat text |
| `lib/due.ts` | Due moment, alert time, overdue, `markDoneChanges`, `formatDue`, sections |
| `lib/notes.ts` | `setDue`, `removeDue`, `markDone`, `snooze`, `restoreDue` (Undo); copy and create carry `due` |
| `lib/reminders.ts` | Clock, Web Lock, due batch, notifications, permission |
| `lib/filters.ts` | Upcoming view: `selectUpcoming(notes, labels, query, now)` |
| `lib/backup.ts` | Version 3 parse/validate; Markdown line |
| `worker/index.js` | `notificationclick` |
| `components/editor/DatePopover.tsx`, `DueChip.tsx`, `EditorToolbar.tsx`, `NoteEditor.tsx` | Setting dates, chip, Mark done |
| `components/board/CardDue.tsx`, `NoteCard.tsx`, `UpcomingView.tsx`, `FilterChips.tsx`, `pages/index.tsx` | Card chip, Upcoming |
| `components/ui/ReminderAlerts.tsx`, `pages/_app.tsx` | Reminder panel, clock wiring |

## Testing

- Vitest, date maths: each preset; every N; weekdays; month ends (31st), leap years (29 Feb); ends on a date and after N; Mark done skipping missed dates and counting them; series ending; a clock change (Europe/London on 25 Oct 2026) keeps 09:00 at 09:00; overdue with and without time; `formatDue` today/tomorrow/other year.
- Vitest, clock (fake timers, Notification and lock stand-ins): alerts once per date; batches missed ones; skips Archive, Trash and done; a reload doesn't alert again; snooze alerts again; system notification only when hidden and granted; without Web Locks still alerts once per note.
- Vitest, storage: schema v4 upgrade keeps notes and adds `due: null`; `setDue`/`markDone`/`snooze`/Undo and `updatedAt`; copy resets state; backup v3 round trip; v1 and v2 restore; invalid `due` dropped; restored past-due notes don't alert; Markdown line.
- React Testing Library: popover quick picks, date/time, repeat presets and Custom, errors, Remove date; chip and Mark done with Undo; Trash read-only; card chip and description; Upcoming sections, order, Done collapsed, empty message, no drag; reminder panel rows, Open, Snooze, Mark done, Dismiss, "+N more", live announcement.
- Manual in Chrome: a real notification while the tab is hidden, clicking it, two tabs open (one alert), sleeping the laptop past a reminder, phone width, the production build with the service worker, a reminder missed while closed.

## Out of scope

- Dates on individual list items.
- Alerts while Noteboard is closed (needs a push server), calendar export.
- A settings screen (default reminder time is fixed at 09:00).
- Kanban boards (round 5).
