// The journal on the desk: a cloth-bound hardcover that opens to the middle
// and turns its pages.
//
// Units are INCHES and the page is the real 7 x 10. The spine runs along z,
// the pages lie in x (right page +x, left page -x once open) and y is up.
//
// OPENING TO THE MIDDLE is the front cover and the top half of the pages
// swinging over together about the spine - which is what a book does when
// you open it at a week in the middle, not at page one. The half that swings
// carries the spread's LEFT page on what was its underside, so it lands face
// up. The spine rolls with it, half as far.
//
// A PAGE TURN is one sheet lifting off the right-hand pages and landing on
// the left. It is a bent sheet, not a flat card: its angle along its width is
// integrated from the spine, the far edge lagging behind so the sheet curls,
// and the lower corner - the one a hand would take - leads the rest. Its
// front carries the page being turned away; its back, the next spread's left
// page.

import * as THREE from "three";
import { contactShadow } from "./textures";

export const PAGE_W = 7;
export const PAGE_H = 10;
const OVERHANG = 0.12;
const BOARD = 0.09;
const HALF_BLOCK = 0.26;
/** Mid-thickness: the axis the opening half swings about. */
const HINGE_Y = BOARD + HALF_BLOCK;
/** How far the pages dip into the gutter once the book lies open. */
const GUTTER = 0.12;
const GUTTER_REACH = 0.55;
/** The gap each half keeps from the spine line: small, so the open pages
 *  meet in the gutter rather than showing the binding between them. */
const INSET = 0.012;
const BOARD_W = PAGE_W + INSET + OVERHANG;
const BOARD_D = PAGE_H + OVERHANG * 2;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export type JournalMaterials = {
  cloth: THREE.Material;
  cover: THREE.Material;
  edges: THREE.Material;
  ribbon: THREE.Material;
  /** The paper's fibre, as height, tiled to a page. */
  paper: THREE.Texture;
};

/** Uncoated paper: matte, and with a tooth the low sun picks out. */
function pageMaterial(paper: THREE.Texture) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, bumpMap: paper, bumpScale: 0.9 });
}

/** The dark where a board meets the desk, as a mesh lying on it. */
function restingShadow() {
  const { texture, planeW, planeD } = contactShadow(BOARD_W, BOARD_D, 0.45, false);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(planeW, planeD).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  mesh.position.y = 0.004;
  mesh.renderOrder = -1;
  return mesh;
}

/** A block of pages: edges on every side but the one a page mesh covers -
 *  the top of the lower half, the underside of the half that swings over.
 *  BoxGeometry's groups are +x, -x, +y, -y, +z, -z. */
function pageBlock(edges: THREE.Material, pageOn: "top" | "bottom") {
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const faces = pageOn === "top" ? [edges, edges, hidden, edges, edges, edges] : [edges, edges, edges, hidden, edges, edges];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W, HALF_BLOCK, PAGE_H), faces);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A page's surface: a plane with enough columns to bend into the gutter, and
 * rows enough for the rest of what a real page does - it is never quite
 * flat (a slow unevenness the low sun shades), and its outer edge lifts a
 * little off the pages under it.
 */
