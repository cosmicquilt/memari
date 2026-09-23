// The things on the desk besides the journal and the loose notes, in the
// manner of the lofi study picture Andrew chose (2026-09-23: "more like this
// style just real", the objects moved around): an open silver laptop, a
// leafy plant in a terracotta pot, a stack of cloth hardcovers with ribbon
// bookmarks, a pencil case made like a sleepy animal, a red glazed cup of
// pencils, scissors and a brush, a patterned mug of tea, and a pen.
//
// Their surfaces are drawn on canvases here, and cheaply - gradients, small
// noise canvases smoothed up to size, strokes - never a per-pixel loop over
// a big canvas (those are baked; see scripts/build-desk-textures.mts), so
// building them costs the page almost nothing. Units are inches; y is up
// from the desk; each builder returns a group standing at the origin.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { canvas, hash, mottle } from "./textures";

type Profile = Array<[number, number]>;

function lathe(profile: Profile, segments = 64) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

/** `n` points from a to b: a lathe's texture is shared out by point, so a
 *  wall given more points gets more of it. */
function run(a: [number, number], b: [number, number], n: number): Profile {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as [number, number];
  });
}

function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

function texture(c: HTMLCanvasElement, colour = true) {
  const t = new THREE.CanvasTexture(c);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Tiny dots scattered over a region: flecks in a glaze, grit in soil. */
function speckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count: number, colour: string, seed: number, size = 1.4) {
  ctx.fillStyle = colour;
  for (let i = 0; i < count; i++) {
    const r = size * (0.4 + hash(i, seed, 3));
    ctx.globalAlpha = 0.25 + 0.5 * hash(i, seed, 4);
    ctx.beginPath();
    ctx.arc(x + hash(i, seed, 1) * w, y + hash(i, seed, 2) * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- glazed ceramic ------------------------------------------------------------

/** Which points of a vessel's profile are its foot, outside, rim and inside. */
type Parts = { foot: number; outside: number; rim: number; inside: number };
type Glaze = { glaze: string; pooled: string; thin: string; inside: string; clay: string };

/**
 * A glazed vessel's surface, laid out along its lathe profile: bare clay
 * on the foot; outside, glaze that pooled darker towards the foot and ran
 * thin and pale over the rim; inside, a shade darker. `pattern` draws on the
 * outside wall, given its rectangle on the canvas.
 */
function glazeTexture(profile: Profile, parts: Parts, colours: Glaze, seed: number, pattern?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void) {
  const W = 1024;
  const H = 768;
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  const n = profile.length;
  // three puts the profile's first point at v = 0, the canvas's bottom row.
  const row = (j: number) => H * (1 - j / (n - 1));
  const outsideTop = row(parts.rim);
  const outsideBottom = row(parts.outside);
  ctx.fillStyle = colours.clay;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colours.inside;
  ctx.fillRect(0, 0, W, row(parts.inside));
  const wall = ctx.createLinearGradient(0, outsideBottom, 0, outsideTop);
  wall.addColorStop(0, colours.pooled);
  wall.addColorStop(0.25, colours.glaze);
  wall.addColorStop(0.9, colours.glaze);
  wall.addColorStop(1, colours.thin);
  ctx.fillStyle = wall;
  ctx.fillRect(0, outsideTop, W, outsideBottom - outsideTop);
  ctx.fillStyle = colours.thin;
  ctx.fillRect(0, row(parts.inside), W, outsideTop - row(parts.inside));
  pattern?.(ctx, 0, outsideTop, W, outsideBottom - outsideTop);
  mottle(
    ctx,
    W,
    H,
    [
      [10, 0.12],
      [48, 0.06],
    ],
    seed
  );
  speckle(ctx, 0, 0, W, row(parts.foot), 900, "rgba(40, 20, 10, 1)", seed);
  return texture(c);
}

function glazed(map: THREE.Texture) {
  return new THREE.MeshPhysicalMaterial({ map, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.18 });
}

// --- the mug ---------------------------------------------------------------------

const MUG: Profile = [
  [0, 0.1],
  [1.2, 0.06],
  [1.42, 0],
  [1.5, 0.08],
  ...run([1.54, 0.2], [1.63, 3.34], 14),
  [1.62, 3.45],
  [1.57, 3.5],
  [1.52, 3.46],
  ...run([1.49, 3.34], [1.43, 0.5], 6),
  [1.25, 0.4],
  [0, 0.38],
];

/** Lilac glaze with rows of little white creatures on it, like the mug in
 *  the reference, and a cream inside. */
export function mug() {
  const g = new THREE.Group();
  const map = glazeTexture(
    MUG,
    { foot: 3, outside: 4, rim: 18, inside: 21 },
    { glaze: "#b3a0d6", pooled: "#8f7bb8", thin: "#e9e1f2", inside: "#f1ebe0", clay: "#d9c8b4" },
    31,
    (ctx, x, y, w, h) => {
      const rows = 4;
      const perRow = 13;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < perRow; i++) {
          const cx = x + ((i + (r % 2) * 0.5 + 0.25) / perRow) * w + (hash(i, r, 7) - 0.5) * 6;
          const cy = y + ((r + 0.55) / rows) * h;
          const s = 13 + hash(i, r, 8) * 3;
          ctx.fillStyle = "rgba(250, 247, 252, 0.95)";
          // A round body and two ears: a small rabbit, painted by hand.
          ctx.beginPath();
          ctx.ellipse(cx, cy, s, s * 0.85, 0, 0, Math.PI * 2);
          ctx.ellipse(cx - s * 0.45, cy - s * 1.05, s * 0.28, s * 0.62, -0.25, 0, Math.PI * 2);
          ctx.ellipse(cx + s * 0.45, cy - s * 1.05, s * 0.28, s * 0.62, 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(60, 40, 70, 0.9)";
          ctx.beginPath();
          ctx.arc(cx - s * 0.32, cy - s * 0.1, s * 0.11, 0, Math.PI * 2);
          ctx.arc(cx + s * 0.32, cy - s * 0.1, s * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  );
  const body = new THREE.Mesh(lathe(MUG), glazed(map));
  const tea = new THREE.Mesh(new THREE.CircleGeometry(1.46, 48).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x4a1e0c, roughness: 0.05, clearcoat: 1 }));
  tea.position.y = 2.95;
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.17, 16, 32, Math.PI * 1.15),
    new THREE.MeshPhysicalMaterial({ color: 0xb3a0d6, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.18 })
  );
  handle.rotation.z = -Math.PI * 0.575;
  handle.position.set(1.55, 1.8, 0);
  g.add(body, tea, handle);
  return shadowed(g);
}

// --- the red cup of pencils, scissors and a brush -----------------------------------

const CUP: Profile = [
  [0, 0.12],
  [1.1, 0.08],
  [1.28, 0],
  [1.34, 0.1],
  ...run([1.36, 0.2], [1.43, 3.5], 12),
  [1.42, 3.6],
  [1.37, 3.64],
  [1.31, 3.6],
  ...run([1.28, 3.5], [1.22, 0.4], 5),
  [1.0, 0.3],
  [0, 0.28],
];

function pencil(colour: string, length: number, sharpenedUp: boolean) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, length, 6), paint);
  g.add(body);
  if (sharpenedUp) {
    const wood = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xe2c08f, roughness: 0.8 }));
    wood.position.y = length / 2 + 0.25;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.4, metalness: 0.3 }));
    lead.position.y = length / 2 + 0.44;
    g.add(wood, lead);
  } else {
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0xc9a94d, roughness: 0.35, metalness: 0.8 }));
    ferrule.position.y = length / 2 + 0.13;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 16), new THREE.MeshStandardMaterial({ color: 0xe79a95, roughness: 0.9 }));
    eraser.position.y = length / 2 + 0.4;
    g.add(ferrule, eraser);
  }
  return g;
}

