# Boss Java round-trip audit — 2026-09-09

Input: the local plugin's `src/main/java/com/escapecrystalnotify/EscapeCrystalNotifyRegion.java`.
Source SHA-256: `17016695f9eda201a9585ce411c282313972426feca32fe7eccc642677b97b74`.
Coverage: 66 Java boss entries, grouped into 56 library encounters with 10 paired entrances.

## Initial mismatches

These were measured against helper commit `333cb9f`. Each differed when loading an imported draft and generating the preview, before any user changes. The maintainer subsequently confirmed that Bryophyta and Maggot King were wrong in the source: their generated coverage was correct. Those two cases are expected source corrections, not helper regressions.

| Java entry | Current Java | Generated Java in initial audit | Difference |
| --- | --- | --- | --- |
| `BOSS_BRYOPHYTA` | Regions: `12955` | Regions: `12698, 12955` | **Confirmed source discrepancy:** region `12698` is missing from source; the helper correctly infers it from entrance chunk `812245`. |
| `BOSS_MAGGOT_KING` | Regions: `11645` | Regions: `10618, 11645` | **Confirmed source discrepancy:** region `10618` is missing from source; the helper correctly infers it from entrance chunks `685012, 685013, 687060, 687061`. |
| `BOSS_ABYSSAL_SIRE` | Regions: `11851, 11850, 12106, 12363, 12362` | Regions: `11850, 11851, 12106, 12362, 12363` | Region order changed; same covered region set. |
| `BOSS_DERANGED_ARCHAEOLOGIST` | Regions: `14650, 14649` | Regions: `14649, 14650` | Region order changed; same covered region set. |
| `BOSS_GIANT_MOLE` | Regions: `6993, 6992` | Regions: `6992, 6993` | Region order changed; same covered region set. |
| `BOSS_WINTERTODT_ENTRANCE` | Outer chunks: `416238, 416239, 418287, 418287` | Outer chunks: `416238, 416239, 418287` | Duplicate removed; same covered chunk set. |
| `BOSS_ZULRAH_ENTRANCE` | Constructor ends `567678),8751)` | Constructor ends `567678), 8751)` | Whitespace only. |

The audit distinguishes confirmed source corrections from unexpected generated differences. The other five initial mismatches changed source text while preserving the same region/chunk sets. The suite is not an in-game behavior test.

## Current imported-edit result

All 56 encounters pass the expected-output checks, with two explicitly reported source coverage discrepancies. Bryophyta generates regions `12698, 12955`; Maggot King generates `10618, 11645`. Entrance-derived coverage is enabled even for imported drafts and metadata edits. The earlier suppression of that inference has been removed. The plugin source itself has not been edited.

The tests permit only the two maintainer-confirmed corrections, matched to their original region lists and checked against the entrance chunks. They still verify exact entrance arguments and all other fields, and require PR previews to show the added regions. Unexpected differences fail. When the source is corrected, those discrepancies disappear from the report and exact source matching applies again. Region order, duplicate chunks, and whitespace are still preserved when coverage and settings are unchanged.

## UI limitations still present

These four entrance constructors pass **preservation** tests, but cannot be fully authored through the current form. The booleans below are inside `EscapeCrystalNotifyRegionEntrance`; they are separate from the outer `notifyRegion` flag handled by the danger question.

| Java entry | Source settings outside the editable form |
| --- | --- |
| `BOSS_DOOM_OF_MOKHAIOTL` | `escapeCrystalDisabled = false`, `logoutBugPossible = true` |
| `BOSS_MYSTERIOUS_FIGURE` | `escapeCrystalDisabled = true` |
| `BOSS_THE_LEVIATHAN_ENTRANCE` | `escapeCrystalDisabled = false`, `logoutBugPossible = true` |
| `BOSS_TZHAAR_FIGHT_CAVES_ENTRANCE` | `escapeCrystalDisabled = true` |

The suite lists these as `PRESERVED ONLY`, not as proof of fresh-authoring support. Recreating every boss from blank form inputs, clicking actual browser controls, map interactions, and in-game behavior are not covered by this suite.

## Reproduce

```sh
npm run test:bosses -- "../escape-crystal-notify/src/main/java/com/escapecrystalnotify/EscapeCrystalNotifyRegion.java"
```

Use the actual checkout path on your machine. With no argument, the command checks the checked-in snapshot instead. Detailed results are written to `work/boss-roundtrip.log` and `work/boss-roundtrip.xml`; failures identify the boss, operation, and expected versus generated value. No bosses are silently omitted from the source inventory.
