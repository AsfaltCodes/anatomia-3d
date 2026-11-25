// Builds assets/models/{system}.glb from the BodyParts3D OBJ files in raw/.
// Each structure in data/structures.json becomes one mesh named by its id,
// made of every OBJ element listed under its BodyParts3D concept names (src).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const RAW = 'raw';
const OBJ_DIRS = [`${RAW}/isa_BP3D_4.0_obj_99`, `${RAW}/partof_BP3D_4.0_obj_99`];
const SYSTEMS = ['bones', 'muscles', 'nerves', 'skin'];
const RATIO = { bones: 0.25, muscles: 0.2, nerves: 0.25, skin: 0.1 };

export function loadConceptIndex() {
  const index = new Map();
  for (const file of ['isa_element_parts.txt', 'partof_element_parts.txt']) {
    for (const line of readFileSync(`${RAW}/${file}`, 'utf8').split('\n').slice(1)) {
      const [, name, element] = line.trim().split('\t');
      if (!element) continue;
      if (!index.has(name)) index.set(name, new Set());
      index.get(name).add(element);
    }
  }
  return index;
}

export function resolveElements(structures, index) {
  const owner = new Map();
  const errors = [];
  const result = new Map();
  for (const s of structures) {
    const elements = new Set();
    for (const name of s.src) {
      if (!index.has(name)) errors.push(`${s.id}: unknown concept "${name}"`);
      else index.get(name).forEach(e => elements.add(e));
    }
    for (const e of elements) {
      if (owner.has(e)) errors.push(`${s.id}: element ${e} already used by ${owner.get(e)}`);
      owner.set(e, s.id);
    }
    result.set(s.id, [...elements]);
  }
  return { result, errors };
}

function objPath(element) {
  for (const dir of OBJ_DIRS) {
    const p = `${dir}/${element}.obj`;
    if (existsSync(p)) return p;
  }
  return null;
}

// BodyParts3D: millimetres, Z up, Y towards the back. glTF: metres, Y up, Z towards the viewer.
function parseObj(text, positions, indices) {
  const base = positions.length / 3;
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/).map(Number);
      positions.push(x / 1000, z / 1000, -y / 1000);
    } else if (line.startsWith('f ')) {
      const ids = line.trim().split(/\s+/).slice(1).map(t => base + parseInt(t, 10) - 1);
      for (let i = 1; i < ids.length - 1; i++) indices.push(ids[0], ids[i], ids[i + 1]);
    }
  }
}

async function main() {
  const structures = JSON.parse(readFileSync('data/structures.json', 'utf8'));
  const { result, errors } = resolveElements(structures, loadConceptIndex());
  const geometry = new Map();
  for (const s of structures) {
    const positions = [];
    const indices = [];
    for (const element of result.get(s.id)) {
      const p = objPath(element);
      if (!p) { errors.push(`${s.id}: missing OBJ ${element}`); continue; }
      parseObj(readFileSync(p, 'utf8'), positions, indices);
    }
    geometry.set(s.id, { positions, indices });
  }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

  let minY = Infinity, sx = 0, sz = 0, n = 0;
  for (const s of structures.filter(s => s.system === 'bones')) {
    const p = geometry.get(s.id).positions;
    for (let i = 0; i < p.length; i += 3) { minY = Math.min(minY, p[i + 1]); sx += p[i]; sz += p[i + 2]; n++; }
  }
  const offset = [sx / n, minY, sz / n];

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  mkdirSync('assets/models', { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  for (const system of SYSTEMS) {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();
    for (const s of structures.filter(s => s.system === system)) {
      const { positions, indices } = geometry.get(s.id);
      for (let i = 0; i < positions.length; i++) positions[i] -= offset[i % 3];
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
      scene.addChild(doc.createNode(s.id).setMesh(doc.createMesh(s.id).addPrimitive(prim)));
    }
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: RATIO[system], error: 0.0005 }),
      reorder({ encoder: MeshoptEncoder }),
      quantize(),
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    await io.write(`assets/models/${system}.glb`, doc);
    console.log(`${system}.glb written`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
