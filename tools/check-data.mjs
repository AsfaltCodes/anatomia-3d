// Checks data/structures.json against the built models in assets/models/.
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const SYSTEMS = ['bones', 'muscles', 'nerves', 'skin'];
const structures = JSON.parse(readFileSync('data/structures.json', 'utf8'));
const errors = [];

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const nodes = {};
for (const system of SYSTEMS) {
  const doc = await io.read(`assets/models/${system}.glb`);
  nodes[system] = new Set(doc.getRoot().listNodes().map(n => n.getName()));
}

const seen = new Set();
for (const s of structures) {
  if (seen.has(s.id)) errors.push(`${s.id}: duplicate id`);
  seen.add(s.id);
  if (!SYSTEMS.includes(s.system)) errors.push(`${s.id}: unknown system ${s.system}`);
  if (![1, 2, 3].includes(s.tier)) errors.push(`${s.id}: bad tier ${s.tier}`);
  for (const field of ['name', 'desc']) for (const lang of ['ro', 'en'])
    if (!s[field]?.[lang]?.trim()) errors.push(`${s.id}: missing ${field}.${lang}`);
  if (!nodes[s.system]?.has(s.id)) errors.push(`${s.id}: no mesh in ${s.system}.glb`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK ${structures.length} structures`);