/** Dark green scissors, handles up: the loops show over the rim, the blades
 *  go down into the cup. */
function scissors() {
  const g = new THREE.Group();
  const plastic = new THREE.MeshStandardMaterial({ color: 0x2f5a37, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.25, metalness: 0.9 });
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 10, 28), plastic);
    loop.position.set(side * 0.4, 0.5, 0);
    loop.rotation.set(0, 0, side * 0.15);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.6, 0.03), steel);
    blade.position.set(side * 0.08, -1.85, 0);
    blade.rotation.z = side * -0.05;
    g.add(loop, blade);
  }
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12).rotateX(Math.PI / 2), steel);
  screw.position.y = -0.2;
  g.add(screw);
  return g;
}

/** A soft round brush: a varnished wooden handle, a brass ferrule, and a
 *  dome of pale bristles. */
function brush() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 5.2, 16), new THREE.MeshPhysicalMaterial({ color: 0xb4814f, roughness: 0.35, clearcoat: 0.6 }));
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.7, 20), new THREE.MeshStandardMaterial({ color: 0xc9a94d, roughness: 0.3, metalness: 0.85 }));
  ferrule.position.y = 2.95;
  // Bristles: long pale strands, a little darker where they go into the
  // ferrule.
  const c = canvas(256, 256);
  const ctx = c.getContext("2d")!;
  const fade = ctx.createLinearGradient(0, 256, 0, 0);
  fade.addColorStop(0, "#b99a74");
  fade.addColorStop(0.35, "#eadcc4");
  fade.addColorStop(1, "#f6eee0");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const x = hash(i, 1, 9) * 256;
    ctx.strokeStyle = hash(i, 2, 9) > 0.5 ? "rgba(255, 250, 240, 0.35)" : "rgba(150, 120, 90, 0.25)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + (hash(i, 3, 9) - 0.5) * 10, 0);
    ctx.stroke();
  }
  const tuft = new THREE.Mesh(
    lathe(
      [
        [0.22, 0],
        [0.42, 0.35],
        [0.55, 0.8],
        [0.5, 1.2],
        [0.34, 1.5],
        [0, 1.62],
      ],
      32
    ),
    new THREE.MeshStandardMaterial({ map: texture(c), roughness: 0.95 })
  );
  tuft.position.y = 3.25;
  g.add(handle, ferrule, tuft);
  return g;
}

