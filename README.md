# Escape Crystal Content Editor

A GitHub Pages workspace for discovering OSRS bosses, reviewing map coverage, and preparing Escape Crystal Notify contributions. This is a separate utility repository targeting `Xylot/escape-crystal-notify`.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm install
npm run dev
```

The included package-lock.json supports reproducible installs with npm ci.

```sh
npm run test:core  # dependency-free scanner, coordinates, proposal tests
npm test           # also tests actual WikiParser extraction
npm run refresh    # live plugin + wiki snapshot; requires network
npm run build     # typecheck + production bundle
npm run preview
```

The snapshot contains 188 bosses from the wiki Boss page, with 109 unsupported by the captured plugin source. Support is recalculated on sync. Shellbane includes enriched entrance and arena maps; load other locations on demand. Missing tiles leave a usable coordinate grid.

The light interface uses wiki boss portraits in the library and editor. Portraits come from the primary monster/NPC infobox, with file attribution in Sources. Image metadata is cached separately from drafts for seven days; four lookups run at most concurrently, and unavailable images fall back to category icons. Existing cached portraits remain available if a refresh fails. Location selectors include region IDs alongside coordinates.

Entrance object thumbnails use MOID's first orientation. Missing images show an explicit fallback and do not block editing. The Entrance reference image selector accepts an object ID, a bounded range, or a MOID object-page URL. Contributors can select a different object's image, return to the entrance IDs, or hide the reference. This preference is saved separately in local evidence context, appears in authoring and review, and never changes exported object IDs. For example, object 58439 has no MOID image, while 58440 provides a cave entrance reference.

## Contribution flow

The authoring steps are **Arena → Entrance area → Entrance object → Review & export**. Entrance area contains the map, region/plane selection, and chunk restrictions. Entrance object provides a dedicated visual candidate browser alongside detection IDs, interaction settings, and the independently chosen MOID reference image. Review provides separate shortcuts back to the area and object steps. Arena-only exports and preservation of existing plugin entrances remain available.

1. Sync the plugin and select a boss, or import a wiki title/URL. If CORS blocks requests, paste the page's wikitext in the import dialog.
2. Inspect wiki locations and linked caves; outside entrance pins are distinct from arena candidates. Select 64×64 regions, inspect 8×8 chunk IDs, and choose a death classification.
3. Optionally configure an entrance using numeric IDs or `ObjectID.*`/`NpcID.*` constants. A replacement intentionally replaces the whole existing entrance constructor; inspect preserved arguments first. Advanced boolean variants are not synthesized.
4. Review in-game template coordinates, region overlaps, death behavior, and entrance variants.
5. Download a patch or JSON proposal, or copy the proposal into the plugin's manually triggered workflow.

When the optional backend is configured, single and batch reviews can prepare a GitHub PR with map screenshots and wiki links. Only the final Create pull request action writes branches, commits, and the PR. Downloads remain available without a backend. See [backend setup](docs/pr-backend-setup.md). Existing source arguments are retained from the trusted current plugin source. Proposal text is parsed as data, never evaluated.

## GitHub Pages

Create a separate repository on branch `main`, push this directory's contents, and choose **GitHub Actions** as the Pages source. The supplied workflow tests, refreshes data daily at 09:23 UTC, builds, and deploys. Relative asset paths support project Pages URLs.

The utility's Actions workflow needs permission to write its snapshot to `main`. If branch protection blocks this, adjust the snapshot storage policy before enabling scheduled updates. A failed refresh retains the checked-in snapshot and its timestamp. No website credentials are required.

## Install PR workflow in the plugin

From this utility directory, run against your local plugin checkout:

```sh
node scripts/install-plugin-workflow.mjs /path/to/escape-crystal-notify
```

Review and commit the installed `.github/content-editor/` validator and `.github/workflows/content-proposal.yml` in the plugin. Enable **Allow GitHub Actions to create and approve pull requests** in repository Actions settings. The workflow targets `master`, matching the source URL in the supplied reference. It runs Java 11 and `./gradlew build`; verify these against the plugin's build configuration before enabling it.

Run **Create content proposal PR** manually with the copied JSON. Only structured boss edits are accepted. An unrelated upstream change is allowed after revalidation; changes to an edited entry require review. The workflow generates the diff, runs the plugin build, and opens a PR. `GITHUB_TOKEN` PRs do not generally trigger follow-on workflows; branch protection may require additional maintainer checks.

## Architecture

- `src/core/wiki.mjs`: OSRS interpretation of WikiParser AST templates. Used by browser imports and Node refresh. No regex wikitext parser fallback.
- `src/core/java.mjs`: narrow balanced Java scanner with exact original entry spans; unsupported expressions fail closed.
- `src/core/proposal.mjs`: validation, conflict checking, source-preserving patch generation. Same code installed in the plugin workflow.
- React/Leaflet editor: selectable regions, coordinate inspection, source evidence, entrance overrides, undo/redo, local drafts, and export review.

Wiki refresh parses tables and quest/event lists on the Boss page using WikiParser. Explicit group membership handles shared entries and raids. Imports follow at most four linked location pages. parse5 extracts rendered map metadata from the same revision: exact markers, icons, layers, planes, and tile versions. Entrance and arena maps appear together with independent controls.

## Important validation boundaries

- **Instance handling:** arena coordinates still need comparison with the plugin's actual instance-to-template conversion. This environment could not retrieve that implementation. Do not regard a reviewed wiki pin as in-game verification.
- **Chunk encoding:** the editor uses `(x >> 3) << 11 | (y >> 3)` with plane kept separate. Confirm this against the plugin's chunk utility before relying on chunk restrictions.
- **WikiParser integration:** 36 tests, TypeScript checks, production bundling, and desktop/mobile browser checks passed.
- **Map imagery:** wiki rendered tiles include terrain icons when available. Exact pin anchors remain separate from viewport centers. A labeled Explv fallback is used when wiki tile metadata is absent.
- **Entrance discovery:** on-demand wiki search inspects object/NPC infoboxes in the first five results and offers IDs with source revisions. RuneLite gameval search reads ObjectID, ObjectID1, and NpcID at a pinned commit, ranks entrance-like names, and offers numeric IDs with exact source links. Shellbane matches include 57908 and 57915; confirm variants in game.
- **Access and storage:** browser drafts stay on the current origin/device. Download proposals for portability. No account sync is included.

## Third-party notices

WikiParser-Node is GPL-3.0 licensed. Its bundle and license are copied from the installed package into the build; review and satisfy the applicable distribution/source obligations before publishing. This project does not impose a license on the user's existing plugin.

Wiki content and coordinate evidence originate from the [OSRS Wiki](https://oldschool.runescape.wiki/), with source links retained. Review its current reuse terms and provide attribution when distributing snapshots. Primary map tiles are from OSRS Wiki; fallback tiles are from [Explv/osrs_map_tiles](https://github.com/Explv/osrs_map_tiles); game imagery belongs to Jagex. React and Leaflet retain their upstream licenses in installed dependencies.



The light-theme encounter editor prioritizes authoring: arena coverage, optional entrance detection, then review and export. The current step shows one focused map, while coverage and entrance review status remain independent. Discover shows bosses needing coverage, with quest bosses hidden by default. Search, filter by category, sort by name or available locations, and switch between card and list views. My drafts includes saved quest encounters even when the quest filter is off. Select an encounter to open the guided editor; missing wiki locations load automatically. Nearby entrance objects load when entering the entrance step, with filters, selected-ID chips, and collapsible variants. Export an individual encounter from its review step, or select ready drafts in Review changes. Unfinished drafts do not block exports of other encounters. The contributor guide and source tools are also available from the mobile Workspace tools menu.


## Placed entrance objects

The Entrance tab can query Xylot/osrs-world-map-object-dumper by region and plane, rank entrance-like objects by distance from a wiki entrance, and show base IDs, morph forms, actions, and varbit/varp selectors. Data files are loaded on demand from one pinned repository commit and cached for the session. Exact numeric IDs can be cross-referenced with gameval names. NPC spawn positions are excluded because they are stale. Missing named objects are not proof of absence. Confirm plugin base-versus-transformed ID matching in game.

Shellbane's wiki tile matches placed ID 58439 (TT_LAIR_ENTRANCE), with forms 58440 (blocked) and 58441 (clear), in the inspected dump. This is stronger location evidence than the earlier 57908/57915 name-only matches.


## Map interaction and defaults

The editor prioritizes the entrance and arena maps, with one scrolling inspector. Raster imagery is retained through zooming and selection updates. An OffscreenCanvas worker paints grid tiles; browsers without it use the same canvas renderer on the main thread. Leaflet handles pan/zoom and DOM imagery on the main thread. Grid selection uses world-coordinate hit testing rather than thousands of interactive shapes.

Known entrance regions are selected as lookup context; optional chunks restrict an entrance once configured. A unique boss-specific cave/lair or explicit arena location preselects arena coverage for a new draft. Broad or ambiguous locations stay unselected. Saved drafts and existing plugin regions are preserved. New drafts default to Unsafe death; existing classifications are preserved. Export validates the configuration without requiring verification checkboxes. Entrance region context is not added to arena coverage or synthesized into an unsupported Java constructor argument.
