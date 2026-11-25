# Anatomia 3D

An anatomy click quiz in the browser: pick a body region, get a name, and click the part on a rotatable 3D body. It covers bones, muscles and the central nervous system, in Romanian and English.

Full documentation (Romanian): [docs/documentatie.md](docs/documentatie.md)

## Run

It's a static site, but it needs a local server because browsers block loading 3D models from `file://`:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
# or
npx serve .
```

Everything is bundled locally (three.js, fonts, models), so it works offline.

## Deploy to GitHub Pages

1. Push the repository to GitHub (models are about 4 MB in total, well under the limits).
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/`.

All paths are relative and routing uses `#/…`, so no 404 fallback or build step is needed. `.nojekyll` makes Pages serve every file as-is.

## Develop

```bash
npm install
npm test               # game-logic tests
npm run check:data     # structures.json vs. the built models
npm run check:strings  # every UI string exists in RO and EN
npm run build:models   # rebuild assets/models from BodyParts3D OBJs in raw/
```

`build:models` expects the BodyParts3D 4.0 archives (`isa_` and `partof_` OBJ zips plus their `*_element_parts.txt`) unzipped into `raw/`. Download them from <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/>.

## Credits

- Models: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
- [three.js](https://threejs.org) (MIT)
- Font: Inter (SIL OFL)