export function pencilCup() {
  const g = new THREE.Group();
  const map = glazeTexture(
    CUP,
    { foot: 3, outside: 4, rim: 16, inside: 19 },
    { glaze: "#b1261d", pooled: "#6d110c", thin: "#dd7a5c", inside: "#7c1812", clay: "#caa184" },
    47
  );
  g.add(new THREE.Mesh(lathe(CUP), glazed(map)));
  const pencils: Array<[string, number, boolean, number]> = [
    ["#e3b33a", 6.4, true, 0],
    ["#2f5d3a", 6.0, false, 1.3],
    ["#3a4f8f", 6.6, true, 2.5],
    ["#ece5d6", 5.8, true, 3.8],
    ["#1d1c21", 6.2, false, 5.0],
  ];
  for (const [colour, length, up, around] of pencils) {
    const p = pencil(colour, length, up);
    p.position.set(Math.cos(around) * 0.55, length / 2 + 0.3, Math.sin(around) * 0.55);
    p.rotation.set(Math.sin(around) * 0.2, 0, -Math.cos(around) * 0.2);
    g.add(p);
  }
  const cut = scissors();
  cut.position.set(-0.35, 4.35, 0.25);
  cut.rotation.set(0.12, 0.6, 0.28);
  const soft = brush();
  soft.position.set(0.3, 0.45, -0.35);
  soft.rotation.set(-0.18, 0, -0.16);
  g.add(cut, soft);
  return shadowed(g);
}

// --- the plant ---------------------------------------------------------------------

const POT: Profile = [
  [0, 0.05],
  [1.45, 0.02],
  [1.55, 0],
  [1.6, 0.1],
  ...run([1.62, 0.2], [1.98, 2.9], 10),
  [2.0, 3.0],
  [2.22, 3.05],
  [2.27, 3.3],
  [2.25, 3.7],
  [2.2, 3.8],
  [2.08, 3.8],
  ...run([2.03, 3.7], [1.98, 3.45], 3),
];

/** Unglazed terracotta: mottled, darker towards the foot where water soaks
 *  through, and a white bloom of salts on the lip. */