function pagePlane(flipForUnderside: boolean) {
  const geometry = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 36, 14);
  if (flipForUnderside) geometry.rotateX(Math.PI / 2).rotateY(Math.PI);
  else geometry.rotateX(-Math.PI / 2);
  geometry.translate(INSET + PAGE_W / 2, 0, 0);
  // Up, off the page block, is +y for the right page and -y for the left,
  // which lies face down in the half that swings over.
  const up = flipForUnderside ? -1 : 1;
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const fromGutter = pos.getX(i) - INSET;
    const z = pos.getZ(i);
    const uneven = 0.008 * Math.sin(fromGutter * 1.1 + z * 0.35) * Math.sin(z * 0.6 + 1);
    const lift = 0.03 * smooth(clamp01((fromGutter - 5.6) / (PAGE_W - 5.6))) ** 2;
    pos.setY(i, pos.getY(i) + up * (uneven + lift));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export class Journal {
  readonly group = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly spine: THREE.Mesh;
  private readonly leftPage: THREE.Mesh;
  private readonly rightPage: THREE.Mesh;
  private readonly leftBase: Float32Array;
  private readonly rightBase: Float32Array;
  private readonly turnFront: THREE.Mesh;
  private readonly turnBack: THREE.Mesh;
  private readonly closedX: number;
  /** Under the back board, always; under the front one once it has landed
   *  beside it. */
  private readonly restingLeft: THREE.Mesh;

  constructor(materials: JournalMaterials) {
    const { cloth, cover, edges, ribbon, paper } = materials;

    const restingRight = restingShadow();
    restingRight.position.x = BOARD_W / 2;
    this.restingLeft = restingShadow();
    this.restingLeft.position.x = -BOARD_W / 2;
    this.group.add(restingRight, this.restingLeft);

    // --- the half that stays: back board and the lower pages
    const back = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD, BOARD_D), cloth);
    back.position.set(BOARD_W / 2, BOARD / 2, 0);
    back.castShadow = back.receiveShadow = true;
    const lower = pageBlock(edges, "top");
    lower.position.set(INSET + PAGE_W / 2, BOARD + HALF_BLOCK / 2, 0);
    this.rightPage = new THREE.Mesh(pagePlane(false), pageMaterial(paper));
    this.rightPage.position.y = HINGE_Y + 0.002;
    this.rightPage.receiveShadow = true;
    this.group.add(back, lower, this.rightPage);

    // --- the half that swings: upper pages and the front board, about the
    //     spine at mid-thickness
    this.pivot.position.set(0, HINGE_Y, 0);
    const upper = pageBlock(edges, "bottom");
    upper.position.set(INSET + PAGE_W / 2, HALF_BLOCK / 2, 0);
    const front = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD, BOARD_D), cloth);
    front.position.set(BOARD_W / 2, HALF_BLOCK + BOARD / 2, 0);
    front.castShadow = front.receiveShadow = true;
    const coverFace = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_D).rotateX(-Math.PI / 2), cover);
    coverFace.position.set(BOARD_W / 2, HALF_BLOCK + BOARD + 0.001, 0);
    coverFace.receiveShadow = true;
    this.leftPage = new THREE.Mesh(pagePlane(true), pageMaterial(paper));
    this.leftPage.position.y = -0.002;
    this.leftPage.receiveShadow = true;
    this.pivot.add(upper, front, coverFace, this.leftPage);
    this.group.add(this.pivot);

    this.leftBase = Float32Array.from(this.leftPage.geometry.attributes.position.array as Float32Array);
    this.rightBase = Float32Array.from(this.rightPage.geometry.attributes.position.array as Float32Array);

    // --- the spine: a half-round of cloth over the left edge while closed
    const outer = HINGE_Y + BOARD * 0.2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, Math.PI / 2, (Math.PI * 3) / 2, false);
    shape.absarc(0, 0, outer - BOARD, (Math.PI * 3) / 2, Math.PI / 2, true);
    const spineGeometry = new THREE.ExtrudeGeometry(shape, { depth: BOARD_D, bevelEnabled: false, curveSegments: 20 });
    spineGeometry.translate(0, 0, -BOARD_D / 2);
    this.spine = new THREE.Mesh(spineGeometry, cloth);
    this.spine.position.set(0, HINGE_Y, 0);
    this.spine.castShadow = true;
    this.group.add(this.spine);

    // --- a satin ribbon out of the bottom of the gutter, onto the desk
    const ribbonGeometry = new THREE.PlaneGeometry(0.28, 3.2, 1, 16);
    const rp = ribbonGeometry.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const along = (1.6 - rp.getY(i)) / 3.2; // 0 at the book, 1 at the tip
      const drop = Math.min(1, along * 3.2);
      rp.setXYZ(i, 0.35 + rp.getX(i) + along * 0.5, HINGE_Y * (1 - drop * drop) + 0.004, PAGE_H / 2 - 0.2 + along * 3.0);
    }
    ribbonGeometry.computeVertexNormals();
    const ribbonMesh = new THREE.Mesh(ribbonGeometry, ribbon);
    ribbonMesh.castShadow = true;
    this.group.add(ribbonMesh);

    // --- the turning sheet, front and back
    const makeSheet = (flipU: boolean, side: THREE.Side) => {
      const geometry = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 40, 10);
      if (flipU) {
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      }
      const material = pageMaterial(paper);
      material.side = side;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.visible = false;
      mesh.frustumCulled = false;
      return mesh;
    };
    this.turnFront = makeSheet(false, THREE.FrontSide);
    this.turnBack = makeSheet(true, THREE.BackSide);
    this.group.add(this.turnFront, this.turnBack);

    // Closed, the book sits centred where the spread will be; it slides to
    // put its spine on the centre line as it opens.
    this.closedX = -BOARD_W / 2;
    this.setOpen(0);
  }

  setPages(left: THREE.Texture, right: THREE.Texture) {
    (this.leftPage.material as THREE.MeshStandardMaterial).map = left;
    (this.rightPage.material as THREE.MeshStandardMaterial).map = right;
    (this.leftPage.material as THREE.Material).needsUpdate = true;
    (this.rightPage.material as THREE.Material).needsUpdate = true;
  }

  /** 0 closed, 1 lying open at the spread. */
  setOpen(p: number) {
    const t = clamp01(p);
    const swing = smooth(clamp01(t / 0.9));
    this.pivot.rotation.z = Math.PI * swing;
    this.spine.rotation.z = (Math.PI / 2) * swing;
    // The spine is the book's left edge while it is closed; once it lies
    // open, the binding is under the pages, and its ends would show as two
    // dark bars up the gutter.
    this.spine.visible = swing < 0.55;
    const landed = smooth(clamp01((swing - 0.85) / 0.15));
    this.restingLeft.visible = landed > 0;
    (this.restingLeft.material as THREE.MeshBasicMaterial).opacity = 0.6 * landed;
    this.group.position.x = this.closedX * (1 - smooth(t));
    this.group.rotation.y = 0.07 * (1 - smooth(t));
    // The pages settle into the gutter as the swing lands.
    const settle = smooth(clamp01((t - 0.82) / 0.18));
    this.bendIntoGutter(this.rightPage, this.rightBase, settle, -1);
    this.bendIntoGutter(this.leftPage, this.leftBase, settle, 1);
  }

  private bendIntoGutter(mesh: THREE.Mesh, base: Float32Array, amount: number, dir: number) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const d = Math.max(0, x - INSET);
      pos.setY(i, base[i * 3 + 1] + dir * GUTTER * Math.exp(-d / GUTTER_REACH) * amount);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  /**
   * A page part-way through turning, 0 (lying on the right) to 1 (on the
   * left); null hides it. `front` is the page being turned away, `back` the
   * next spread's left page.
   */
  setTurn(p: number | null, front?: THREE.Texture, back?: THREE.Texture) {
    if (p === null) {
      this.turnFront.visible = this.turnBack.visible = false;
      return;
    }
    if (front) (this.turnFront.material as THREE.MeshStandardMaterial).map = front;
    if (back) (this.turnBack.material as THREE.MeshStandardMaterial).map = back;
    this.turnFront.visible = this.turnBack.visible = true;
    const geometry = this.turnFront.geometry;
    const pos = geometry.attributes.position;
    const nx = 40;
    const nz = 10;
    const ds = PAGE_W / nx;
    for (let iz = 0; iz <= nz; iz++) {
      const zn = iz / nz; // 0 far edge, 1 near edge
      const z = -PAGE_H / 2 + zn * PAGE_H;
      // The near corner leads: a hand takes the page by it.
      const tz = clamp01(p + 0.1 * Math.sin(Math.PI * p) * (zn - 0.5) * 2);
      const e = smooth(tz);
      const theta = Math.PI * e;
      const curl = 1.05 * Math.sin(Math.PI * tz);
      let x = INSET * (1 - 2 * e);
      let y = HINGE_Y - GUTTER + 0.004;
      for (let ix = 0; ix <= nx; ix++) {
        const i = iz * (nx + 1) + ix;
        pos.setXYZ(i, x, y + 0.004, z);
        const s = ix * ds;
        const rise = Math.atan((GUTTER / GUTTER_REACH) * Math.exp(-s / GUTTER_REACH));
        const angle = theta + (1 - 2 * e) * rise - curl * Math.pow(s / PAGE_W, 1.6);
        x += Math.cos(angle) * ds;
        y += Math.sin(angle) * ds;
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    // The back is the same sheet seen from below.
    const backGeometry = this.turnBack.geometry;
    (backGeometry.attributes.position.array as Float32Array).set(pos.array as Float32Array);
    backGeometry.attributes.position.needsUpdate = true;
    (backGeometry.attributes.normal.array as Float32Array).set(geometry.attributes.normal.array as Float32Array);
    backGeometry.attributes.normal.needsUpdate = true;
  }
}
