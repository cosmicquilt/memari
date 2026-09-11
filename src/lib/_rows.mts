import { renderModuleInstance } from "./renderModuleInstance";
import { type PageGrid } from "./grid";
const PAGE: PageGrid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5 };
for (const rowSpan of [4, 8, 13, 20]) {
  const els = renderModuleInstance({ id: "t", locked: true, columnStart: 0, rowStart: 0,
    columnSpan: 18, rowSpan, propValues: { dayCount: 3 }, moduleType: { slug: "todo-checklist" } }, PAGE);
  const boxes = els.filter((e) => /-d0-box\d+$/.test(String(e.id))).length;
  const rules = els.filter((e) => /-d0-row\d+$/.test(String(e.id))).length;
  console.log(`  rowSpan ${String(rowSpan).padStart(2)}: ${boxes} checkboxes, ${rules} row rules`);
}
