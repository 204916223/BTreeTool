# BTreeTool Atlas Editor

The only supported write entry for the official files in `node-library/atlas/`.
Runtime BTreeTool code and TNM generation scripts treat these files as read-only.

## Electron app

From the repository root:

```sh
npm run atlas:editor
```

The Electron app loads these files automatically and saves changes directly:

- `node-library/atlas/nodes.json`
- `node-library/atlas/variables.json`
- `node-library/atlas/meta.json`

Unsaved edits are cached locally as they are typed and restored after an editor
restart when the atlas files on disk still match the draft's original baseline.
Saving successfully, or explicitly reloading the disk files and discarding edits,
clears the cached draft.

Use `保存当前` to write the active section, or `保存全部` to write both atlas files.

Before saving, the editor validates node IDs, categories, parameter roles, and the
atlas schema. Errors block writes. It also detects files
changed on disk after loading and protects unsaved edits when closing the window.

The editor intentionally performs no parameter-name or variable-based inference.
Parameter defaults, roles, types, required flags, and descriptions are always edited
explicitly and are never locked by variable references. Variable entries expose one
explicit `default` value; legacy `commonNodes` and `examples` fields are no longer
written. Legacy `usageFlows` data is preserved as opaque data but is no longer edited
by this basic maintenance UI.

New variables start with a two-line description template for their configuration
source, configuration item, and usage. Its variable key stays synchronized until the
description is edited manually.

## Importing an async candidate

`Tools/buildtnm.sh` only generates a versioned TreeNodesModel candidate. It never
updates the official atlas. Use `导入 TNM 候选` in this editor to review additions,
contract changes, and removals. Changes are applied to the in-memory atlas only after
selection; removed nodes and ports are deliberately unselected by default.

## Browser fallback

Open `index.html` in a browser, import:

- `node-library/atlas/nodes.json`
- `node-library/atlas/variables.json`

Edit the atlas visually, export the changed JSON files, then replace the files in
`node-library/atlas/`.

Browser mode is intentionally static and does not write files directly. Electron mode
is the supported maintenance path for the official atlas.
