// The desk: a first-person view of a warm, sunlit study desk, and the
// journal on it.
//
// The mood is the lofi study picture Andrew chose (2026-09-23: "more like
// this style just real", the objects moved around, the journal big and
// thick, the angle more top down): seen from the chair, the desk's front
// edge along the bottom of the picture, late peachy sun through a window
// and a plant's shadow across the desk, a laptop, books, tea, a cup of
// pencils, a pencil case like a sleepy animal, handwritten letters - built
// photographically rather than drawn: physically based materials, a sun that
// casts real shadows through a window-and-leaves pattern, filmic tone mapping.
// Everything here is procedural or baked small, so it costs little to
// download; the journal is always procedural, because its pages have to be
// the real layouts.
//
// No hands: the page is written on by an invisible pen.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Journal } from "./journal";
import { bookStack, laptop, mug, pen, pencilCase, pencilCup, pottedPlant } from "./props";
import { contactShadow, coverTextures, notepaper, pageEdges, softDot, windowLight } from "./textures";
import { HAND_FONTS } from "../handFonts";

export type DeskScene = {
  journal: Journal;
  renderer: THREE.WebGLRenderer;
  /** Advance the living parts - the light through the leaves, the steam -
   *  and draw a frame. */
  frame(seconds: number): void;
  resize(width: number, height: number): void;
  /** Where the pointer is over the hero, -1..1, for a little parallax. */
  lookToward(x: number, y: number): void;
  /** Settles when the baked textures have arrived (or failed to - the desk
   *  still draws, plainer). */
  loaded: Promise<void>;
  dispose(): void;
};

const DESK_TOP = 0;
/** The inches of desk one baked walnut tile covers (build-desk-textures). */
const WOOD_TILE = 48;
/** The desk top's depth, back to front; its front edge moves with the frame. */
const DESK_DEPTH = 60;
/** Where the journal lies: its centre, z. */
const BOOK_Z = -0.5;

/**
 * Chatoyancy - the shimmer figured wood has, bands of the grain brightening
 * and dimming as you move your head (asked for 2026-09-22: "slight
 * chatoyancy"). It comes from the fibres: in curly figure they dip into
 * the surface and rise out of it again, and each little run of fibre
 * throws light back hardest when it lies square to the halfway direction
 * between the sun and the eye. So the brightness is a hair-like highlight
 * (Kajiya-Kay) along each texel's fibre, tilted by the figure map's curl,
 * applied to the wood's colour: it moves when the camera does - the pointer
 * parallax and the slow sway of a seated head.
 */
