# Escape Crystal Content Editor

A GitHub Pages workspace for discovering OSRS bosses and dungeons, reviewing map coverage, and preparing Escape Crystal Notify contributions. This is a separate utility repository targeting `Xylot/escape-crystal-notify`.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm install
npm run dev
```

The included package-lock.json supports reproducible installs with npm ci.

```sh
npm run test:core  # dependency-free scanner, coordinates, proposal tests
npm run test:bosses # every boss in the checked-in Java snapshot
npm test           # also tests actual WikiParser extraction
npm run refresh    # live plugin + wiki snapshot; requires network
npm run build     # typecheck + production bundle
npm run preview
```

To check a current plugin checkout without refreshing wiki data:

```sh
npm run test:bosses -- "../escape-crystal-notify/src/main/java/com/escapecrystalnotify/EscapeCrystalNotifyRegion.java"
```

The boss round-trip suite uses the same loading, section editing, saved-draft serialization, preview, validation, and export functions as the UI. It checks every `BOSSES` entry, including paired entrances, special constructors, and entries excluded from discovery. Unchanged drafts and restored edits must reproduce the original Java, except for explicitly confirmed source coverage corrections. The audit reports Bryophyta’s missing region `12698` and Maggot King’s missing region `10618` as `SOURCE COVERAGE DISCREPANCY`; it requires those generated additions and their PR differences, rather than suppressing correct entrance-derived coverage. All other differences fail, including in batch exports. Once those source entries are corrected, exact matching applies again. It also checks name, entrance priority, and danger edits. This is an offline model integration test, not a browser interaction or visual-layout test, and does not claim that a blank form can recreate special settings the UI preserves from source. Failures identify the boss and operation. It runs with `npm test`, and CI reruns it against newly refreshed source before publishing. Pass an explicit Java path (or set `PLUGIN_REGION_SOURCE`) to test newer local code; a missing file fails rather than falling back to the snapshot.

`test:bosses` saves the latest detailed results to `work/boss-roundtrip.log` and JUnit results to `work/boss-roundtrip.xml`, including expected/actual assertion differences on failure. It returns a failing exit code for mismatches and continues testing the other bosses. Constructors that cannot be fully authored by the UI are explicitly listed as `PRESERVED ONLY`, with their source arguments; passing their imported round trip does not count as fresh-authoring support. The [initial audit](docs/boss-roundtrip-audit.md) records the concrete mismatches and distinguishes confirmed source mistakes from helper regressions.

The snapshot contains the wiki Boss catalog and 190 entries from the wiki List of dungeons. Support is recalculated on sync. Shellbane includes enriched entrance and arena maps; load other locations on demand. Missing tiles leave a usable coordinate grid.

The light interface uses wiki boss portraits in the library and editor. Portraits come from the primary monster/NPC infobox, with file attribution in Sources. Image metadata is cached separately from drafts for seven days; four lookups run at most concurrently, and unavailable images fall back to category icons. Existing cached portraits remain available if a refresh fails. Location selectors include region IDs alongside coordinates.

Entrance object thumbnails use MOID's first orientation. Missing images show an explicit fallback and do not block editing. The Entrance reference image selector accepts an object ID, a bounded range, or a MOID object-page URL. Contributors can select a different object's image, return to the entrance IDs, or hide the reference. This preference is saved separately in local evidence context, appears in authoring and review, and never changes exported object IDs. For example, object 58439 has no MOID image, while 58440 provides a cave entrance reference.

Generated entrance code uses RuneLite gameval constants for known numeric IDs: for example, `32534` becomes `ObjectID.GB_MOSS_DOOR_IN`. Numeric selections remain unchanged in the editor. The shared generator uses the checked-in, pinned `src/core/gameval-ids.mjs` table for identical offline previews, patches, PRs, and installed maintainer workflows. Constants declared in package-private `ObjectID1` are referenced through public `ObjectID`; NPCs use `NpcID`. Unmapped IDs remain numeric. Refresh the table with `npm run refresh:gameval` (or pass a full RuneLite commit SHA), review the generated diff, and update the frontend, Worker, and installed maintainer validator together.

## Contribution flow

The authoring steps are **Setup → Arena → Entrance area → Entrance object → Review & export**. Setup asks one question at a time: **Death behavior → Entrance priority → Recommended inactivity time → Confirm pet**. Selecting a death or entrance answer advances immediately. The inactivity control defaults to 2 seconds and accepts whole seconds, with increment/decrement buttons and quick values; Continue (or Enter) confirms the answer. Pet lookup starts in the background, and the final question shows the matched pet and its inventory item ID. **Change pet ID** opens an optional override. Confirming the pet saves the suggested item ID and continues to Arena; background lookup alone does not create a draft. The current Setup question is saved with the local draft; Back and the question navigation let you revisit earlier answers. Entrance area asks one question at a time: **Is the entrance area dangerous? → Does the boss fight take place in an instance? → Are any of these the entrance?** Yes/No answers advance immediately, and the current question is saved with the local draft. The final question offers entrance suggestions and manual map, region/plane selection, and chunk restrictions. Entrance object provides a dedicated visual candidate browser alongside detection IDs, interaction settings, and the independently chosen MOID reference image. Review provides separate shortcuts back to the area and object steps. Arena-only exports and preservation of existing plugin entrances remain available.

Existing plugin encounters open in an **Encounter overview** with Details, Coverage, and Entrance sections (dungeons omit Entrance). Every overview section is collapsible, including the contribution panel. Coverage and Entrance display terrain map squares with highlighted chunk restrictions; their preview-plane selectors never change the draft. Choose **Edit**, adjust the populated settings, then **Apply changes** to save one local draft revision or **Cancel** to leave the section unchanged. Applied edits show **Original → Your changes** comparisons and support Undo/Redo. **Review changes** opens the existing proposal, patch, and PR export actions. Navigating away from unapplied edits offers Apply, Discard, or Keep editing. Opening a section never creates a draft; restoring all settings to the original removes it. Entrance reference preferences are saved separately. Special or quest-gated Java settings remain preserved and unsupported controls explain when a source edit is needed. New encounters and their unfinished drafts retain guided creation.

Choose **Start from scratch** in an existing encounter’s overview to use the guided new-encounter flow with fresh defaults and empty coverage and entrance selections. Existing plugin settings and saved map/image selections do not prefill this flow; wiki suggestions remain available. The draft keeps the original encounter ID and source baselines, so review, downloads, and PRs still update the existing encounter with the usual before/after comparison and conflict checks. Skipping entrance replacement preserves its source configuration under the existing export rules. Fresh drafts reopen in the guided flow, and Undo restores the draft and reference selections from before starting over.

1. Sync the plugin and select a boss, or import a wiki title/URL. If CORS blocks requests, paste the page's wikitext in the import dialog.
2. Inspect wiki locations and linked caves; outside entrance pins are distinct from arena candidates. Select 64×64 regions, inspect 8×8 chunk IDs, and choose a death classification.
3. Optionally configure an entrance using numeric IDs or `ObjectID.*`/`NpcID.*` constants. A replacement intentionally replaces the whole existing entrance constructor; inspect preserved arguments first. Advanced boolean variants are not synthesized.
4. Review in-game template coordinates, region overlaps, death behavior, and entrance variants.
5. Download a patch or JSON proposal, or copy the proposal into the plugin's manually triggered workflow.

When the optional backend is configured, single and batch reviews can prepare a GitHub PR with map screenshots and wiki links. Only the final Create pull request action writes branches, commits, and the PR. Downloads remain available without a backend. See [backend setup](docs/pr-backend-setup.md). Existing source arguments are retained from the trusted current plugin source. Proposal text is parsed as data, never evaluated.

PRs that edit existing encounters list additions and removals, then show collapsible **Before** and **After** states. Each state includes its full settings, coverage and entrance screenshots, available model references, and wiki sources. These states are frozen from the original and generated Java entries, so unchanged chunk restrictions remain visible. New encounters retain the addition layout, including in mixed batches. Deploy the updated frontend and PR Worker together to enable this format; existing prepared submissions retain their original evidence contract. Before and after screenshots both count toward the 32-image submission limit.

## Dungeons

Choose **Dungeons** in Collections, or select Dungeon when importing a wiki page. Dungeon authoring has only **Coverage → Review & export**: select regions and optionally restrict them to chunks. New dungeons default to Unsafe; existing entries retain their death classification. There are no entrance settings or model references. Dungeon entries export using DUNGEON_ identifiers and the plugin's DUNGEONS category, including in mixed boss/dungeon PRs.

Library cards use the location infobox's wiki map when available, with a full map reference in the coverage inspector. When no static map image is available, the library renders the wiki page's interactive map preview using its exact tile URLs, layer, plane, and framing. The map reference opens the source wiki page. Scenic infobox images are not substituted for missing maps. Map images have a separate seven-day cache and wiki attribution. Existing plugin regions are preserved; new coverage requires explicit selection because wiki coordinates may identify the outside entrance. Dungeons stay in their own collection rather than the default boss landing page.

Deploy the updated Worker alongside the frontend to enable dungeon PR submissions. Downloads use the local validator and remain available independently. If using the optional maintainer workflow, reinstall its bundled validator with the installation command below.

## GitHub Pages

Create a separate repository on branch `main`, push this directory's contents, and choose **GitHub Actions** as the Pages source. The supplied workflow tests, refreshes data daily at 09:23 UTC, builds, and deploys. Relative asset paths support project Pages URLs.

The utility's Actions workflow needs permission to write its snapshot to `main`. If branch protection blocks this, adjust the snapshot storage policy before enabling scheduled updates. A failed refresh retains the checked-in snapshot and its timestamp. No website credentials are required.

## Install PR workflow in the plugin

From this utility directory, run against your local plugin checkout:

```sh
node scripts/install-plugin-workflow.mjs /path/to/escape-crystal-notify
```

Review and commit the installed `.github/content-editor/` validator and `.github/workflows/content-proposal.yml` in the plugin. Enable **Allow GitHub Actions to create and approve pull requests** in repository Actions settings. The workflow targets `master`, matching the source URL in the supplied reference. It runs Java 11 and `./gradlew build`; verify these against the plugin's build configuration before enabling it.

Run **Create content proposal PR** manually with the copied JSON. Only structured boss and dungeon edits are accepted. An unrelated upstream change is allowed after revalidation; changes to an edited entry require review. The workflow generates the diff, runs the plugin build, and opens a PR. `GITHUB_TOKEN` PRs do not generally trigger follow-on workflows; branch protection may require additional maintainer checks.

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

Entrance selections are saved as export data; optional chunks restrict an entrance once configured. A unique boss-specific cave/lair or explicit arena location preselects arena coverage for a new draft. Broad or ambiguous locations stay unselected. Saved drafts and existing plugin regions are preserved. New drafts default to Unsafe death; existing classifications are preserved. Export validates the configuration without requiring verification checkboxes. The editor keeps arena and entrance selections separate. Entrance authoring asks whether the entrance area is dangerous. Dangerous entrances use combined coverage where the restrictions are compatible. Non-dangerous entrances generate a separate entrance entry with `notifyRegion = false`, preserving entrance detection without region notifications. Chunk restrictions are optional. Object-detection chunks and notification chunks are independent; when coverage chunks are selected, every detection chunk must be inside that coverage. Both entries retain the boss death classification. Missing locations and conflicting selections block export with an actionable message.

Encounter setup selects death classification and entrance priority, with examples from the plugin README. PRs use encounter-specific conventional titles (for example, `feat(boss): add Shellbane gryphon`) and include available first-orientation MOID images for the selected objects and their known transform variants. Visual references stay separate from detection IDs and exported Java.


### Entrance coverage export updates

Deploy the updated frontend and Worker together. Re-run `node scripts/install-plugin-workflow.mjs /path/to/plugin` for repositories using the maintainer workflow so JSON proposals use the same coverage generator and validator as the editor. Existing drafts without an entrance region or entrance chunks must select an entrance area before exporting new or replacement entrance detection. Arena-only changes and preserved entrance definitions remain supported; region/chunk restrictions are validated against the resulting coverage.

### Entrance danger and paired encounters

Entrance area asks **Is the entrance area dangerous?** Choose Yes for normal area notifications, or No to disable region notifications while retaining entrance detection and highlighting. No generates `false` after the entrance constructor and does not change the boss death classification to SAFE. Use the map to choose optional entrance coverage chunks. When the entrance shares the arena area, a list shows nearby entrance suggestions with map previews and object images on the selected plane. Objects in the same chunk and plane share one preview, retaining every object ID and location marker. Each preview highlights its notification chunks. After answering the danger question, Use entrances & review selects every listed object and its detection chunks and opens review. Edit area opens the map for adjustments; suggestions do not replace a saved selection automatically. Selecting an entrance object automatically adds its location chunk to object detection and, when restricted, notification coverage. Multiple placements and transformed variants retain their selected chunks; removing an ID removes its automatic detection chunks. Name, wiki, and manual IDs resolve placements within the selected area when available; otherwise their detection uses the selected notification coverage. The notification selection can include more chunks than object detection, as in the existing Zulrah entries. New entrance configuration requires an answer; existing drafts retain their previous behavior until edited.

Matching boss and `_ENTRANCE` entries appear as one encounter. Existing pairs retain their separate entries, including when changing the danger answer. The danger answer is loaded from the region notification flag; chunk restrictions alone do not imply a non-dangerous entrance. Selecting Yes preserves notification chunks until whole-area coverage is explicitly chosen. Legacy drafts saved against an individual entrance stay accessible separately until exported or discarded. Overlapping arena/entrance regions with incompatible restrictions require manual Java review; do not remove real arena coverage merely to satisfy validation.

Preview, downloads, and PR preparation use the same generator. Proposals use version 4 for instanced-boss support; the updated validator still accepts versions 1–3 with their previous behavior. Conflicts in either paired entry reject the entire change. PR evidence labels arena coverage, entrance notification coverage, and object detection independently. Previously prepared submissions retain their frozen evidence and description.

Deploy the frontend and Worker together. The frontend checks the Worker’s advertised proposal version and disables PR creation against older backends; downloads remain available. Re-run `node scripts/install-plugin-workflow.mjs /path/to/plugin` and commit the refreshed validator for the maintainer workflow. Instanced-boss exports require plugin commit `fe017f4641ff6f22946056e01d53c4795730e1d4` or a later revision with instance-aware notification support.

### Instanced bosses with a shared entrance region

For encounters such as Brutus, select the shared region as arena coverage. In **Entrance area**, answer **No** to “Is the entrance area dangerous?” and **Yes** to “Does the boss fight take place in an instance?” Select the entrance region and configure the object or NPC used to initiate the fight. The helper generates a single notifying region entry whose entrance constructor ends in `.withInstancedBoss()`. Region notifications activate only inside the instance; entrance detection remains available on the ordinary approach. The flag is preserved when editing supported entries and included in review, proposal downloads, PR descriptions, and map-evidence labels.

Entrance regions must be included in the selected arena regions for this mode. Whole-region arena coverage works with unrestricted or chunk-limited entrance detection. If the arena has chunk restrictions, they must include the approach and detection chunks because the plugin uses the same region chunk filter inside and outside the instance. Existing paired entries still require manual review to merge; ordinary non-instanced encounters retain their current split-entry behavior. Exports against older plugin source are blocked with a request to sync.

### Recommended inactivity time and pet icons

Bosses and raids have an Escape Crystal recommendation in Setup and in the existing encounter’s Details editor. Enter a whole number of seconds (at least 2, matching the plugin). Empty pet-icon fields are filled automatically when the OSRS Wiki’s boss-pet table identifies one pet and its item infobox identifies one inventory item ID. Follower NPC IDs are never used. The lookup follows the matched pet page, handles redirects and named variants, and shows a wiki source link. Missing pets, ambiguous variants, or unavailable wiki data leave a manual choice. Lookups share a one-hour in-memory cache; failed requests can be retried with **Find pet automatically**.

Existing icons are preserved, including representative items for encounters without pets; starting an existing encounter from scratch reuses its plugin icon. You can override any icon with a RuneLite `ItemID` constant or a positive numeric item ID. A lookup finishing after a manual edit never replaces that edit. Item constants are syntax-checked; plugin compilation verifies that named constants exist. New and fresh setups require an inactivity time and a resolved or manually chosen icon. Dungeons do not have these fields.

Plugin sync reads `EscapeCrystalNotifyRegion.java`, `EscapeCrystalNotifyThresholdDefaults.java`, and `EscapeCrystalNotifyEncounters.java` at the same commit. Proposal downloads, patches, the maintainer workflow, and PR creation update the affected files together. The time updates `seconds(...)` in ThresholdDefaults; the icon updates `icon(...)` in Encounters, following commit `08c82862f9c65dd476a542f4cadb78147c48be7a`. Shared entries use the plugin’s canonical encounter (for example, Osmumten’s Burial Chamber uses Tombs of Amascut). Conflicting answers for the same canonical encounter are rejected. Explicit threshold aliases remain consistent, and unrelated switch cases and constructors are preserved.

Metadata-only edits can create a PR even when region coverage is unchanged. The review and PR description show the old and new time and icon. Metadata baselines detect upstream changes before writing any source files; older saved drafts without these fields continue to preserve existing plugin metadata. If a saved snapshot predates this feature, use **Sync plugin** to enable the new fields. Deploy the version 4 Worker with this frontend and reinstall the maintainer workflow to enable all three-file export paths.
