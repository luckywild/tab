# wildtab (Starfish plugin)

Source lives in `src/`.

- `src/wildtab.js` is the Starfish plugin entrypoint (CommonJS)
- `src/wildtab/` is the rest of the plugin

## Build (zip for users)

```bash
bun install
bun run build
```

Produces `dist/wildtab.zip` containing `wildtab.js` and `wildtab/` at the zip root.

## Dev sync (watch + copy into Starfish)

```bash
bun run dev -- --starfish ~/starfish
```

Or:

```bash
STARFISH_DIR=~/starfish bun run dev
```

This watches `src/**` and syncs into:

- `~/starfish/plugins/wildtab.js`
- `~/starfish/plugins/wildtab/**`

## Checks

```bash
bun run check
bun run lint
```

## Release

To publish a new plugin zip to GitHub Releases:

```bash
# pick a version
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions will build `dist/wildtab.zip` and attach it to the release.
