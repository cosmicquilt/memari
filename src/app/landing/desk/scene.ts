// The desk: a first-person view of a warm, sunlit study desk, and the
// journal on it.
//
// The mood is the lofi study videos Andrew pointed to - late sun through a
// window, a plant's shadow across the desk, tea, books, pencils - built
// photographically rather than drawn: physically based materials, a sun that
// casts real shadows through a window-and-leaves pattern, filmic tone mapping.
// Everything here is procedural so it costs almost nothing to download; when
// photographs arrive, the desk, wall and props are what they replace (with
// the renderer's clear set transparent and the journal's shadow caught on a
// shadow-only plane), and the journal stays, because its pages have to be the
// real layouts.
//
// No hands: the page is written on by an invisible pen.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Journal, PAGE_W } from "./journal";
import { coverTextures, linenBump, notepaper, pageEdges, softDot, windowLight, woodTextures } from "./textures";
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
  dispose(): void;
};

const DESK_TOP = 0;

function lathe(profile: Array<[number, number]>, segments = 48) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
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

function mug() {
  const g = new THREE.Group();
  const glaze = new THREE.MeshPhysicalMaterial({ color: 0xefe6d8, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const body = new THREE.Mesh(
    lathe([
      [0, 0],
      [1.45, 0],
      [1.55, 0.12],
      [1.62, 3.4],
      [1.5, 3.5],
      [1.48, 3.3],
      [1.4, 0.35],
      [0, 0.3],
    ]),
    glaze
  );
  const tea = new THREE.Mesh(new THREE.CircleGeometry(1.46, 40).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x4a1e0c, roughness: 0.06, clearcoat: 1 }));
  tea.position.y = 2.95;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.17, 14, 28, Math.PI * 1.2), glaze);
  handle.rotation.z = -Math.PI * 0.6;
  handle.position.set(1.55, 1.8, 0);
  g.add(body, tea, handle);
  return shadowed(g);
}

function plant() {
  const g = new THREE.Group();
  const clay = new THREE.MeshStandardMaterial({ color: 0xb0613b, roughness: 0.88 });
  g.add(
    new THREE.Mesh(
      lathe([
        [0, 0],
        [1.55, 0],
        [2.05, 3.2],
        [2.3, 3.25],
        [2.3, 3.9],
        [2.1, 3.9],
        [2.05, 3.6],
        [0, 3.5],
      ]),
      clay
    )
  );
  const soil = new THREE.Mesh(new THREE.CircleGeometry(2.0, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e2118, roughness: 1 }));
  soil.position.y = 3.6;
  g.add(soil);
  // Pothos-ish leaves on arching stems, some trailing over the rim.
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.9, 0.6, 0, 2.2);
  leafShape.quadraticCurveTo(-0.9, 0.6, 0, 0);
  const leafGeometry = new THREE.ShapeGeometry(leafShape, 8);
  // Cup each leaf a little along its midrib.
  const lp = leafGeometry.attributes.position;
  for (let i = 0; i < lp.count; i++) lp.setZ(i, Math.pow(lp.getX(i), 2) * 0.35);
  leafGeometry.computeVertexNormals();
  const greens = [0x3e6b34, 0x4c7c3c, 0x365f2e, 0x5a8a46];
  for (let i = 0; i < 16; i++) {
    const leaf = new THREE.Mesh(leafGeometry, new THREE.MeshStandardMaterial({ color: greens[i % greens.length], roughness: 0.5, side: THREE.DoubleSide }));
    const around = (i / 16) * Math.PI * 2 + (i % 3) * 0.3;
    const out = 0.6 + (i % 4) * 0.45;
    const trailing = i % 5 === 0;
    leaf.position.set(Math.cos(around) * out, 3.8 + (trailing ? -0.4 : (i % 3) * 0.9), Math.sin(around) * out);
    leaf.rotation.set(trailing ? 1.9 : -0.6 - (i % 3) * 0.25, -around + Math.PI / 2, (i % 2 ? 1 : -1) * 0.3);
    leaf.scale.setScalar(0.9 + (i % 3) * 0.2);
    g.add(leaf);
  }
  return shadowed(g);
}

