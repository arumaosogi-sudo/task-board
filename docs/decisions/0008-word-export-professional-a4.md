# 0008 — Professional A4 Word (.docx) export: migrate to the `docx` library

- Status: Accepted
- Date: 2026-07-18
- Deciders: Developer (senior full-stack), per owner's explicit A4 typography spec
- Supersedes (partially): the library note in `0003-tech-stack-sprint4.md` §6 and the
  `@turbodocx/html-to-docx` runtime choice recorded in `apps/web/src/lib/export/word.ts`.

## Context

The owner asked for a **professional, print-ready A4** Word export with a precise spec:
exact page geometry + binding margin, a Thai-first single font family, fully specified
heading/body typography (sizes, weights, spacing, brand color), page-break control
(`keepNext` on headings, widow/orphan control, H1 starts a new page), a different first
page with a bottom-right page number, thin light-gray table borders with a brand-colored
header row, callout styling for blockquotes/Box nodes, and images capped to the text width.

The previous exporter used `@turbodocx/html-to-docx`: it converts an HTML string to OOXML
but exposes only coarse options (page size, margins, one default font, a boolean header/
footer). None of the following are reachable through its API: per-heading spacing/color,
`keepNext`, `widowControl`, brand table-header shading with white text, callout left-border
+ tint, `titlePg` (different first page), or a real `PAGE` field footer. Achieving them
would mean unzipping its output and rewriting `styles.xml` / `document.xml` with string or
regex surgery — brittle, hard to unit-test, and coupled to that library's internal XML.

## Decision

**Replace `@turbodocx/html-to-docx` with the [`docx`](https://www.npmjs.com/package/docx)
library** (v9) and generate OOXML programmatically.

- `docx` is actively maintained, ships first-class TypeScript types, runs in the browser
  (`Packer.toBlob`), and gives direct control over every OOXML construct the spec needs:
  `sectPr` (page size / margins / `titlePg`), named paragraph styles with `keepNext` +
  `outlineLevel`, `widowControl`, header/footer with a `PAGE` field, table borders +
  per-cell shading, paragraph borders + shading (callouts), and `ImageRun` sizing.
- We author a small HTML→OOXML converter (`wordDoc.ts`) over the editor's HTML mirror
  (`editor.getHTML()`), the same source the PDF/Markdown exports use, so every custom node
  (Box, task list, @mention, resizable image, rasterized drawing) is handled explicitly.
- The heavy work stays **lazy-loaded**: `word.ts` is dynamically `import()`-ed from
  WorkPage only on first export, so `docx` never lands in the main bundle (unchanged from
  the old design). `@turbodocx/html-to-docx` is removed from `apps/web`.

Brand color: **dark navy `#1F3864`** is used consistently for H1 text, the table header
shading, and the callout left border/tint. Navy reads as a formal report accent (the app's
`#7C5CFF` purple was the alternative; one color, used consistently, per the spec).

## Consequences

- **Positive:** the produced XML is asserted directly in `word.test.ts` (unzip via `jszip`,
  assert `w:pgSz`, margins, heading styles + `keepNext`, `widowControl`, `titlePg`, footer
  `PAGE` field, table border color + header shading, callout border). The exporter is a
  pure, testable core (`buildWordDocument` / `renderDocxXml`) decoupled from the browser
  download + image-fetch shell (`word.ts`).
- **Neutral:** `docx` (~a few hundred KB) replaces `@turbodocx/html-to-docx` (comparable);
  both are lazy chunks, so main-bundle impact is nil. `docxHtml.ts` (a turbodocx-specific
  HTML pre-massage) is deleted — the new core handles Box/task lists natively.
- **Markdown export is untouched** (`markdown.ts` keeps its own turndown pipeline).

## What OOXML could not express (documented limitations)

1. **Font fallback chains.** OOXML `w:rFonts` takes ONE family per script slot (ascii /
   hAnsi / cs), not a CSS-style `"TH Sarabun New", "TH SarabunPSK", Arial` list. We set all
   slots to `TH Sarabun New`; Word's own font-substitution handles a missing family at
   render time. The generic fallback is therefore advisory, not embedded.
2. **`px`→`pt` for user font sizes.** The editor stores inline font sizes in CSS `px`; Word
   uses points. We convert `pt = px × 0.75` (half-points = `px × 1.5`). The mapping is a
   convention, not a pixel-exact guarantee across DPI.
3. **Section Break (Next Page) per chapter.** The editor has no chapter/section node, so we
   approximate the spec's Section Break with `pageBreakBefore` on every top-level H1 except
   the first — a page break, not a true new section (which would reset headers/numbering).
