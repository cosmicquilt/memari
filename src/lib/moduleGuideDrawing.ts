// A module drawn for its page on the site (/modules/<slug>): the real
// renderer at the module's own default size, on the page's quarter-inch dots,
// as SVG - the same drawing the editor shows and the PDF prints, so the page
// never shows a module the book would not.
import { renderModuleInstance } from "./renderModuleInstance";
import { moduleDefinition } from "./moduleRegistry";
import { gridCellToAllocation } from "./grid";
import { PROOF_PAGE as PAGE, toSvg, flatten, latticeDots, latticePattern } from "./proofSvg";

/** Half a cell of dots round the module, as the proof sheets show it. */
const MARGIN_PX = 37.5;

export function moduleDrawingSvg(slug: string): { viewBox: string; widthPx: number; heightPx: number; markup: string } | null {
  const definition = moduleDefinition(slug);
  if (!definition) return null;
  const placement = { columnStart: 0, rowStart: 0, columnSpan: definition.db.defaultColumnSpan, rowSpan: definition.db.defaultRowSpan };
  const elements = flatten(
    renderModuleInstance({ id: slug, locked: true, ...placement, propValues: definition.previewProps ?? {}, moduleType: { slug } }, PAGE)
  );
  const box = gridCellToAllocation(PAGE, placement);
  const x = box.x - MARGIN_PX;
  const y = box.y - MARGIN_PX;
  const width = box.width + MARGIN_PX * 2;
  const height = box.height + MARGIN_PX * 2;
  return {
    viewBox: `${x} ${y} ${width} ${height}`,
    widthPx: width,
    heightPx: height,
    markup:
      `<defs>${latticePattern(PAGE)}</defs>` +
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fdfcf9" />` +
      latticeDots(PAGE) +
      elements.map((element) => toSvg(element)).join(""),
  };
}
