# Accessibility Conformance Report — Archyne

**Based on VPAT® 2.5 (WCAG edition).**

> **Status: draft, unsigned.** This report is complete and honest about its
> evidence, but it is **not** a signed conformance claim. A signed VPAT
> requires assistive-technology testing that has not yet been performed —
> §"What has not been tested" says exactly what is missing. Treat every
> "Supports" below as "supports, on the evidence stated", and read the
> remarks.

|                         |                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**             | Archyne — a visual editor for Mermaid diagrams                                                                                                                                                                                                                                                       |
| **Version**             | 0.1.x                                                                                                                                                                                                                                                                                                |
| **Report date**         | 2026-08-01                                                                                                                                                                                                                                                                                           |
| **Product description** | A local-first, browser-based diagram editor with two-way sync between a canvas and Mermaid source. Also distributed as an Electron desktop application and as an embeddable iframe.                                                                                                                  |
| **Evaluation methods**  | Automated testing with axe-core 4.12.1 in a real browser across 8 interface surfaces × 2 themes; automated testing under jsdom for dialog primitives; static analysis with `eslint-plugin-jsx-a11y` (as errors); manual responsive testing at four viewport widths. No assistive-technology testing. |
| **Standards**           | WCAG 2.2 Level A and Level AA                                                                                                                                                                                                                                                                        |
| **Contact**             | Via [private report](https://github.com/OWNER/archyne/security/advisories/new) or the issue tracker                                                                                                                                                                                                  |

---

## Terms

| Term                   | Meaning                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Supports**           | The functionality meets the criterion, on the evidence described in the remarks.                                                     |
| **Partially supports** | Some functionality meets the criterion; known gaps are named.                                                                        |
| **Does not support**   | The majority of functionality does not meet the criterion.                                                                           |
| **Not applicable**     | The criterion is not relevant — usually because Archyne has no such content (no media, no authentication, no multi-page navigation). |
| **Not evaluated**      | No evidence either way. Used honestly and often: automated tools cannot judge most WCAG criteria.                                    |

Automated testing detects roughly a third of WCAG issues. Where a criterion is
marked **Supports** on automated evidence alone, the remark says so.

---

## How Archyne was tested

**Browser-driven audit — `tests/e2e-a11y.mts`.** axe-core runs against the
real, rendered application in Chromium, with rules limited to `wcag2a`,
`wcag2aa` and `wcag22aa`. Eight surfaces are audited in both the light and the
dark theme:

1. the editor (canvas, palette, inspector, source panel)
2. the Outline tab
3. the Export dialog
4. the About dialog
5. the Template gallery
6. the overflow menu
7. the Command palette (Ctrl+K)
8. the keyboard-shortcut sheet

All sixteen combinations report **no violations**. This suite runs in CI on
every pull request, so the result is a standing condition rather than a
one-time measurement.

Running in a real browser is the point: `color-contrast` and `target-size` are
measured from actual layout, and jsdom has no layout engine — those rules are
disabled there and would pass vacuously.

**Component-level audit — `src/components/a11y.test.tsx`.** axe over the
dialog primitives, with a negative control so the suite cannot pass by
asserting nothing.

**Static analysis.** `eslint-plugin-jsx-a11y` runs in CI as errors, not
warnings.

**Responsive.** Verified by hand at 1500 / 1050 / 820 / 560 px with no
horizontal overflow at any width. Below 900 px the palette and side panel
become overlay drawers.

**What the audit found and fixed.** Three real defects, all corrected: the
CodeMirror editor was an unlabelled `role="textbox"`; the editor theme's
syntax tokens measured 4.38:1 because a vendor stylesheet was winning on
precedence; and white on the accent colour measured 3.23:1, so primary buttons
now use a computed `--accent-strong`.

---

## Table 1 — WCAG 2.2 Level A

| Criterion                       | Conformance        | Remarks                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text Content          | Partially supports | Icons and controls carry accessible names; decorative images are `alt=""`. The **diagram canvas** is the open question: the Outline tab provides a parallel text listing of every node and its outgoing connections, which is the intended text alternative, but whether it is _sufficient_ for a given diagram has not been evaluated with users. Diagram authors can also set Mermaid's `accTitle`/`accDescr`, which the inspector exposes. |
| 1.2.1–1.2.3 Audio/video         | Not applicable     | Archyne contains no audio or video.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.3.1 Info and Relationships    | Supports           | Landmarks (`main` for the canvas, labelled `aside` for palette and side panel), a real tablist for the source panel, `role="menu"` with arrow navigation for the context menu, and labelled form controls throughout. Automated evidence.                                                                                                                                                                                                     |
| 1.3.2 Meaningful Sequence       | Not evaluated      | DOM order follows visual order in the chrome, but this has not been verified for the canvas, where position is spatial rather than sequential.                                                                                                                                                                                                                                                                                                |
| 1.3.3 Sensory Characteristics   | Partially supports | Interface instructions do not rely on shape or position. Diagram _content_ may — a user's own diagram can say "the box on the right", and Archyne cannot prevent that.                                                                                                                                                                                                                                                                        |
| 1.4.1 Use of Color              | Partially supports | Interface state uses more than colour (focus outlines, text). Diagram semantics can be colour-only when an author styles nodes that way; Archyne renders what the source says.                                                                                                                                                                                                                                                                |
| 1.4.2 Audio Control             | Not applicable     | No audio.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2.1.1 Keyboard                  | Supports           | This was a deliberate workstream. The palette was drag-and-drop only, so a keyboard user could not place a node; palette items are now buttons that drop a node into the centre of the view. Edges were pointer-only; `useKeyboardConnect` adds Tab → `C` → Tab → Enter, with Escape to cancel. Node position is adjustable with arrow keys (Shift for a grid step). Verified by tests, not by an AT user.                                    |
| 2.1.2 No Keyboard Trap          | Partially supports | The shared `Modal` primitive implements a focus trap with Escape and restores focus to the invoking control, covered by `src/components/Modal.test.tsx`. The CodeMirror source editor has not been checked for tab-trapping behaviour.                                                                                                                                                                                                        |
| 2.1.4 Character Key Shortcuts   | Partially supports | Single-character shortcuts exist (`C` to start a connection, `?` for the shortcut sheet). They are active only when focus is outside a text field, but there is **no mechanism to remap or disable them**, which the criterion requires unless the shortcut is only active on focus. Treat as a known gap.                                                                                                                                    |
| 2.2.1 Timing Adjustable         | Not applicable     | No time limits.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2.2.2 Pause, Stop, Hide         | Partially supports | Toasts auto-dismiss; errors stay up more than twice as long as confirmations and carry `role="alert"`. There is no user control to pause or extend them.                                                                                                                                                                                                                                                                                      |
| 2.3.1 Three Flashes             | Supports           | No flashing content.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2.4.1 Bypass Blocks             | Not evaluated      | Single-view application with landmark regions; no skip link. Whether landmarks alone suffice here has not been assessed.                                                                                                                                                                                                                                                                                                                      |
| 2.4.2 Page Titled               | Supports           | The document title describes the application. It is static: it does not name the open diagram, which the criterion does not require of a single-view application but which would aid orientation when several are open in tabs.                                                                                                                                                                                                               |
| 2.4.3 Focus Order               | Not evaluated      | Dialog focus management is tested; the overall tab order across canvas, palette and panels has not been walked through manually.                                                                                                                                                                                                                                                                                                              |
| 2.4.4 Link Purpose (In Context) | Supports           | Links carry descriptive text. Automated evidence.                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.5.1 Pointer Gestures          | Supports           | No multipoint or path-based gestures are required; pinch-zoom on the canvas has button equivalents in the zoom controls.                                                                                                                                                                                                                                                                                                                      |
| 2.5.2 Pointer Cancellation      | Not evaluated      | Activation is on `click` throughout, which satisfies the criterion by default, but drag interactions on the canvas have not been assessed against it.                                                                                                                                                                                                                                                                                         |
| 2.5.3 Label in Name             | Supports           | Visible labels are contained in accessible names. Automated evidence.                                                                                                                                                                                                                                                                                                                                                                         |
| 2.5.4 Motion Actuation          | Not applicable     | No motion-triggered functionality.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3.1.1 Language of Page          | Supports           | `<html lang>` is set from the active locale, and `dir` with it.                                                                                                                                                                                                                                                                                                                                                                               |
| 3.2.1 On Focus                  | Supports           | Focus alone never changes context.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3.2.2 On Input                  | Supports           | Changing a control updates the diagram, which is the control's stated purpose; no navigation or context change occurs.                                                                                                                                                                                                                                                                                                                        |
| 3.2.6 Consistent Help           | Not applicable     | Single view; no repeated help mechanism across pages.                                                                                                                                                                                                                                                                                                                                                                                         |
| 3.3.1 Error Identification      | Supports           | Parse errors and warnings are announced through an always-mounted live region (`StatusAnnouncer`) and shown in text. This was a real fix: errors previously rendered only inside the code panel, which is hidden while the user is on the Preview tab or the canvas.                                                                                                                                                                          |
| 3.3.2 Labels or Instructions    | Supports           | Form controls are labelled; the inspector states what a selection does. Automated evidence.                                                                                                                                                                                                                                                                                                                                                   |
| 3.3.7 Redundant Entry           | Not applicable     | No multi-step process re-asks for information.                                                                                                                                                                                                                                                                                                                                                                                                |
| 4.1.2 Name, Role, Value         | Supports           | Custom widgets use documented patterns — the command palette uses the `aria-activedescendant` listbox pattern, dialogs use `role="dialog"` with `aria-modal`, tabs use a real tablist. Automated evidence across all 16 surface/theme combinations.                                                                                                                                                                                           |

---

## Table 2 — WCAG 2.2 Level AA

| Criterion                        | Conformance        | Remarks                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2.4–1.2.5 Audio/video          | Not applicable     | No media.                                                                                                                                                                                                                                                                                                                       |
| 1.3.4 Orientation                | Supports           | The layout is responsive and locks no orientation.                                                                                                                                                                                                                                                                              |
| 1.3.5 Identify Input Purpose     | Not applicable     | No fields collect information about the user.                                                                                                                                                                                                                                                                                   |
| 1.4.3 Contrast (Minimum)         | Supports           | axe `color-contrast` reports no violations across 8 surfaces × 2 themes, measured from real layout in a browser. Three genuine failures were found by this audit and fixed. Diagram content styled by the author is outside Archyne's control.                                                                                  |
| 1.4.4 Resize Text                | Not evaluated      | The layout is fluid, but 200 % text-only zoom has not been tested.                                                                                                                                                                                                                                                              |
| 1.4.5 Images of Text             | Supports           | No images of text in the interface.                                                                                                                                                                                                                                                                                             |
| 1.4.10 Reflow                    | Supports           | Verified at 1500 / 1050 / 820 / 560 px with no horizontal overflow; below 900 px the side panels become overlay drawers. The canvas itself is a two-dimensional workspace, which the criterion exempts.                                                                                                                         |
| 1.4.11 Non-text Contrast         | Supports           | axe reports no violations; focus indicators and control boundaries were adjusted during the contrast work. Automated evidence.                                                                                                                                                                                                  |
| 1.4.12 Text Spacing              | Not evaluated      | No user-stylesheet spacing test has been run.                                                                                                                                                                                                                                                                                   |
| 1.4.13 Content on Hover or Focus | Not evaluated      | Tooltips and hover affordances have not been assessed for dismissibility and persistence.                                                                                                                                                                                                                                       |
| 2.4.5 Multiple Ways              | Not applicable     | Single-view application, not a set of pages. Within a diagram, the command palette and the Outline filter both find a node.                                                                                                                                                                                                     |
| 2.4.6 Headings and Labels        | Supports           | Descriptive headings and labels throughout. Automated evidence.                                                                                                                                                                                                                                                                 |
| 2.4.7 Focus Visible              | Supports           | Visible focus indicators; the pending source of a keyboard-initiated connection is outlined. Automated evidence.                                                                                                                                                                                                                |
| 2.4.11 Focus Not Obscured (Min)  | Not evaluated      | Overlay drawers and toasts could in principle cover a focused control at narrow widths. Not tested.                                                                                                                                                                                                                             |
| 2.5.7 Dragging Movements         | Partially supports | Deliberate work went into non-dragging alternatives: nodes are placed from the palette by click, connected by keyboard, and moved with arrow keys; sequence participants are reordered from the inspector. **Known gap:** group resizing is available only through drag handles, with no keyboard or single-pointer equivalent. |
| 2.5.8 Target Size (Minimum)      | Supports           | axe `target-size` reports no violations, measured from real layout. Hit targets are enlarged under `@media (pointer: coarse)`. Automated evidence.                                                                                                                                                                              |
| 3.1.2 Language of Parts          | Not evaluated      | Diagram content may be in a different language from the interface; no `lang` is set on those regions.                                                                                                                                                                                                                           |
| 3.2.3 Consistent Navigation      | Supports           | A single, consistent toolbar and panel arrangement.                                                                                                                                                                                                                                                                             |
| 3.2.4 Consistent Identification  | Supports           | Controls are named consistently across the interface; all user-facing strings come from one catalogue (`src/i18n/en.ts`).                                                                                                                                                                                                       |
| 3.3.3 Error Suggestion           | Partially supports | Mermaid parse errors are surfaced verbatim, which names the line but does not always suggest a correction.                                                                                                                                                                                                                      |
| 3.3.4 Error Prevention           | Supports           | An unsaved-changes guard fires before losing work on a file that has been opened or saved; undo is a 100-step snapshot stack.                                                                                                                                                                                                   |
| 3.3.8 Accessible Authentication  | Not applicable     | Archyne has no authentication.                                                                                                                                                                                                                                                                                                  |
| 4.1.3 Status Messages            | Supports           | `StatusAnnouncer` is always mounted and owns announcements; toasts are a live region and errors carry `role="alert"`. Automated evidence plus the design fix described in 3.3.1.                                                                                                                                                |

---

## What has not been tested

This section is the reason the report is unsigned. In descending order of
importance:

1. **No screen-reader testing.** Nothing has been verified with NVDA, JAWS,
   VoiceOver or Narrator. For an application whose central object is a
   two-dimensional canvas, this is the single largest evidence gap: the
   Outline tab exists precisely because a canvas conveys structure spatially,
   and whether it _works_ can only be established by using it with a screen
   reader.
2. **No testing with users with disabilities.** All evidence is from tools.
3. **No manual keyboard walkthrough** of the full interface has been recorded.
   Individual flows are covered by tests; the overall tab order is not.
4. **No zoom or text-spacing testing** (1.4.4, 1.4.12).
5. **No assessment of the embedded and desktop presentations** specifically.
   The audit runs against the web application; the Electron shell renders the
   same build, but its window chrome and native menus are untested.
6. **Diagram content is out of scope.** Archyne renders what the author wrote.
   Contrast, colour-only meaning and language of the _diagram_ belong to the
   author; the accessible-title and accessible-description fields exist to
   help them.

## Known gaps, restated plainly

- **2.5.7** — group resizing is drag-only.
- **2.1.4** — single-character shortcuts cannot be remapped or turned off.
- **2.2.2** — toasts cannot be paused.
- **1.1.1** — the canvas text alternative exists but is unvalidated.

Each of these is a real, fixable defect rather than an ambiguity in the
standard.

## Roadmap to a signed report

1. Screen-reader passes on Windows (NVDA + Firefox, JAWS + Chrome) and macOS
   (VoiceOver + Safari), documented surface by surface.
2. A recorded manual keyboard walkthrough.
3. Fix the four gaps listed above.
4. Independent review by an accessibility specialist, then re-issue this
   document as a signed VPAT 2.5 with the reviewer named.

Until step 4, this document should be read as a good-faith self-assessment
with its evidence stated — which is more than an unsupported conformance claim
and less than a signed VPAT. Buyers whose process requires the latter should
treat Archyne as not yet eligible, and we would rather say so here than have
it discovered during procurement.
