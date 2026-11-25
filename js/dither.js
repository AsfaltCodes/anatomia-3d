import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadSystem, addLights, hasWebGL } from './scene.js';

const BLOCK_CSS_PX = 2;
const SPIN_SPEED = 0.15;

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

const DitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    block: { value: 2 },
    bayer: { value: BAYER_8 },
    ink: { value: new THREE.Vector3(0x1a, 0x1a, 0x1a).divideScalar(255) },
    paper: { value: new THREE.Vector3(0xf4, 0xef, 0xe6).divideScalar(255) },
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
      float light = pow(dot(color, vec3(0.299, 0.587, 0.114)), 1.0 / 1.7);
      ivec2 p = ivec2(mod(cell, 8.0));
      float threshold = bayer[p.y * 8 + p.x];
      gl_FragColor = vec4(light > threshold ? paper : ink, 1.0);
    }
  `,
};

export async function createTitle(canvas) {
  if (!hasWebGL()) return { dispose() {} };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  const dpr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20);

  const gltf = await loadSystem('bones');
  const skeleton = gltf.scene.clone();
  const material = new THREE.MeshStandardMaterial({ color: 0xbdb5a8, roughness: 0.75 });
  skeleton.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.computeVertexNormals();
    o.material = material;
  });
  const box = new THREE.Box3().setFromObject(skeleton);
  const center = box.getCenter(new THREE.Vector3());
  const height = box.getSize(new THREE.Vector3()).y;
  skeleton.position.set(-center.x, -center.y, -center.z);
  const pivot = new THREE.Group();
  pivot.add(skeleton);
  scene.add(pivot);
  const distance = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.08;
  camera.position.set(0, height * 0.04, distance);
  camera.lookAt(0, 0, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const dither = new ShaderPass(DitherShader);
  dither.uniforms.block.value = BLOCK_CSS_PX * dpr;
  composer.addPass(dither);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    dither.uniforms.resolution.value.set(w * dpr, h * dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    pivot.rotation.y += SPIN_SPEED * (now - last) / 1000;
    last = now;
    composer.render();
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
