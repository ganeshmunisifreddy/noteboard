# Images in Notes: Design

Date: 2026-10-15
Status: Draft, awaiting review

## Goal

Round 3 of four follow-up rounds for Noteboard:

1. Backup + drag to reorder (done)
2. Rich text / Markdown (done)
3. **Images in notes** (this spec)
4. Due dates and reminders

Sharing notes with other people is out of scope for this version.

Notes and lists can hold images (phone photos, screenshots, images from the web, sketches and diagrams) in a gallery at the top of the note, like Google Keep.

### Success criteria

- On a phone, a user can snap a receipt into a note; it shows on the note and on its card.
- Images survive a reload, work offline and come back from a backup.
- The board stays fast with many photos (cards use small thumbnails).
- Old notes and old backups keep working.

### Constraints

- Same as earlier specs: no server, data in the browser (IndexedDB via Dexie), Next.js 16 Pages Router, React 19 with the React Compiler lint rules, Radix + CSS Modules, WCAG 2.2 AA, functional text at least 11px.
- Images are stored apart from the note text (an `attachments` table), never inside `Note.content` (keeps the Markdown clean and suits a future sync backend).
- No new image-processing dependency; the browser's own `createImageBitmap` and canvas do the work.

## Decisions

| Topic | Decision |
|---|---|
| Placement | A gallery above the title, for text notes and lists; not inside the text |
| Storage | Dexie table `attachments` (schema v3), image data as `Blob`s |
| Processing | Resize on the device: full image longest side 2048px, thumbnail 480px |
| Formats | Photos as JPEG (quality 0.85); images with transparency as WebP where the browser can write it, otherwise PNG |
| Limits | 20 images per note; source files over 25 MB refused |
| Backup | Format version 2 adds images (base64); version 1 still restores |
| Markdown export | Text only, with a line noting the number of images |
| Not included | OCR, cropping/editing, reordering images, images inside the text |

## Part 1: Storage and life cycle

### Data

`Attachment` (new type in `lib/types.ts`):

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUID |
| `noteId` | `string` | The note it belongs to |
| `position` | `number` | Gallery order (added order: 0, 1, 2, …) |
| `blob` | `Blob` | Full image |
| `thumb` | `Blob` | Thumbnail |
| `type` | `string` | MIME type of `blob` |
| `width`, `height` | `number` | Of `blob`, in pixels |
| `size` | `number` | Bytes of `blob` |
| `alt` | `string` | Description; `''` when none |
| `createdAt` | `number` | ms since epoch |

- Dexie schema version 3 adds `attachments: 'id, noteId'`. Versions 1 and 2 and their upgrades are unchanged. `Note` does not change.

### Processing

- Decode with `createImageBitmap(file)` (orientation from EXIF is applied by the browser).
- Full image: scale down so the longest side is at most 2048px (never scale up).
- Thumbnail: longest side at most 480px.
- Output format:
  - If the source is JPEG, or has no transparency: JPEG, quality 0.85.
  - If it has transparency (PNG, WebP, GIF first frame): WebP (quality 0.9) when `canvas.toBlob` produces WebP, otherwise PNG.
- An image already within the size limit and under 1.5 MB is kept as it is (no re-encoding) for the full image; its thumbnail is still made.
- Files whose type doesn't start with `image/`, or that the browser can't decode, are refused with a message naming the file.

### Life cycle

- Adding, removing or describing an image counts as an edit of the note: `updatedAt` is bumped (shown as "Edited"; newer copy wins in a backup merge).
- Archive, Trash and restore don't touch attachments (they follow the note's id).
- "Make a copy" copies the note's attachments (new ids, same blobs, same order and descriptions).
- Deleting a note forever, emptying Trash and the 30-day Trash purge delete the note's attachments in the same transaction.
- Removing an image can be undone from its toast; Undo puts back the same record.
- Board order, search and note/list conversion ignore images; converting between note and list keeps the gallery.

### Limits and errors

