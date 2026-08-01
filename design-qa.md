# Design QA — Admin employee CRUD modal

Date: 01/08/2026

## Source reference

- `C:/Users/devmk/AppData/Local/Temp/codex-clipboard-462c8197-0f1a-4e35-af70-466835ca0dba.png`
- Reported issues: dialog overflowed the viewport, unrelated system-test controls appeared inside the form, user credential fields were unclear/missing, no close button, outside click did not dismiss the dialog.

## Implementation screenshots

- Desktop 1302×1072: `design-qa-admin-modal-desktop.png`
- Mobile 390×844: `design-qa-admin-modal-mobile.png`

## Checks performed

- Desktop dialog bounds: 680×763.6 px at y=154.2; bottom=917.8 within a 1072 px viewport.
- Mobile dialog bounds: 369.2×823.2 px at x=10.4/y=10.4; bottom=833.6 within an 844 px viewport.
- Verified visible close button and successful dismissal with both the X button and a click outside the dialog.
- Verified `รหัสผู้ใช้`, `Username เข้าใช้งานระบบ`, and the existing decoded password are present in edit mode.
- Verified add mode explains that the user ID is generated automatically and preserves the default-password behavior.
- Verified the unrelated `สร้างข้อมูลสมมติ 7 วัน` and `Full Pipeline Test` controls are absent.
- Verified both branch and role controls are searchable dropdowns; typing `ยูดี` filters to `ยูดีทีสมายล์`.
- Verified the action buttons remain visible at the bottom and the form scrolls inside the dialog when necessary.
- Browser console errors during the desktop/mobile CRUD flow: none.

## Iteration history

1. Removed unrelated maintenance controls from the employee edit dialog.
2. Added a constrained flex layout, internal scrolling, visible X button, outside-click dismissal, and responsive mobile spacing.
3. Restored user ID and credential context while keeping profile/password details loaded on demand.
4. Compared the broken reference and both implementation screenshots together; no blocking layout or interaction issue remained.

final result: passed
