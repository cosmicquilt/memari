// The hero's still pictures drawn into canvases rather than shown as <img>
// (2026-10-02): the desk beyond the film's sides, its resting frame, the
// loose sheets' drawings. A canvas is one texture, which a pinch zoom only
// scales; a picture is drawn in tiles, and only those near what is on
// screen - pinched in and then out, the tiles coming into view were not
// drawn yet, and the hero's sides showed white, then (once they were their
// own layers) black.

/** A picture, loaded and decoded. */
export function loadPicture(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

/**
 * Draw `img` into `canvas` at the picture's own size: only inside `clip` (a
 * polygon in the picture's pixels) when given, and only where `mask` is
 * opaque (stretched over the whole) when given.
 */
export function paintPicture(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  { clip, mask }: { clip?: Array<[number, number]> | null; mask?: HTMLImageElement } = {},
) {
  if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
  if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.save();
  if (clip) {
    g.beginPath();
    clip.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
  }
  g.drawImage(img, 0, 0);
  g.restore();
  if (mask) {
    g.globalCompositeOperation = "destination-in";
    g.drawImage(mask, 0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = "source-over";
  }
}