- More than 20 images on a note: extra files are not added; message "Notes can have up to 20 images."
- Source file over 25 MB: "That image is too large (over 25 MB)."
- Unreadable file: "Couldn't add <file name>: this browser can't read it." Other files in the same batch are still added.
- Storage full (quota error): "Couldn't add the image: storage is full." Nothing is half-saved (each image is saved in one transaction with the note's `updatedAt`).

## Part 2: Adding, showing and viewing

### Adding

- An "Add image" icon button in the editor's top bar (next to Pin) opens a hidden `<input type="file" accept="image/*" multiple>`; phones offer the camera from the system sheet.
- Pasting image files anywhere on the note page (title, text or elsewhere) adds them to the gallery. When the clipboard holds text and images together, the text is pasted where the cursor is and the images go to the gallery.
- Dragging image files over the note page shows a "Drop to add images" overlay; dropping adds them. Non-image files are ignored.
- While an image is processed and saved, its gallery slot shows a placeholder with a progress indicator.
- Notes in Trash: no Add image button, paste or drop; the gallery is view-only.
- A new note that isn't saved yet is created when its first image is added (same as typing).

### Gallery (editor, above the title)

- 1 image: full width, height up to 360px (contained, not cropped).
- 2 images: side by side.
- 3 or more: square thumbnails, 3 per row (2 on screens narrower than 600px).
- Each image is a button named "Open image N of M" plus its description when set.

### Viewer

- A full-screen Radix Dialog with a dimmed backdrop showing the full image, scaled to fit.
- Counter "N of M"; Previous and Next buttons; Left and Right arrow keys; Esc closes and focus returns to the image button that opened it.
- A "Description" text field under the image, saved when it loses focus (counts as an edit).
- "Remove" deletes the image and shows a toast "Image removed" with Undo.
- In Trash: no Description editing and no Remove.

### Cards

- Images sit at the top of the card, edge to edge, using thumbnails:
  - 1 image: full width, height up to 200px (cropped to fill).
  - 2 images: side by side.
  - 3 or more: one large and two small; "+N" on the last when there are more than 3.
- Clicking anywhere on the card still opens the note.
- The card's accessible description gains "N images" (or "1 image"); the card images themselves are hidden from assistive technology.
- Object URLs are created for visible cards and revoked when a card unmounts.
- Cards are measured by the board layout as today, so images don't make cards jump once loaded (image boxes have fixed heights).

## Part 3: Backup and export

### Backup format version 2

```json
{
  "format": "noteboard-backup",
  "version": 2,
  "exportedAt": "…",
  "notes": [],
  "labels": [],
  "attachments": [
    { "id": "…", "noteId": "…", "position": 0, "type": "image/jpeg", "width": 2048, "height": 1536,
      "alt": "", "createdAt": 0, "data": "<base64>", "thumb": "<base64>" }
  ]
}
```

- "Back up notes" writes version 2 with every attachment.
- Version 1 backups (no `attachments`) restore as today. Version 3 or higher: "This backup is from a newer version of Noteboard."
- Merge: images follow their note. When a note is added, or replaced because the backup copy is newer, its local attachments are replaced by the backup's attachments for that note. Notes left unchanged keep their local attachments. Attachments whose note is not in the backup are ignored. Attachments with missing or invalid data are skipped.
- The restore is one transaction over notes, labels and attachments.
- The restore message is unchanged (counts notes and labels).

### Markdown export

- Text only. A note with images gets a line `_N images (not included in the Markdown export)_` (or "1 image") after its labels line.

## Code structure

| Path | Responsibility |
|---|---|
| `lib/types.ts` | `Attachment` |
| `lib/db.ts` | Schema v3 (`attachments`) |
| `lib/images.ts` | `fitWithin(width, height, max)`, `outputFormat(...)`, `processImage(file, tools?)` (decoder/encoder injectable for tests) |
| `lib/attachments.ts` | `addImages(noteId, files)`, `removeAttachment(id)`, `restoreAttachment(attachment)`, `describeAttachment(id, alt)`, `useNoteAttachments(noteId)`, `useAttachmentCounts()` / board thumbnails |
| `lib/notes.ts` | Copy and delete-forever/empty/purge handle attachments |
| `lib/backup.ts` | Version 2 build/parse/merge/restore; Markdown image line |
| `lib/useObjectUrl.ts` | Object URL for a `Blob`, revoked on change/unmount |
| `components/editor/Gallery.tsx` | Gallery above the title |
| `components/editor/ImageViewer.tsx` | Full-screen viewer |
| `components/editor/EditorToolbar.tsx`, `NoteEditor.tsx` | Add image button, paste and drop |
| `components/board/CardImages.tsx`, `NoteCard.tsx` | Card thumbnails and description |

## Testing

- Vitest: `fitWithin` and `outputFormat` rules; `processImage` with fake decode/encode (scaling, kept-as-is, thumbnail, unreadable file); `addImages` limits (20 images, 25 MB), quota error leaves nothing saved, `updatedAt` bumped; remove and Undo; copy and delete-forever/empty/purge handle attachments; schema v3 upgrade keeps notes.
- Vitest: backup v2 round trip with images; v1 still restores; merge rules (new note, newer note replaces images, unchanged note keeps local images, orphan and invalid attachments skipped); Markdown image line.
- React Testing Library: gallery layouts and names; viewer counter, previous/next, arrow keys, Esc, description saving, Remove with Undo, Trash read-only; card image layouts, "+N", "N images" description; Add image button, paste and drop add images (with processing faked).
- Manual in Chrome: a real phone photo and a large PNG screenshot, paste a screenshot, drag files in, phone width, board performance with many images, backup restore into a fresh origin, offline.

If `fake-indexeddb` under jsdom can't store `Blob`s, tests use a small Blob stand-in for storage checks (to be confirmed while planning).

## Out of scope

- Text recognition in images, cropping or editing, reordering images, images inside the text.
- Downloading images from a pasted or dropped web address (only image data the browser provides).
- Including images in the Markdown export.