function chatoyant(material: THREE.MeshPhysicalMaterial, figure: THREE.Texture, sun: THREE.Vector3, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.figureMap = { value: figure };
    shader.uniforms.sunDirection = { value: sun };
    shader.uniforms.chatoyancy = { value: strength };
    // Reachable for tuning (scene.getObjectByName("desk")).
    material.userData.chatoyancy = shader.uniforms.chatoyancy;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDeskWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvDeskWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vDeskWorld;\nuniform sampler2D figureMap;\nuniform vec3 sunDirection;\nuniform float chatoyancy;"
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
        {
          // The figure map shares the colour map's tiling. Its R and G are
          // the fibre's direction on the desk (image x is world x, image y
          // world z), B its tilt out of the surface.
          vec3 fig = texture2D(figureMap, vMapUv).rgb;
          vec2 along = fig.rg * 2.0 - 1.0;
          along /= max(length(along), 1e-3);
          float tilt = (fig.b * 2.0 - 1.0) * 0.55;
          vec3 fibre = vec3(along.x * cos(tilt), sin(tilt), along.y * cos(tilt));
          vec3 toEye = normalize(cameraPosition - vDeskWorld);
          vec3 halfway = normalize(sunDirection + toEye);
          float c = dot(fibre, halfway);
          float sheen = pow(max(0.0, 1.0 - c * c), 10.0);
          diffuseColor.rgb *= 1.0 + chatoyancy * (sheen - 0.5);
        }`
      );
  };
}

/** A soft dark patch under something resting on the desk, as a child of it. */
function restOn(group: THREE.Object3D, width: number, depth: number, round: boolean, opacity: number) {
  const margin = Math.min(width, depth) * 0.22 + 0.2;
  const { texture, planeW, planeD } = contactShadow(width, depth, margin, round);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(planeW, planeD).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  mesh.position.y = 0.004;
  mesh.renderOrder = -1;
  group.add(mesh);
}

/**
 * A loose sheet's surface. Paper never lies quite flat: it cockles a little
 * all over, and a corner that has been handled lifts. `corner` is which one
 * (+1/-1 in x, then z); `lift` how far, in inches.
 */
function sheetGeometry(width: number, height: number, seed: number, corner: readonly [number, number], lift: number) {
  const geometry = new THREE.PlaneGeometry(width, height, 24, 32).rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const cockle = 0.02 * (1 + Math.sin(x * 1.3 + seed) * Math.sin(z * 0.9 + seed * 2));
    const fromCorner = Math.hypot(1 - (corner[0] * x) / (width / 2), 1 - (corner[1] * z) / (height / 2));
    const curl = Math.max(0, 1 - fromCorner / 0.6);
    pos.setY(i, cockle + lift * curl * curl);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Where a thing stands: x, z, and its turn about the vertical. */
type Spot = readonly [x: number, z: number, turn: number];

export function createDeskScene(canvas: HTMLCanvasElement, wordmarkFamily: string): DeskScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // Past the desk's front edge: the dim of the room below it.
  scene.background = new THREE.Color(0x1a110b);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.3;

  // --- the baked textures (scripts/build-desk-textures.mts). Materials are
  //     built with them at once - an image arriving later is uploaded then -
  //     and `loaded` says when they all have.
  let settle = () => {};
  const loaded = new Promise<void>((resolve) => (settle = resolve));
  const manager = new THREE.LoadingManager(() => settle());
  const loader = new THREE.TextureLoader(manager);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const baked = (name: string, repeatX: number, repeatY: number, colour = false) => {
    const texture = loader.load(`/landing/${name}`);
    if (colour) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = anisotropy;
    return texture;
  };

  // --- camera: in the chair, looking down at the desk at about 60 degrees,
  //     close enough that the open journal spans half the picture
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  const target = new THREE.Vector3(0, 0, -2.4);
  const ELEVATION = THREE.MathUtils.degToRad(60);
  const DISTANCE = 27.5;
  const BASE = target.clone().add(new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(DISTANCE));
  const home = BASE.clone();
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  const BOOK_CENTRE = new THREE.Vector3(0, 0.7, BOOK_Z);
  /** Where the book's centre sits on an upright phone, from the top. */
  const PORTRAIT_BOOK_AT = 0.52;

  // --- the desk: figured black walnut, oiled, with a thin satin coat over
  //     it. The top runs from far behind to a rounded front edge, which is
  //     placed for each frame (see resize) just above the bottom of the
  //     picture, as the edge of a desk shows from its chair.
  const SUN_AT = new THREE.Vector3(-30, 46, -42);
  const SUN_AIM = new THREE.Vector3(3, 0, 1);
  const wood = (name: string, colour = false) => baked(name, 90 / WOOD_TILE, DESK_DEPTH / WOOD_TILE, colour);
  const woodMap = wood("wood.jpg", true);
  const woodSurface = wood("wood-surface.jpg");
  const woodFigure = wood("wood-figure.jpg");
  const deskMaterial = new THREE.MeshPhysicalMaterial({
    map: woodMap,
    roughnessMap: woodSurface,
    roughness: 1,
    bumpMap: woodSurface,
    bumpScale: 0.6,
    clearcoat: 0.3,
    clearcoatRoughness: 0.32,
  });
  chatoyant(deskMaterial, woodFigure, SUN_AT.clone().sub(SUN_AIM).normalize(), 0.28);
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(90, DESK_DEPTH).rotateX(-Math.PI / 2), deskMaterial);
  desk.name = "desk";
  desk.receiveShadow = true;
  const nose = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 90, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x3e2517, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 })
  );
  nose.receiveShadow = true;
  scene.add(desk, nose);
  const placeEdge = (edge: number) => {
    desk.position.set(0, DESK_TOP, edge - DESK_DEPTH / 2);
    nose.position.set(0, DESK_TOP - 0.75, edge);
    // The bake placed its swirls, knots and mug ring by world position
    // (toTile in build-desk-textures), for a top whose front edge was at
    // z 25; shift the tiling so they stay where they were put.
    for (const t of [woodMap, woodSurface, woodFigure]) t.offset.y = (25 - edge) / WOOD_TILE;
  };
  placeEdge(8);

  // --- light: late peachy sun through a window, and the room's bounce
  const windowPattern = windowLight();
  const sun = new THREE.SpotLight(0xffb98a, 8, 0, 0.36, 0.45, 0);
  sun.position.copy(SUN_AT);
  sun.target.position.copy(SUN_AIM);
  sun.map = windowPattern;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sky = new THREE.HemisphereLight(0xffe0c8, 0x4a2e1f, 0.62);
  const fill = new THREE.DirectionalLight(0xffcfa8, 0.3);
  fill.position.set(8, 20, 30);
  scene.add(sky, fill);

  // --- the journal
  const linen = baked("linen.jpg", 3, 3);
  const cover = coverTextures(wordmarkFamily);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2c2b2d, roughness: 0.9, bumpMap: linen, bumpScale: 0.5 });
  const coverMaterial = new THREE.MeshStandardMaterial({
    map: cover.map,
    roughnessMap: cover.roughnessMap,
    roughness: 1,
    bumpMap: cover.bumpMap,
    bumpScale: 1.2,
  });
  const edgesMap = pageEdges();
  const edges = new THREE.MeshStandardMaterial({ map: edgesMap, roughness: 0.95 });
  const journal = new Journal({
    cloth,
    cover: coverMaterial,
    edges,
    ribbon: new THREE.MeshStandardMaterial({ color: 0x7c1f25, roughness: 0.45, side: THREE.DoubleSide }),
    // The paper tile is 4in square; a page is 7 x 10.
    paper: baked("paper.jpg", 7 / 4, 10 / 4),
  });
  journal.group.position.z = BOOK_Z;
  scene.add(journal.group);

  // --- the rest of the desk, in the manner of the lofi reference
  const clothBump = baked("linen.jpg", 2, 2);
  const props = {
    laptop: laptop(),
    plant: pottedPlant(),
    case: pencilCase(clothBump),
    cup: pencilCup(),
    mug: mug(),
    books: bookStack(edges, clothBump),
    pen: pen(),
  };
  restOn(props.laptop, 12.3, 8.6, false, 0.5);
  restOn(props.plant, 4.4, 4.4, true, 0.55);
  restOn(props.case, 7.4, 1.9, true, 0.5);
  restOn(props.cup, 2.7, 2.7, true, 0.55);
  restOn(props.mug, 3.0, 3.0, true, 0.55);
  restOn(props.books, 7.4, 9.8, false, 0.5);
  scene.add(...Object.values(props));

  // Handwritten letters and lists, tucked under things as in the reference.
  const notes = [
    {
      // Under the laptop's front.
      paper: [8.5, 11],
      look: "letter",
      curl: [[1, 1], 0.14],
      ink: "#4a3326",
      face: HAND_FONTS.homemade,
      size: 30,
      lines: [
        "Dear Mira,",
        "the lemon tree finally",
        "flowered this week - the",
        "whole kitchen smells of it.",
        "I wish you could see it.",
        "Tell me about the new flat?",
        "Send photos, all of them.",
        "",
        "love always,",
        "      June",
      ],
    },
    {
      // Under the books.
      paper: [5.5, 8.5],
      look: "ruled",
      curl: [[1, 1], 0.2],
      ink: "#2a3a8a",
      face: HAND_FONTS.caveat,
      size: 40,
      lines: ["Sunday", "~laundry", "call grandma", "finish chapter 4", "water the plants", "buy stamps", "  + envelopes", "~return library books"],
    },
    {
      // Under the cup of pencils.
      paper: [6, 9],
      look: "letter",
      curl: [[-1, 1], 0.12],
      ink: "#1d1c21",
      face: HAND_FONTS.reenie,
      size: 46,
      lines: ["ideas for the market", "  pressed flower cards", "  linen gift wraps", "  a small zine about tea", "", "reading list", "  Piranesi", "~  The Overstory"],
    },
  ] as const;
  const sheets = notes.map((note, i) => {
    const sheet = notepaper(note.ink, [...note.lines], 11 + i * 7, note.paper, note.look);
    const [width, height] = note.paper;
    const [corner, lift] = note.curl;
    const mesh = new THREE.Mesh(
      sheetGeometry(width, height, i * 3.1, corner, lift),
      new THREE.MeshStandardMaterial({
        map: sheet.texture,
        roughness: 0.92,
        bumpMap: baked("paper.jpg", width / 4, height / 4),
        bumpScale: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    mesh.position.y = DESK_TOP + 0.012 + i * 0.004;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    void document.fonts.load(`${note.size}px ${note.face}`).then(
      () => sheet.write(note.face, note.size),
      () => {}
    );
    return mesh;
  });

  // Around the book on a wide screen. An upright phone sees little beside
  // the book and much above and below it, so there the laptop, plant and
  // books go beyond it and the tea and the pen come round in front.
  const LAYOUTS: Record<"wide" | "tall", { laptop: Spot; plant: Spot; case: Spot; cup: Spot; mug: Spot; books: Spot; pen: Spot; sheets: Spot[] }> = {
    // The title lies over the far middle of the desk: only flat things
    // there (paper), the tall ones out to the sides.
    wide: {
      laptop: [-16.6, -14.8, 0.42],
      plant: [15.2, -13, 0],
      case: [-13.2, -5.4, 0.3],
      cup: [13.3, -3.6, 0.3],
      mug: [11, 2.8, -0.4],
      books: [-13.8, 2.2, 0.14],
      pen: [9.4, -6, 1.1],
      sheets: [
        [-8.5, -9.8, 0.2],
        [-14.2, 4.2, -0.3],
        [13, -6.8, 0.12],
      ],
    },
    tall: {
      laptop: [-6, -28, 0.3],
      plant: [7.8, -25, 0],
      case: [-1.5, -10.4, -0.2],
      cup: [7.4, -9.6, 0.3],
      mug: [5.2, 10.6, -0.4],
      books: [-6.2, 10.8, -0.22],
      pen: [0.8, 8.2, 0.35],
      sheets: [
        [-7.5, -24.5, 0.2],
        [-8.5, 3.5, -0.3],
        [7.5, -7.5, 0.12],
      ],
    },
  };
  const arrange = (portrait: boolean) => {
    const layout = LAYOUTS[portrait ? "tall" : "wide"];
    for (const key of ["laptop", "plant", "case", "cup", "mug", "books", "pen"] as const) {
      const [x, z, turn] = layout[key];
      props[key].position.set(x, DESK_TOP, z);
      props[key].rotation.y = turn;
    }
    sheets.forEach((sheet, i) => {
      const [x, z, turn] = layout.sheets[i];
      sheet.position.x = x;
      sheet.position.z = z;
      sheet.rotation.y = turn;
    });
  };
  arrange(false);

  // --- steam off the tea
  const steamTexture = softDot();
  const steam = Array.from({ length: 5 }, (_, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTexture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    sprite.userData.phase = i / 5;
    scene.add(sprite);
    return sprite;
  });

  function frame(seconds: number) {
    // The light through the leaves drifts, as if a breeze moved the plant.
    windowPattern.center.set(0.5, 0.5);
    windowPattern.rotation = Math.sin(seconds * 0.23) * 0.012;
    windowPattern.offset.set(Math.sin(seconds * 0.31) * 0.004, Math.cos(seconds * 0.27) * 0.004);
    const tea = props.mug.position;
    for (const s of steam) {
      const life = (seconds * 0.16 + s.userData.phase) % 1;
      s.position.set(tea.x + Math.sin(seconds * 0.7 + s.userData.phase * 9) * 0.35 * life, 3.5 + life * 4.5, tea.z + Math.cos(seconds * 0.5 + s.userData.phase * 7) * 0.2);
      s.scale.setScalar(0.9 + life * 2.6);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(life * Math.PI) * 0.1;
    }
    look.x += (look.tx - look.x) * 0.05;
    look.y += (look.ty - look.y) * 0.05;
    // A seated head is never quite still: a slow sway, which also keeps the
    // walnut's shimmer moving when the pointer is not.
    const swayX = Math.sin(seconds * 0.13) * 0.35;
    const swayY = Math.sin(seconds * 0.09 + 1.3) * 0.2;
    camera.position.set(home.x + look.x * 0.9 + swayX, home.y - look.y * 0.5 + swayY, home.z);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  function resize(width: number, height: number) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    // Keep the whole open spread (about 15in with its covers) in frame on a
    // narrow screen: step the camera back along its own line of sight. A
    // phone held upright has no room for the props either side, so the book
    // takes nearly the whole width there.
    const portrait = camera.aspect < 0.9;
    arrange(portrait);
    const halfWidth = portrait ? 8.6 : 10.5;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const needed = halfWidth / Math.tan(hfov / 2);
    const distance = BASE.distanceTo(target);
    const scale = Math.max(1, needed / distance);
    home.copy(target).add(BASE.clone().sub(target).multiplyScalar(scale));
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.position.copy(home);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    // Stepping back shows a tall band of empty desk above and below the book;
    // shift the picture so the book sits just under the title instead of
    // below the middle.
    if (portrait) {
      const at = BOOK_CENTRE.clone().project(camera).y;
      const shift = ((1 - at) / 2 - PORTRAIT_BOOK_AT) * height;
      camera.setViewOffset(width, height, 0, shift, width, height);
      camera.updateMatrixWorld();
    }
    // The desk's front edge: where the desk meets a line a little above the
    // bottom of the picture (found by halving - nearer the camera is lower
    // in the frame), and never closer to the book than its ribbon reaches.
    const probe = new THREE.Vector3();
    const screenY = (z: number) => probe.set(0, DESK_TOP, z).project(camera).y;
    let far = BOOK_Z + 7.2;
    let near = home.z - 1;
    if (screenY(far) < -0.86) near = far;
    for (let i = 0; i < 30; i++) {
      const mid = (far + near) / 2;
      if (screenY(mid) > -0.86) far = mid;
      else near = mid;
    }
    placeEdge(far);
  }

  return {
    journal,
    renderer,
    frame,
    resize,
    lookToward(x, y) {
      look.tx = x;
      look.ty = y;
    },
    loaded,
    dispose() {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      pmrem.dispose();
      environment.dispose();
      renderer.dispose();
      // Give the context back now rather than when the canvas is collected:
      // a browser allows only a handful at once.
      renderer.forceContextLoss();
    },
  };
}
