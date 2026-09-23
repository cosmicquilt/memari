# Single-line handwriting fonts

The landing page's journal is written in by hand, stroke by stroke. That needs
fonts whose letters are PEN PATHS - one line each, in the order a pen draws
them - rather than the filled outlines an ordinary font is made of. This is:

| File | Face | Hand |
| --- | --- | --- |
| `EMSAllure.svg` | EMS Allure | joined script |

Only the script is used. The single-line PRINT faces in the same project
(Felix, Nixish, Elfin, Readability) were tried and read as a plotter rather
than a hand; print hands come from handwriting fonts instead (see
`src/app/landing/handFonts.ts`).

From the Hershey Text project by Evil Mad Scientist Laboratories
(https://gitlab.com/oskay/hershey-text, `hershey-text/svg_fonts/`, branch
`Inkscape_v1`), fetched 2026-09-22. The font is licensed under the **SIL Open
Font License 1.1** - see `OFL.txt` in this folder, which must travel with it.
(The Hershey Text extension's own code is GPL; none of it is used here.)

`npm run build:handwriting` turns it into the compact stroke data the page
loads: `src/app/landing/handwriting/strokeFonts.json`.
