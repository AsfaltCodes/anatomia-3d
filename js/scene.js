import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const SYSTEMS = ['skin', 'muscles', 'bones', 'nerves'];
const BACKGROUND = 0xffffff;
const INK = 0x18161b;
const PINK = 0xe6397a;
const SLATE = 0x4a4550;
const TONES = { bones: 0xebe6e0, muscles: 0xdcc4bf, nerves: 0xe3c07a, skin: 0xd9d3d0 };
const STATE_COLORS = { wrong: SLATE, target: PINK, correct: PINK };
const DIMMED_OPACITY = 0.18;
const CLICK_TOLERANCE_PX = 6;
const TOUCH_PICK_RADIUS = 16;
const MOUSE_PICK_RADIUS = 5;

const gltfCache = new Map();

export function loadSystem(system) {
  if (!gltfCache.has(system)) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    gltfCache.set(system, loader.loadAsync(`assets/models/${system}.glb`));
  }
  return gltfCache.get(system);
}

export function hasWebGL() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b0b4, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(1.5, 2.5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-2, 1, -2);
  scene.add(rim);
}

export function boxOf(objects) {
  const box = new THREE.Box3();
  objects.forEach(o => box.expandByObject(o));
  return box;
}

export async function createScene(canvas, structures) {
  if (!hasWebGL()) throw new Error('webgl');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.12;
  controls.maxDistance = 6;

  // The composer draws into its own buffer, which skips the renderer's antialiasing; 4× MSAA brings it back.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  outline.visibleEdgeColor.set(INK);
  outline.hiddenEdgeColor.set(INK);
  outline.edgeStrength = 4;
  outline.edgeThickness = 1;
  composer.addPass(outline);
  composer.addPass(new OutputPass());

  const meshes = new Map();
  const groups = {};
  const byId = new Map(structures.map(s => [s.id, s]));
  const gltfs = await Promise.all(SYSTEMS.map(loadSystem));
  SYSTEMS.forEach((system, i) => {
    const group = gltfs[i].scene.clone();
    group.traverse(obj => {
      if (!obj.isMesh || !byId.has(obj.name)) return;
      obj.geometry.computeVertexNormals();
      obj.material = new THREE.MeshStandardMaterial({ color: TONES[system], roughness: 0.85, metalness: 0 });
      if (system === 'skin') Object.assign(obj.material, { transparent: true, opacity: 0.12, depthWrite: false });
      meshes.set(obj.name, obj);
    });
    groups[system] = group;
    scene.add(group);
  });

  const layers = { skin: true, muscles: true, bones: true, nerves: true };
  let pickable = [];
  const highlights = new Map();
  let flight = null;
  let running = false;
  const pickListeners = [];
  const hoverListeners = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Thin parts (nerves) are a pixel or two wide, so if nothing is exactly under the pointer
  // we also look at points on rings around it and take the hit closest to the centre.
  const PICK_RINGS = [0, 0.5, 1];
  const PICK_DIRECTIONS = 8;

  function meshAt(event, radius = 0) {
    const rect = canvas.getBoundingClientRect();
    const targets = pickable.filter(m => layers[byId.get(m.name).system]);
    for (const ring of radius ? PICK_RINGS : [0]) {
      const steps = ring ? PICK_DIRECTIONS : 1;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const x = event.clientX + Math.cos(angle) * ring * radius;
        const y = event.clientY + Math.sin(angle) * ring * radius;
        pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(targets, false)[0];
        if (hit) return hit.object.name;
      }
    }
    return null;
  }

  let down = null;
  canvas.addEventListener('pointerdown', e => {
    down = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  });
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('pointerup', e => {
    if (!down || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > CLICK_TOLERANCE_PX) return;
    const id = meshAt(e, e.pointerType === 'touch' ? TOUCH_PICK_RADIUS : MOUSE_PICK_RADIUS);
    pickListeners.forEach(cb => cb(id, e));
  });
  let hovered = null;
  canvas.addEventListener('pointermove', e => {
    if (down || e.pointerType === 'touch') return;
    const id = meshAt(e, MOUSE_PICK_RADIUS);
    if (id === hovered) return;
    hovered = id;
    outline.selectedObjects = id ? [meshes.get(id)] : [];
    canvas.style.cursor = id ? 'pointer' : 'grab';
    hoverListeners.forEach(cb => cb(id, e));
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    outline.selectedObjects = [];
    hoverListeners.forEach(cb => cb(null));
  });

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  function viewFor(box, direction = new THREE.Vector3(0, 0, 1), padding = 1.15, minDistance = 0.18) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fit = Math.max(size.y, size.x / Math.max(camera.aspect, 0.5)) / 2 / Math.tan(fov / 2);
    const distance = Math.max(fit * padding, minDistance);
    return { target: center, position: center.clone().add(direction.clone().normalize().multiplyScalar(distance)) };
  }

  function go(view, ms) {
    if (ms) {
      flight = { from: { p: camera.position.clone(), t: controls.target.clone() }, to: view, start: performance.now(), ms };
    } else {
      flight = null;
      camera.position.copy(view.position);
      controls.target.copy(view.target);
    }
  }

  function baseColor(id) {
    return TONES[byId.get(id).system];
  }

  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (flight) {
      const k = Math.min((now - flight.start) / flight.ms, 1);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(flight.from.p, flight.to.position, e);
      controls.target.lerpVectors(flight.from.t, flight.to.target, e);
      if (k === 1) flight = null;
    }
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    for (const [id, state] of highlights)
      if (state === 'target') meshes.get(id).material.emissive.setHex(PINK).multiplyScalar(0.15 + 0.3 * pulse);
    controls.update();
    composer.render();
  }

  let focusIds = [];
  const api = {
    get layers() { return { ...layers }; },

    setLayer(system, visible) {
      layers[system] = visible;
      groups[system].visible = visible;
    },

    // The focused parts are pickable; the rest of their system stays visible but faded, for context.
    setFocus(systems, ids, frameIds = ids) {
      focusIds = frameIds;
      const focus = new Set(ids);
      pickable = [];
      for (const [id, mesh] of meshes) {
        const s = byId.get(id).system;
        if (s === 'skin') continue;
        const inFocus = systems.includes(s) && focus.has(id);
        const faded = systems.includes(s) && !inFocus;
        Object.assign(mesh.material, { transparent: faded, opacity: faded ? DIMMED_OPACITY : 1, depthWrite: !faded });
        if (inFocus) pickable.push(mesh);
      }
    },

    onPick(cb) { pickListeners.push(cb); },
    onHover(cb) { hoverListeners.push(cb); },

    highlight(id, state) {
      for (const [other, s] of highlights) {
        if (other === id || s === state) {
          const m = meshes.get(other).material;
          m.color.setHex(baseColor(other));
          m.emissive.setHex(0);
          highlights.delete(other);
        }
      }
      if (!id || !state || !meshes.has(id)) return;
      highlights.set(id, state);
      meshes.get(id).material.color.setHex(STATE_COLORS[state]);
    },

    clearHighlights() {
      for (const id of [...highlights.keys()]) api.highlight(id, null);
    },

    flyTo(id, ms = 800) {
      const mesh = meshes.get(id);
      if (!mesh) return;
      const direction = camera.position.clone().sub(controls.target);
      go(viewFor(boxOf([mesh]), direction, 2.6, 0.55), ms);
    },

    frameFocus(ms = 0) {
      go(viewFor(boxOf(focusIds.map(id => meshes.get(id))), undefined, 1.3), ms);
    },

    setTheme(dark) {
      scene.background.setHex(dark ? 0x141216 : BACKGROUND);
      outline.visibleEdgeColor.set(dark ? 0xf3eff4 : INK);
      outline.hiddenEdgeColor.set(dark ? 0xf3eff4 : INK);
    },

    pause() {
      running = false;
      cancelAnimationFrame(raf);
    },

    resume() {
      if (running) return;
      running = true;
      resize();
      raf = requestAnimationFrame(frame);
    },
  };
  return api;
}
