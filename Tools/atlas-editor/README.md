# BTreeTool Atlas Editor

Standalone maintenance tool for editing `node-library/atlas/*.json`.

Open `index.html` in a browser, import:

- `node-library/atlas/nodes.json`
- `node-library/atlas/variables.json`
- `node-library/atlas/manifest.json`

Edit the atlas visually, export the changed JSON files, then replace the files in
`node-library/atlas/`.

The first version is intentionally static and does not write files directly.