function pencilCup() {
  const g = new THREE.Group();
  const glaze = new THREE.MeshPhysicalMaterial({ color: 0xa3382f, roughness: 0.32, clearcoat: 0.6 });
  g.add(
    new THREE.Mesh(
      lathe([
        [0, 0],
        [1.3, 0],
        [1.35, 3.6],
        [1.22, 3.6],
        [1.2, 0.2],
        [0, 0.2],
      ]),
      glaze
    )
  );
  const colors = [0xe0b53a, 0x2f5d3a, 0x1d1c21, 0xc9c3b6, 0x3a4f8f];
  for (let i = 0; i < 5; i++) {
    const pencil = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.2, 6), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.55 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }));
    tip.position.y = 3.35;
    pencil.add(body, tip);
    pencil.position.set(Math.cos(i * 1.3) * 0.5, 3.4, Math.sin(i * 1.3) * 0.5);
    pencil.rotation.set(Math.sin(i * 2.1) * 0.22, 0, Math.cos(i * 1.7) * 0.22);
    g.add(pencil);
  }
  return shadowed(g);
}

function bookStack(edgesMap: THREE.Texture) {
  const g = new THREE.Group();
  const specs: Array<[number, number, number, number, number]> = [
    // width, thickness, depth, cloth colour, twist
    [6.4, 1.2, 9.0, 0xa4543a, 0],
    [5.9, 0.9, 8.4, 0x7a8b67, 0.09],
    [6.6, 0.75, 8.8, 0xd6c6a3, -0.06],
  ];
  let y = 0;
  const edges = new THREE.MeshStandardMaterial({ map: edgesMap, roughness: 0.95 });
  for (const [w, t, d, colour, twist] of specs) {
    const cloth = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85 });
    const book = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), [edges, cloth, cloth, cloth, edges, edges]);
    book.position.y = y + t / 2;
    book.rotation.y = twist;
    y += t;
    g.add(book);
  }
  return shadowed(g);
}

function pen() {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 5.4, 20), new THREE.MeshStandardMaterial({ color: 0x1e1d22, roughness: 0.35 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 20), new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 0.9, roughness: 0.25 }));
  tip.position.y = -2.97;
  tip.rotation.x = Math.PI;
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.12), new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 0.9, roughness: 0.25 }));
  clip.position.set(0, 1.6, 0.2);
  g.add(barrel, tip, clip);
  g.rotation.z = Math.PI / 2;
  return shadowed(g);
}

