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
  const systems = [...new Set(quizzes.map(q => q.system))];
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
    const ids = new Set(structures.filter(s => s.system === quiz.system && (!quiz.region || s.region === quiz.region)).map(s => s.id));
    const meshes = [];
    groups[quiz.system].traverse(o => { if (o.isMesh && ids.has(o.name)) meshes.push(o); });
    return [quiz.id, { system: quiz.system, ids, box: boxOf(meshes) }];
  }));

  function render(canvas, quizId, angle) {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    const view = views.get(quizId);
    for (const [system, group] of Object.entries(groups)) {
      group.visible = system === view.system;
      if (group.visible) group.traverse(o => { if (o.isMesh) o.visible = view.ids.has(o.name); });
    }
    const center = view.box.getCenter(new THREE.Vector3());
    const size = view.box.getSize(new THREE.Vector3());
    pivot.children.forEach(g => g.position.set(-center.x, -center.y, -center.z));
    pivot.rotation.y = angle;

    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    dither.uniforms.resolution.value.set(w * dpr, h * dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const radius = Math.max(size.y, size.x / camera.aspect, size.z / camera.aspect) / 2;
    camera.position.set(0, 0, radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12);
    camera.lookAt(0, 0, 0);
    composer.render();

    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    canvas.getContext('2d').drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  let spinning = null;
  let raf = 0;
  function spin(now) {
    if (!spinning) return;
    const { canvas, quizId, start } = spinning;
    if (!canvas.isConnected) { spinning = null; return; }
    render(canvas, quizId, START_ANGLE + SPIN_SPEED * (now - start) / 1000);
    raf = requestAnimationFrame(spin);
  }

  return {
    draw(canvas, quizId) {
      render(canvas, quizId, START_ANGLE);
    },
    spin(canvas, quizId) {
      cancelAnimationFrame(raf);
      spinning = { canvas, quizId, start: performance.now() };
      raf = requestAnimationFrame(spin);
    },
    stop() {
      if (!spinning) return;
      const { canvas, quizId } = spinning;
      spinning = null;
      cancelAnimationFrame(raf);
      if (canvas.isConnected) render(canvas, quizId, START_ANGLE);
    },
  };
}
