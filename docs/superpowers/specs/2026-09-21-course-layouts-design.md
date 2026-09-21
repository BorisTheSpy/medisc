# Course layouts (shorts and longs)

Date: 2026-09-21

## Goal

A course can have more than one layout (UDisc calls them "Mane"/"Pony", "Long"/"Short", "Blue tees"). A player picks which layout to play when starting a round, and everything downstream (holes, pars, lengths, pins, hole count fixes) applies to that layout.

## Data model

- `Layout { id, courseId, layoutId, name, holeCount, par?, distanceM?, difficulty?, technicality?, lengthBin?, playCount?, updatedAt }`. `id` is `${courseId}/${layoutId}`.
- `Hole.layoutId` is required. `"main"` is the default layout. Existing holes are upgraded to `layoutId: "main"` in Dexie version 2. Hole ids: main keeps `${courseId}-${n}`; other layouts use `${courseId}-${layoutId}-${n}`.
- `Round.layoutId?` and `Round.layoutName?`. Missing means main. Rounds sync as JSON docs so no server change is needed.
- A course with no `layouts` rows has a single implicit main layout.

## Server (D1)

- `holes` stays the main layout's holes, unchanged.
- New `layouts (course_key, layout_id, name, hole_count, par, distance_m, difficulty, technicality, length_bin, play_count, updated_at)` for every layout's metadata, main included.
- New `layout_holes (course_key, layout_id, number, par, distance_m, tee_lat, tee_lon, basket_lat, basket_lon, updated_at)` for non-main layouts, with the same last-write-wins and COALESCE rules as `holes`.
- `GET /api/community/courses/:key` also returns `layouts: [{ ...meta, holes }]`.
- `PUT /api/community/courses/:key` accepts `holes` (main) and optional `layouts[]`. A layout with id `main` contributes metadata only; its holes come from `holes`.
- Nearby listing counts pins in `layout_holes` as substance too.

## Client

- `useHoles(courseId, layoutId)` and `useLayouts(courseId)`.
- `saveHoles`, `updateHole`, `removeHole`, `setHoleCount` take a layout id (default main).
- `publishCourseNow` sends main holes plus every other layout with its holes. `syncShared` merges each shared layout with `mergeHoles` per layout and upserts layout rows.
- Course page: layout chips above the holes list when more than one exists. Map and table follow the selected layout. "Play here" and "Edit holes" carry the layout.
- New round: layout chips when more than one; preselected from `?layout=`.
- Scorecard: header shows the layout name; tee/basket pins and hole count fixes go to the round's layout.
- Round rows and summaries show the layout name after the course name.

## GPS pins

Tee here / Basket here reject a fix with reported accuracy worse than 15 feet.

## Import

`scripts/import-udisc.ts` reads every active layout with holes. The most played becomes `main`; the others get `udisc-l<layoutId>`. Layout metadata carries UDisc's length bin, difficulty bin, technicality bin and 30-day play count.

## Out of scope

Creating or deleting layouts in the app. Players edit the layouts a course already has.