export function createDeskScene(canvas: HTMLCanvasElement, wordmarkFamily: string): DeskScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8dcc8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.25;

  // --- camera: seated, looking down at the desk
  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 400);
  // Aimed above the book, so the book sits in the lower part of the frame
  // with the title over the desk beyond it.
  const target = new THREE.Vector3(0, 0, -2.6);
  const BASE = new THREE.Vector3(0, 30, 21);
  const home = BASE.clone();
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  const BOOK_CENTRE = new THREE.Vector3(0, 0.4, 0.4);
  /** Where the book's centre sits on an upright phone, from the top. */
  const PORTRAIT_BOOK_AT = 0.5;

  // --- the desk and the wall behind it
  const wood = woodTextures();
  wood.map.repeat.set(3.4, 2.4);
  wood.roughnessMap.repeat.set(3.4, 2.4);
  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 62).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: wood.map, roughnessMap: wood.roughnessMap, roughness: 1, metalness: 0 })
  );
  desk.position.set(0, DESK_TOP, -6);
  desk.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(120, 50), new THREE.MeshStandardMaterial({ color: 0xe9dcc5, roughness: 0.97 }));
  wall.position.set(0, 25, -37);
  wall.receiveShadow = true;
  scene.add(desk, wall);

  // --- light: late sun through a window, and the room's bounce
  const windowPattern = windowLight();
  const sun = new THREE.SpotLight(0xffcf98, 7, 0, 0.36, 0.45, 0);
  sun.position.set(-30, 46, -42);
  sun.target.position.set(3, 0, 1);
  sun.map = windowPattern;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sky = new THREE.HemisphereLight(0xfff0dc, 0x6a4630, 0.75);
  const fill = new THREE.DirectionalLight(0xffe2c0, 0.35);
  fill.position.set(8, 20, 30);
  scene.add(sky, fill);

  // --- the journal
  const linen = linenBump();
  linen.repeat.set(3, 3);
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
  const journal = new Journal({
    cloth,
    cover: coverMaterial,
    edges: new THREE.MeshStandardMaterial({ map: edgesMap, roughness: 0.95 }),
    ribbon: new THREE.MeshStandardMaterial({ color: 0x7c1f25, roughness: 0.45, side: THREE.DoubleSide }),
  });
  journal.group.position.z = 0.4;
  scene.add(journal.group);

  // --- the rest of the desk
  const mugGroup = mug();
  const plantGroup = plant();
  const cup = pencilCup();
  const books = bookStack(edgesMap);
  books.rotation.y = 0.32;
  const penGroup = pen();
  scene.add(mugGroup, plantGroup, cup, books, penGroup);
  // Around the book on a wide screen; on an upright phone the sides are out
  // of frame, so the tea and the pen come down in front of the book, and the
  // plant and the pencils sit beyond it.
  const arrange = (portrait: boolean) => {
    if (portrait) {
      mugGroup.position.set(4.9, DESK_TOP, 11.4);
      penGroup.position.set(-2.8, DESK_TOP + 0.18, 8.7);
      penGroup.rotation.y = 0.18;
      plantGroup.position.set(10.2, DESK_TOP, -21);
      cup.position.set(-9.6, DESK_TOP, -19);
    } else {
      mugGroup.position.set(PAGE_W + 3.6, DESK_TOP, 3.2);
      penGroup.position.set(PAGE_W + 1.6, DESK_TOP + 0.18, -1.5);
      penGroup.rotation.y = 0.9;
      plantGroup.position.set(15.5, DESK_TOP, -10.5);
      cup.position.set(-15.6, DESK_TOP, -11.2);
    }
    books.position.set(15.8, DESK_TOP, -1.2);
  };
  arrange(false);

  // Loose notes in two other people's hands: a letter sheet, and a jotter
  // page on top of it.
  const notes = [
    {
      at: [-11.3, 3.4, 0.16, 0.02],
      paper: [5.5, 8.5],
      ink: "#2a3a8a",
      face: HAND_FONTS.caveat,
      size: 40,
      lines: [
        "Sat 26th",
        "farmers market - 9am",
        "call Mum back",
        "  ask about Sunday lunch",
        "pick up film from the lab",
        "~book dentist",
        "garden:",
        "  tomatoes, basil, mint",
        "  fix the side gate",
        "return library books",
      ],
    },
    {
      at: [-11.8, -3.2, -0.22, 0.012],
      paper: [8.5, 11],
      ink: "#1d1c21",
      face: HAND_FONTS.reenie,
      size: 46,
      lines: [
        "reading list",
        "  Piranesi",
        "~  The Overstory",
        "  Braiding Sweetgrass",
        "  A Psalm for the Wild-Built",
        "",
        "gift ideas for Jo",
        "  ceramic mug",
        "  pressed flower frame",
        "  the good olive oil",
      ],
    },
  ] as const;
  for (const [i, note] of notes.entries()) {
    const [x, z, turn, y] = note.at;
    const sheet = notepaper(note.ink, [...note.lines], 11 + i * 7, note.paper);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(...note.paper).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: sheet.texture, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1 })
    );
    mesh.position.set(x, DESK_TOP + y, z);
    mesh.rotation.y = turn;
    mesh.receiveShadow = true;
    scene.add(mesh);
    void document.fonts.load(`${note.size}px ${note.face}`).then(
      () => sheet.write(note.face, note.size),
      () => {}
    );
  }

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
    for (const s of steam) {
      const life = (seconds * 0.16 + s.userData.phase) % 1;
      s.position.set(mugGroup.position.x + Math.sin(seconds * 0.7 + s.userData.phase * 9) * 0.35 * life, 3.5 + life * 4.5, mugGroup.position.z + Math.cos(seconds * 0.5 + s.userData.phase * 7) * 0.2);
      s.scale.setScalar(0.9 + life * 2.6);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(life * Math.PI) * 0.1;
    }
    look.x += (look.tx - look.x) * 0.05;
    look.y += (look.ty - look.y) * 0.05;
    camera.position.set(home.x + look.x * 0.9, home.y - look.y * 0.5, home.z);
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
    const halfWidth = portrait ? 8.6 : 10.2;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const needed = halfWidth / Math.tan(hfov / 2);
    const distance = BASE.distanceTo(target);
    const scale = Math.max(1, needed / distance);
    home.copy(target).add(BASE.clone().sub(target).multiplyScalar(scale));
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // Stepping back shows a tall band of empty desk above and below the book;
    // shift the picture so the book sits just under the title instead of
    // below the middle.
    if (portrait) {
      camera.position.copy(home);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const at = BOOK_CENTRE.clone().project(camera).y;
      const shift = ((1 - at) / 2 - PORTRAIT_BOOK_AT) * height;
      camera.setViewOffset(width, height, 0, shift, width, height);
    }
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
