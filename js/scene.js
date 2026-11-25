import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const SYSTEMS = ['skin', 'muscles', 'bones', 'nerves'];
const PAPER = 0xf4efe6;
const INK = 0x1a1a1a;
const ACCENT = 0xd2452f;
const TONES = { bones: 0xefe7d8, muscles: 0xd9bfae, nerves: 0xe9dcc8, skin: 0xd8cfc2 };
const STATE_COLORS = { wrong: ACCENT, target: ACCENT, correct: 0x6b665e };
const CLICK_TOLERANCE_PX = 5;

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
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ab98, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 2.5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-2, 1, -2);
  scene.add(rim);
}

function boxOf(objects) {
  const box = new THREE.Box3();
  objects.forEach(o => box.expandByObject(o));
  return box;
}

export async function createScene(canvas, structures) {
  if (!hasWebGL()) throw new Error('webgl');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.12;
  controls.maxDistance = 6;

  const composer = new EffectComposer(renderer);
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
      if (system === 'skin') Object.assign(obj.material, { transparent: true, opacity: 0.14, depthWrite: false });
      meshes.set(obj.name, obj);
    });
    groups[system] = group;
    scene.add(group);
  });

  const layers = { skin: true, muscles: true, bones: true, nerves: true };
  let pickSystem = 'bones';
  const highlights = new Map();
  let flight = null;
  const pickListeners = [];
  const hoverListeners = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function meshAt(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!layers[pickSystem]) return null;
    const hit = raycaster.intersectObject(groups[pickSystem], true)[0];
    return hit ? hit.object.name : null;
  }

  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > CLICK_TOLERANCE_PX) return;
    const id = meshAt(e);
    pickListeners.forEach(cb => cb(id, e));
  });
  let hovered = null;
  canvas.addEventListener('pointermove', e => {
    if (down) return;
    const id = meshAt(e);
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

  function fly(view, ms) {
    flight = { from: { p: camera.position.clone(), t: controls.target.clone() }, to: view, start: performance.now(), ms };
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
    for (const [id, state] of highlights) {
      const m = meshes.get(id).material;
      if (state === 'target') m.emissive.setHex(ACCENT).multiplyScalar(0.25 + 0.35 * pulse);
    }
    controls.update();
    composer.render();
  }
  resize();

  const api = {
    get layers() { return { ...layers }; },

    setLayer(system, visible) {
      layers[system] = visible;
      groups[system].visible = visible;
    },

    setPickSystem(system) {
      pickSystem = system;
    },

    onPick(cb) { pickListeners.push(cb); },
    onHover(cb) { hoverListeners.push(cb); },

    highlight(id, state) {
      for (const [other, s] of highlights) {
        if (other === id || s === state) {
          const m = meshes.get(other).material;
          m.color.setHex(TONES[byId.get(other).system]);
          m.emissive.setHex(0);
          highlights.delete(other);
        }
      }
      if (!id || !state || !meshes.has(id)) return;
      highlights.set(id, state);
      if (STATE_COLORS[state]) meshes.get(id).material.color.setHex(STATE_COLORS[state]);
    },

    clearHighlights() {
      for (const id of [...highlights.keys()]) api.highlight(id, null);
    },

    flyTo(id, ms = 800) {
      const mesh = meshes.get(id);
      if (!mesh) return;
      const direction = camera.position.clone().sub(controls.target);
      fly(viewFor(boxOf([mesh]), direction, 2.6, 0.55), ms);
    },

    frameSystem(system, ms = 0) {
      const view = viewFor(boxOf([groups[system]]));
      if (ms) fly(view, ms);
      else {
        camera.position.copy(view.position);
        controls.target.copy(view.target);
      }
    },

    reset(ms = 700) {
      api.frameSystem(pickSystem, ms);
    },

    start() {
      resize();
      raf = requestAnimationFrame(frame);
    },

    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
  return api;
}