function terracottaTexture() {
  const W = 1024;
  const H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  const n = POT.length;
  const row = (j: number) => H * (1 - j / (n - 1));
  const body = ctx.createLinearGradient(0, H, 0, 0);
  body.addColorStop(0, "#7e3a22");
  body.addColorStop(0.3, "#a8522f");
  body.addColorStop(0.62, "#b8643c");
  body.addColorStop(0.7, "#c47450");
  body.addColorStop(1, "#8e4629");
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, W, H);
  mottle(
    ctx,
    W,
    H,
    [
      [12, 0.22],
      [40, 0.12],
      [120, 0.08],
    ],
    61
  );
  // The salt bloom: soft pale patches round the lip.
  const lipTop = row(n - 4);
  const lipBottom = row(14);
  for (let i = 0; i < 26; i++) {
    const x = hash(i, 1, 5) * W;
    const y = lipTop + hash(i, 2, 5) * (lipBottom - lipTop) * 1.4;
    const r = 20 + hash(i, 3, 5) * 60;
    const bloom = ctx.createRadialGradient(x, y, 0, x, y, r);
    bloom.addColorStop(0, "rgba(236, 226, 212, 0.35)");
    bloom.addColorStop(1, "rgba(236, 226, 212, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Faint drip streaks down the wall.
  for (let i = 0; i < 40; i++) {
    const x = hash(i, 4, 5) * W;
    ctx.strokeStyle = `rgba(90, 40, 20, ${0.05 + 0.07 * hash(i, 5, 5)})`;
    ctx.lineWidth = 2 + hash(i, 6, 5) * 5;
    ctx.beginPath();
    ctx.moveTo(x, lipBottom);
    ctx.lineTo(x + (hash(i, 7, 5) - 0.5) * 12, lipBottom + (H - lipBottom) * (0.3 + 0.6 * hash(i, 8, 5)));
    ctx.stroke();
  }
  speckle(ctx, 0, 0, W, H, 1400, "rgba(60, 25, 12, 1)", 67);
  return texture(c);
}

/** A pothos leaf: heart-shaped, a pale midrib, curving side veins, and the
 *  golden streaks the plant is named for. */
function leafTexture(seed: number) {
  const W = 256;
  const H = 320;
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  const base = ctx.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.75);
  base.addColorStop(0, "#5f8c3e");
  base.addColorStop(0.7, "#3f6d2c");
  base.addColorStop(1, "#2c5120");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(214, 196, 96, ${0.12 + 0.2 * hash(i, seed, 2)})`;
    ctx.lineWidth = 3 + hash(i, seed, 3) * 8;
    const x = W * (0.2 + 0.6 * hash(i, seed, 4));
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.95);
    ctx.quadraticCurveTo(x, H * 0.6, x + (hash(i, seed, 5) - 0.5) * 60, H * (0.1 + 0.3 * hash(i, seed, 6)));
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(190, 214, 150, 0.8)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.quadraticCurveTo(W / 2 + 4, H * 0.5, W / 2, 0);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(170, 200, 130, 0.55)";
  for (let i = 1; i <= 5; i++) {
    const y = H * (1 - i / 6.2);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2, y);
      ctx.quadraticCurveTo(W / 2 + side * W * 0.22, y - H * 0.05, W / 2 + side * W * 0.42, y - H * 0.16);
      ctx.stroke();
    }
  }
  return texture(c);
}

function leafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.55, -0.25, 1.15, 0.35, 1.0, 1.1);
  shape.bezierCurveTo(0.85, 1.75, 0.35, 2.2, 0, 2.5);
  shape.bezierCurveTo(-0.35, 2.2, -0.85, 1.75, -1.0, 1.1);
  shape.bezierCurveTo(-1.15, 0.35, -0.55, -0.25, 0, 0);
  const geometry = new THREE.ShapeGeometry(shape, 14);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv.setXY(i, (x + 1.15) / 2.3, (y + 0.3) / 2.8);
    // Cupped along the midrib, and the tip drooping.
    pos.setZ(i, 0.28 * x * x - 0.1 * (y / 2.5) ** 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A leafy pothos in a terracotta pot on its saucer, stems arching out of
 *  the soil and a few trailing over the rim. */
export function pottedPlant() {
  const g = new THREE.Group();
  const clay = new THREE.MeshStandardMaterial({ map: terracottaTexture(), roughness: 0.92 });
  const pot = new THREE.Mesh(lathe(POT), clay);
  pot.position.y = 0.12;
  const saucer = new THREE.Mesh(
    lathe([
      [0, 0.02],
      [1.9, 0],
      [2.1, 0.08],
      [2.22, 0.34],
      [2.12, 0.36],
      [2.0, 0.14],
      [0, 0.12],
    ]),
    new THREE.MeshStandardMaterial({ color: 0xa65937, roughness: 0.9 })
  );
  // Soil, with grit and bits of bark in it.
  const sc = canvas(256, 256);
  const sctx = sc.getContext("2d")!;
  sctx.fillStyle = "#2a1c13";
  sctx.fillRect(0, 0, 256, 256);
  mottle(sctx, 256, 256, [[16, 0.35]], 71);
  speckle(sctx, 0, 0, 256, 256, 260, "#d8d0c2", 73, 1.2);
  speckle(sctx, 0, 0, 256, 256, 120, "#5a3a22", 79, 2.6);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(2.0, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texture(sc), roughness: 1 }));
  soil.position.y = 3.55;
  g.add(saucer, pot, soil);

  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x55773a, roughness: 0.6 });
  const leafShape = leafGeometry();
  const leafMaterials = [11, 23, 37].map(
    (seed) => new THREE.MeshStandardMaterial({ map: leafTexture(seed), bumpMap: leafTexture(seed), bumpScale: 0.4, roughness: 0.42, side: THREE.DoubleSide })
  );
  const up = new THREE.Vector3(0, 1, 0);
  const count = 15;
  for (let i = 0; i < count; i++) {
    const around = (i / count) * Math.PI * 2 + hash(i, 1, 13) * 0.5;
    const out = new THREE.Vector3(Math.cos(around), 0, Math.sin(around));
    const trailing = i % 4 === 1;
    const reach = trailing ? 3.2 + hash(i, 2, 13) : 1.4 + hash(i, 3, 13) * 1.8;
    const start = new THREE.Vector3(out.x * 0.5 * hash(i, 4, 13), 3.55, out.z * 0.5 * hash(i, 4, 13));
    const end = trailing
      ? new THREE.Vector3(out.x * reach, 2.3 + hash(i, 5, 13) * 0.8, out.z * reach)
      : new THREE.Vector3(out.x * reach, 4.6 + hash(i, 6, 13) * 2.2, out.z * reach);
    const lift = trailing ? 5.0 : end.y + 0.6;
    const curve = new THREE.CatmullRomCurve3([
      start,
      new THREE.Vector3(start.x + out.x * 0.4, lift - 0.4, start.z + out.z * 0.4),
      new THREE.Vector3(end.x * 0.7, lift, end.z * 0.7),
      end,
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.045, 5), stemMaterial));
    // The leaf hangs off the stem's end: along it, drooping, face to the sky.
    const along = curve.getTangent(1).lerp(new THREE.Vector3(out.x, -0.35, out.z), 0.5).normalize();
    const face = up.clone().sub(along.clone().multiplyScalar(up.dot(along))).normalize();
    const side = new THREE.Vector3().crossVectors(along, face);
    const leaf = new THREE.Mesh(leafShape, leafMaterials[i % leafMaterials.length]);
    leaf.matrixAutoUpdate = false;
    const size = 0.75 + hash(i, 7, 13) * 0.45;
    leaf.matrix.makeBasis(side.multiplyScalar(size), along.multiplyScalar(size), face.multiplyScalar(size)).setPosition(end);
    g.add(leaf);
  }
  return shadowed(g);
}

// --- the books ---------------------------------------------------------------------

type BookSpec = { w: number; t: number; d: number; cloth: string; emblem?: boolean; ribbons?: string[] };

/** Book cloth: the colour a little uneven, a fine weave, and the edges and
 *  corners worn paler where hands have held it. `emblem` adds a foil
 *  roundel, like the red book's in the reference. */
function clothTexture(colour: string, seed: number, emblem: boolean) {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, S, S);
  mottle(
    ctx,
    S,
    S,
    [
      [6, 0.14],
      [30, 0.08],
    ],
    seed
  );
  ctx.lineWidth = 1;
  for (let i = 0; i < S; i += 3) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.025 + 0.03 * hash(i, seed, 1)})`;
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(S, i);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.03 + 0.03 * hash(i, seed, 2)})`;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, S);
    ctx.stroke();
  }
  // Wear: paler towards every edge, most at the corners.
  for (const [x0, y0, x1, y1] of [
    [0, 0, 0, 26],
    [0, S, 0, S - 26],
    [0, 0, 26, 0],
    [S, 0, S - 26, 0],
  ]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(255, 240, 220, 0.22)");
    g.addColorStop(1, "rgba(255, 240, 220, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  if (emblem) {
    ctx.strokeStyle = "rgba(226, 196, 120, 0.9)";
    ctx.fillStyle = "rgba(226, 196, 120, 0.9)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(S * 0.5, S * 0.42, S * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    // A sprig inside the roundel.
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.5);
    ctx.lineTo(S * 0.5, S * 0.35);
    ctx.stroke();
    for (const [dy, side] of [
      [0.46, -1],
      [0.42, 1],
      [0.38, -1],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(S * 0.5 + side * S * 0.028, S * dy, S * 0.025, S * 0.012, side * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 2;
    for (const y of [0.64, 0.67]) {
      ctx.beginPath();
      ctx.moveTo(S * 0.34, S * y);
      ctx.lineTo(S * 0.66, S * y);
      ctx.stroke();
    }
  }
  return texture(c);
}

/** A spine: the cloth, gilt bands at head and tail, a title panel. */
function spineTexture(colour: string, seed: number) {
  const c = canvas(128, 512);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 128, 512);
  mottle(ctx, 128, 512, [[8, 0.14]], seed);
  ctx.fillStyle = "rgba(226, 196, 120, 0.85)";
  for (const y of [22, 32, 480, 490]) ctx.fillRect(0, y, 128, 4);
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(20, 120, 88, 150);
  ctx.fillStyle = "rgba(226, 196, 120, 0.8)";
  for (let i = 0; i < 4; i++) ctx.fillRect(34, 140 + i * 30, 60 - (i % 2) * 18, 5);
  return texture(c);
}

/** A satin ribbon marker, out of the book's tail and down its side onto the
 *  desk. */
function ribbon(colour: string, fromY: number, x: number, z: number) {
  const geometry = new THREE.PlaneGeometry(0.2, 2.2, 1, 12);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const along = (1.1 - pos.getY(i)) / 2.2;
    const out = Math.min(1, along * 3);
    pos.setXYZ(i, x + pos.getX(i) + along * 0.3, fromY * (1 - out * out) + 0.01, z + along * 1.6);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, side: THREE.DoubleSide }));
}

function book(spec: BookSpec, edges: THREE.Material, linen: THREE.Texture, seed: number) {
  const { w, t, d, cloth, emblem = false, ribbons = [] } = spec;
  const g = new THREE.Group();
  const board = 0.09;
  const coverMaterial = new THREE.MeshStandardMaterial({ map: clothTexture(cloth, seed, emblem), roughness: 0.82, bumpMap: linen, bumpScale: 0.5 });
  const plain = new THREE.MeshStandardMaterial({ map: clothTexture(cloth, seed + 1, false), roughness: 0.85, bumpMap: linen, bumpScale: 0.5 });
  for (const y of [board / 2, t - board / 2]) {
    const cover = new THREE.Mesh(new RoundedBoxGeometry(w, board, d, 2, 0.035), y > t / 2 ? coverMaterial : plain);
    cover.position.y = y;
    g.add(cover);
  }
  const spineMaterial = new THREE.MeshStandardMaterial({ map: spineTexture(cloth, seed + 2), roughness: 0.82, bumpMap: linen, bumpScale: 0.5 });
  // BoxGeometry's groups: +x, -x, +y, -y, +z, -z; the title faces out (-x).
  const spine = new THREE.Mesh(new RoundedBoxGeometry(0.2, t, d, 2, 0.08), [plain, spineMaterial, plain, plain, plain, plain]);
  spine.position.set(-w / 2 + 0.1, t / 2, 0);
  const block = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, t - board * 2, d - 0.22), edges);
  block.position.set(0.03, t / 2, 0);
  g.add(spine, block);
  ribbons.forEach((colour, i) => g.add(ribbon(colour, t - board - 0.05, -w / 2 + 1.2 + i * 0.5, d / 2 - 0.2)));
  return g;
}

/** Three cloth hardcovers, a little askew, the red one on top with ribbon
 *  markers hanging out. */
export function bookStack(edges: THREE.Material, linen: THREE.Texture) {
  const g = new THREE.Group();
  const specs: Array<BookSpec & { twist: number }> = [
    { w: 7.4, t: 1.15, d: 9.8, cloth: "#2f4a3a", twist: 0 },
    { w: 6.8, t: 0.95, d: 9.2, cloth: "#6b4a2f", twist: 0.07 },
    { w: 6.2, t: 0.8, d: 8.6, cloth: "#a8322a", emblem: true, ribbons: ["#d9b44a", "#7c1f25"], twist: -0.09 },
  ];
  let y = 0;
  specs.forEach((spec, i) => {
    const b = book(spec, edges, linen, 90 + i * 11);
    b.position.y = y;
    b.rotation.y = spec.twist;
    y += spec.t;
    g.add(b);
  });
  return shadowed(g);
}

// --- the laptop --------------------------------------------------------------------

/** The keyboard deck: brushed aluminium, a recessed well of dark keys, a
 *  big trackpad and speaker grilles either side. */
function keyboardTexture() {
  const W = 1024;
  const H = 716;
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#cfd2d7";
  ctx.fillRect(0, 0, W, H);
  // Brushing: a tall thin noise canvas stretched wide makes horizontal grain.
  const streaks = canvas(2, 256);
  const sctx = streaks.getContext("2d")!;
  for (let y = 0; y < 256; y++) {
    const v = 110 + hash(y, 0, 17) * 60;
    sctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    sctx.fillRect(0, y, 2, 1);
  }
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.18;
  ctx.drawImage(streaks, 0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  const well = { x: 90, y: 40, w: W - 180, h: 360 };
  ctx.fillStyle = "#b9bcc2";
  ctx.beginPath();
  ctx.roundRect(well.x, well.y, well.w, well.h, 14);
  ctx.fill();
  const rows = [14, 14, 13, 12, 11];
  const gap = 8;
  const keyH = (well.h - 30 - gap * 6) / 6;
  // The thin function row, then five full rows, then the space bar row.
  const drawKey = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#26272b";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, w - 4, h * 0.4, 5);
    ctx.fill();
  };
  let y = well.y + 15;
  for (let i = 0; i < 14; i++) drawKey(well.x + 15 + i * ((well.w - 30) / 14), y, (well.w - 30) / 14 - gap, keyH * 0.6);
  y += keyH * 0.6 + gap;
  for (const count of rows) {
    const kw = (well.w - 30) / count;
    for (let i = 0; i < count; i++) drawKey(well.x + 15 + i * kw, y, kw - gap, keyH);
    y += keyH + gap;
  }
  const bottom = [1, 1, 1, 5.5, 1, 1, 1.5];
  const unit = (well.w - 30) / bottom.reduce((a, b) => a + b, 0);
  let x = well.x + 15;
  for (const k of bottom) {
    drawKey(x, y, k * unit - gap, keyH);
    x += k * unit;
  }
  // Trackpad.
  ctx.fillStyle = "#c6c9ce";
  ctx.strokeStyle = "rgba(90, 94, 100, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 200, 440, 400, 245, 18);
  ctx.fill();
  ctx.stroke();
  // Speaker grilles.
  ctx.fillStyle = "rgba(60, 62, 68, 0.55)";
  for (const gx of [30, W - 70]) {
    for (let r = 0; r < 36; r++) for (let q = 0; q < 4; q++) {
      ctx.beginPath();
      ctx.arc(gx + q * 10, 50 + r * 10, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return texture(c);
}

function screenTexture() {
  const c = canvas(512, 360);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0c0c0e";
  ctx.fillRect(0, 0, 512, 360);
  const glass = ctx.createLinearGradient(0, 0, 512, 360);
  glass.addColorStop(0, "#1b1c21");
  glass.addColorStop(0.55, "#121316");
  glass.addColorStop(1, "#1a1b20");
  ctx.fillStyle = glass;
  ctx.fillRect(16, 16, 480, 328);
  // A soft reflection of the window across the glass.
  const sheen = ctx.createLinearGradient(80, 0, 300, 360);
  sheen.addColorStop(0, "rgba(255, 220, 190, 0)");
  sheen.addColorStop(0.5, "rgba(255, 220, 190, 0.07)");
  sheen.addColorStop(1, "rgba(255, 220, 190, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(16, 16, 480, 328);
  return texture(c);
}

/** An open silver laptop: the deck and, hinged at the back, the lid tipped
 *  just past upright. */
export function laptop() {
  const g = new THREE.Group();
  const aluminium = new THREE.MeshPhysicalMaterial({ color: 0xd4d7dc, metalness: 0.55, roughness: 0.38, clearcoat: 0.2 });
  const deckTop = new THREE.MeshPhysicalMaterial({ map: keyboardTexture(), metalness: 0.45, roughness: 0.42 });
  const W = 12.3;
  const D = 8.6;
  const T = 0.55;
  const base = new THREE.Mesh(new RoundedBoxGeometry(W, T, D, 3, 0.18), [aluminium, aluminium, deckTop, aluminium, aluminium, aluminium]);
  base.position.y = T / 2;
  const hinge = new THREE.Group();
  hinge.position.set(0, T, -D / 2 + 0.1);
  const screen = new THREE.MeshPhysicalMaterial({ map: screenTexture(), roughness: 0.12, metalness: 0.1, clearcoat: 1 });
  // Closed, the lid would lie on the deck towards +z; its screen is its
  // underside (-y), which faces the viewer once it swings up and back.
  const lid = new THREE.Mesh(new RoundedBoxGeometry(W, 0.24, D - 0.1, 3, 0.1), [aluminium, aluminium, aluminium, screen, aluminium, aluminium]);
  lid.position.set(0, 0.12, (D - 0.1) / 2);
  hinge.add(lid);
  hinge.rotation.x = -THREE.MathUtils.degToRad(106);
  g.add(base, hinge);
  return shadowed(g);
}

// --- the pencil case ------------------------------------------------------------------

/** A soft fabric roll made like a sleepy ginger-and-cream animal lying on its
 *  side: ginger over its back, a cream belly, a zip along the top; its face -
 *  closed eyes, a pink nose - and ears are shapes on the head end (+x). */
export function pencilCase(linen: THREE.Texture) {
  const g = new THREE.Group();
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  // Around the roll (canvas x): u = 0 faces the viewer, 0.25 the sky.
  const fur = ctx.createLinearGradient(0, 0, W, 0);
  fur.addColorStop(0, "#efe2c8");
  fur.addColorStop(0.12, "#efe2c8");
  fur.addColorStop(0.2, "#d9894a");
  fur.addColorStop(0.62, "#cf7c3f");
  fur.addColorStop(0.72, "#efe2c8");
  fur.addColorStop(1, "#efe2c8");
  ctx.fillStyle = fur;
  ctx.fillRect(0, 0, W, H);
  // Tabby stripes across the back.
  ctx.strokeStyle = "rgba(160, 80, 30, 0.35)";
  ctx.lineWidth = 7;
  for (let i = 0; i < 9; i++) {
    const y = H * (0.25 + i * 0.07);
    ctx.beginPath();
    ctx.moveTo(W * 0.22, y);
    ctx.quadraticCurveTo(W * 0.4, y + 6, W * 0.58, y - 2);
    ctx.stroke();
  }
  // The zip.
  ctx.strokeStyle = "#5a4a3a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.3, H * 0.15);
  ctx.lineTo(W * 0.3, H * 0.85);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let y = H * 0.15; y < H * 0.85; y += 4) {
    ctx.beginPath();
    ctx.moveTo(W * 0.3 - 4, y);
    ctx.lineTo(W * 0.3 + 4, y);
    ctx.stroke();
  }
  mottle(ctx, W, H, [[16, 0.08]], 53);
  const fabric = new THREE.MeshStandardMaterial({ map: texture(c), roughness: 0.95, bumpMap: linen, bumpScale: 0.6 });
  const radius = 1.05;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 5.6, 10, 40), fabric);
  body.rotation.z = Math.PI / 2;
  body.scale.set(1, 1, 0.9);
  body.position.y = radius * 0.92;
  g.add(body);
  // A point on the roll's surface: `x` along it, `up` radians from facing
  // the viewer towards the top.
  const on = (x: number, up: number, out = 0) =>
    new THREE.Vector3(x, radius * 0.92 + Math.sin(up) * (radius + out), Math.cos(up) * (radius * 0.9 + out));
  const ink = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.6 });
  for (const x of [2.35, 3.05]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 20, Math.PI), ink);
    eye.position.copy(on(x, 0.55, 0.01));
    eye.lookAt(eye.position.clone().add(new THREE.Vector3(0, Math.sin(0.55), Math.cos(0.55))));
    eye.rotateZ(Math.PI);
    g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0938a, roughness: 0.7 }));
  nose.position.copy(on(2.7, 0.25, 0.03));
  g.add(nose);
  const earMaterial = new THREE.MeshStandardMaterial({ color: 0xd9894a, roughness: 0.95, bumpMap: linen, bumpScale: 0.6 });
  for (const x of [2.2, 3.15]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 20), earMaterial);
    ear.position.copy(on(x, 1.25, -0.05));
    ear.rotation.set(-0.35, 0, x > 2.6 ? -0.2 : 0.2);
    g.add(ear);
  }
  return shadowed(g);
}

// --- the pen ------------------------------------------------------------------------

export function pen() {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 5.4, 24), new THREE.MeshPhysicalMaterial({ color: 0x1e1d22, roughness: 0.3, clearcoat: 0.6 }));
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 0.9, roughness: 0.25 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 24), metal);
  tip.position.y = -2.97;
  tip.rotation.x = Math.PI;
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.12), metal);
  clip.position.set(0, 1.6, 0.2);
  g.add(barrel, tip, clip);
  g.rotation.z = Math.PI / 2;
  g.position.y = 0.18;
  const holder = new THREE.Group();
  holder.add(g);
  return shadowed(holder);
}
