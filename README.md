# Stashangle

[![CI](https://github.com/LetUsNot/stashangle/actions/workflows/ci.yml/badge.svg)](https://github.com/LetUsNot/stashangle/actions/workflows/ci.yml)

A [Stash](https://github.com/stashapp/stash) plugin that rotates and scales the video player while a scene marker is active.

Useful when a clip was filmed sideways (or you just want a segment flipped) without re-encoding anything. Pick a transform on the marker, and playback adjusts for that marker's time range.

## What it does

When you edit a scene marker, you get a **Transform** dropdown:

- **None** — normal playback
- **Rotate Left and Scale** — 90° counter-clockwise, scaled to fit
- **Rotate Right and Scale** — 90° clockwise, scaled to fit

The transform kicks in when playback enters the marker range and drops off when you leave it. Point markers (no end time) keep the transform until the next marker or the end of the scene.

Transforms also recompute when you go fullscreen so the scale stays correct for the new player size.

## Install

You need Stash with plugin support, **Python 3.8+** on the machine running Stash, and a built copy of this plugin.

```bash
git clone https://github.com/LetUsNot/stashangle.git
cd stashangle
npm install
npm run build
```

Copy the whole plugin folder into your Stash plugins directory:

| OS | Default path |
|---|---|
| Linux / macOS | `~/.stash/plugins/Stashangle` |
| Windows | `%USERPROFILE%\.stash\plugins\Stashangle` |

On Windows you can skip the manual copy step:

```bash
npm run deploy
```

The manifest file must be named `Stashangle.yml`. Reload plugins under **Settings → Plugins** in Stash.

## Where settings are stored

Stashangle does not touch Stash's database or marker schema. Transform choices live in two JSON files next to the plugin:

- `marker-transforms.json` — which transform each marker uses
- `pending-create.json` — short-lived state while a new marker is being saved

Back those up with the rest of your plugin folder if you care about keeping them.

Stash's embedded JS runtime can't write files, so persistence goes through a small Python task (`tasks/stashangle_storage.py`) invoked as an external `raw` task. That's why Python is required even though the UI is TypeScript.

## Development

```bash
npm install
npm test
npm run build
```

Tests use Vitest with jsdom. Optional: keep a local Stash checkout at `reference/stash/` for digging into upstream UI code — it's gitignored and not shipped with the plugin.

## Known quirks

- Marker badges on the timeline are not in yet (planned for a future release).
- No manual "pause transforms" toggle in the filter panel yet — also planned.
- If you see a claim-timeout toast after creating a marker, open the marker editor again and hit save.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
