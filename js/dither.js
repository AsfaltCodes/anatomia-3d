import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadSystem, addLights, hasWebGL, boxOf } from './scene.js';

const BLOCK_CSS_PX = 2;
const SPIN_SPEED = 0.6;
const START_ANGLE = -0.35;

// 8×8 Bayer matrix: each cell is the brightness threshold for that pixel of the tile.
const BAYER_8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
].map(v => (v + 0.5) / 64);

const rgb = hex => new THREE.Vector3((hex >> 16) & 255, (hex >> 8) & 255, hex & 255).divideScalar(255);

const DitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    block: { value: 2 },
    bayer: { value: BAYER_8 },
    ink: { value: rgb(0xe6397a) },
    paper: { value: rgb(0xffffff) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float block;
    uniform float bayer[64];
    uniform vec3 ink;
    uniform vec3 paper;
    void main() {
      vec2 cell = floor(gl_FragCoord.xy / block);
      vec2 uv = (cell * block + block * 0.5) / resolution;
      vec3 color = texture2D(tDiffuse, uv).rgb;
      float light = dot(color, vec3(0.299, 0.587, 0.114));
      ivec2 p = ivec2(mod(cell, 8.0));
      float threshold = bayer[p.y * 8 + p.x];
      gl_FragColor = vec4(light > threshold ? paper : ink, 1.0);
    }
  `,
};

// One WebGL context draws every card: each quiz is rendered into the shared canvas, then copied into its card.
export async function createThumbnails(structures, quizzes) {
  if (!hasWebGL()) return null;

  const dpr = Math.min(devicePixelRatio, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 20);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const dither = new ShaderPass(DitherShader);
  dither.uniforms.block.value = BLOCK_CSS_PX * dpr;
  composer.addPass(dither);

  const material = new THREE.MeshStandardMaterial({ color: 0x9c9599, roughness: 0.7 });
  const pivot = new THREE.Group();
  scene.add(pivot);
  const systemsOf = quiz => (quiz.system === 'all' ? ['bones', 'muscles'] : [quiz.system]);
  const systems = [...new Set(quizzes.flatMap(systemsOf))];
  const groups = {};
  for (const system of systems) {
    const group = (await loadSystem(system)).scene.clone();
    group.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeVertexNormals();
      o.material = material;
    });
    groups[system] = group;
    pivot.add(group);
  }

  const views = new Map(quizzes.map(quiz => {
    const shown = systemsOf(quiz);
    const ids = new Set(structures.filter(s => shown.includes(s.system) && (!quiz.region || s.region === quiz.region)).map(s => s.id));
    const meshes = [];
    const framed = new Set(quiz.frame ?? ids);
    shown.forEach(system => groups[system].traverse(o => { if (o.isMesh && framed.has(o.name)) meshes.push(o); }));
    return [quiz.id, { systems: shown, ids, box: boxOf(meshes) }];
  }));

  let lastW = 0;
  let lastH = 0;

  function render(canvas, quizId, angle) {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    const view = views.get(quizId);
    for (const [system, group] of Object.entries(groups)) {
      group.visible = view.systems.includes(system);
      if (group.visible) group.traverse(o => { if (o.isMesh) o.visible = view.ids.has(o.name); });
    }
    const center = view.box.getCenter(new THREE.Vector3());
    const size = view.box.getSize(new THREE.Vector3());
    pivot.children.forEach(g => g.position.set(-center.x, -center.y, -center.z));
    pivot.rotation.y = angle;

    // Resizing a WebGL canvas reallocates its buffers, so only do it when the card size changes.
    if (w !== lastW || h !== lastH) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      dither.uniforms.resolution.value.set(w * dpr, h * dpr);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      lastW = w;
      lastH = h;
    }
    const radius = Math.max(size.y, size.x / camera.aspect, size.z / camera.aspect) / 2;
    camera.position.set(0, 0, radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12);
    camera.lookAt(0, 0, 0);
    composer.render();

    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    canvas.getContext('2d').drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  // Every card remembers its own angle, which only advances while it spins,
  // so a card that leaves the screen and comes back carries on where it stopped.
  const angles = new WeakMap();
  const angleOf = (canvas, phase = 0) => {
    if (!angles.has(canvas)) angles.set(canvas, START_ANGLE + phase);
    return angles.get(canvas);
  };
  let spinning = [];
  let raf = 0;
  let last = 0;
  let minFrameMs = 0;

  function spin(now) {
    spinning = spinning.filter(c => c.canvas.isConnected);
    if (!spinning.length) { raf = 0; return; }
    raf = requestAnimationFrame(spin);
    const dt = now - last;
    if (dt < minFrameMs) return;
    last = now;
    const step = SPIN_SPEED * Math.min(dt, 100) / 1000;
    for (const c of spinning) {
      const angle = angleOf(c.canvas, c.phase) + step;
      angles.set(c.canvas, angle);
      render(c.canvas, c.quizId, angle);
    }
  }

  return {
    setTheme(dark) {
      dither.uniforms.ink.value.copy(rgb(dark ? 0xf0508c : 0xe6397a));
      dither.uniforms.paper.value.copy(rgb(dark ? 0x141216 : 0xffffff));
    },
    draw(canvas, quizId, phase = 0) {
      render(canvas, quizId, angleOf(canvas, phase));
    },
    // cards: [{ canvas, quizId, phase }]. Cards that stop spinning keep their last frame.
    spin(cards, { fps = 60 } = {}) {
      spinning = cards;
      minFrameMs = 1000 / fps - 2;
      if (!spinning.length) { cancelAnimationFrame(raf); raf = 0; return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(spin); }
    },
    stop() {
      this.spin([]);
    },
  };
}
