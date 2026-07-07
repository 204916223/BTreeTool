# BTreeTool Atlas Editor

Standalone maintenance tool for editing `node-library/atlas/*.json`.

## Electron app

From the repository root:

```sh
npm run atlas:editor
```

The Electron app loads these files automatically and saves changes directly:

- `node-library/atlas/nodes.json`
- `node-library/atlas/variables.json`

Use `保存当前` to write the active section, or `保存全部` to write both atlas files.

## Browser fallback

Open `index.html` in a browser, import:

- `node-library/atlas/nodes.json`
- `node-library/atlas/variables.json`

Edit the atlas visually, export the changed JSON files, then replace the files in
`node-library/atlas/`.

Browser mode is intentionally static and does not write files directly.
