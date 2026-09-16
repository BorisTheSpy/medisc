# UDisc feature inventory

Research notes gathered 2026-09-16 from help.udisc.com, udisc.com blog posts, the udisc.com media kit, and the live udisc.com CSS. Used as the reference for the clone's feature set.

## 1. Scorecard flow

### Starting a round
1. Tap **Play**.
2. **Select course** (search bar, nearby list).
3. **Select layout**. Picker shows par, distance, hole count, difficulty. Layout and hole count lock once the round starts.
4. **Add cardmates**: find by username, find nearby, or **create guest player** (device-local). Previously used cardmates listed for one-tap re-add.
5. **Customize round** (optional): scoring on/off, singles/teams, record stats (scores only / throw tracker / map scoring), starting hole, starting scores, date/time, include in stats, scores off, hide overall score, notes.
6. **Start my round**. Unfinished rounds stay marked **Live** and resume.

### Hole-by-hole scoring
- One hole per screen. Swipe or Next to advance. Hole number, par, distance at top. Tap PAR to override par.
- Map icon toggles hole map (aerial, tee-left to basket-right) with live distance to basket.
- Scores-only mode: each player row has **+** to add a stroke and an orange minus to remove. Penalty/OB toggle.
- Throw Tracker: for each throw, "Where did throw X land?" with zones: Fairway, Off fairway, Circle 2 (10–20 m), Circle 1 (within 10 m), Parked (within 3.3 m), OB/Penalty. Basket icon holes out.
- Per-hole info: global average, your average, your best, stacked bar of birdie/par/bogey/bogey+ share.
- Each player row shows total strokes and score relative to par (E, -2, +3).
- Score cell symbols: ace = green diamond, eagle = dark blue circle, birdie = light blue circle, par = plain, bogey = pale orange square, double = medium orange square, triple+ = dark orange square.

### Finishing a round
Finish round -> summary (score, relative to par, rating), name the round, share. Auto-saved to profile.

### Finished scorecard shows
- Header: course, layout, date/time, round name, trophy icon for "celebrations" (best rating, streak milestone).
- Per-player hole-by-hole grid with colored symbols, total, +/- par, rating.
- Round stats: C1 putting, C1X, C2 putting, fairway hit, C1/C2 in regulation, parked, scramble, OB rate, birdie rate.
- Editable afterwards (scores, par, date, players). Delete options.

## 2. Course pages and discovery

### Course page
- Header: breadcrumb, photos, name, city/state, star rating and count.
- Quick stats row: est. time, est. length, elevation, difficulty.
- About chips: holes, tee type, target type, amenities, established year.
- Layout cards: name, holes, par, distance, length class, par rating, est. time.
- Layout detail: per-hole table Hole / Tee / Target / Distance / Par / global average distribution.
- Location with directions and map. Nearby courses with distance. Reviews. Leaderboard.

### Discovery
- Location-based list with list/map toggle. Radius options <10/<25/<50/<100/<250 mi/anywhere.
- Sort: Recommended, Closest, Highest rated. Filter pills: difficulty, rating, length, played/unplayed, cost, services.
- Course card: photo, name, city/state, holes, rating, difficulty, est. time, badges.

## 3. Statistics

### Stat definitions
- C1 putting (made/attempts inside 10 m), C1X (3.3–10 m, excludes tap-ins), C2 putting (10–20 m).
- Fairway hit %: par 3 within C2; par 4 fairway or C2; par 5 first two throws.
- C1 in regulation, C2 in regulation, Parked (within 3.3 m with two throws left for par).
- Scramble %: par or better after being outside C2 with two throws left.
- OB rate, throw-in rate, birdie rate, average score, best rounds, aces, par/bogey rates, scoring by hole.

### Ratings
- Round rating: 1–300+ scale (<100 beginner, 100–200 intermediate, 200–250 advanced, 250–300 elite). Each layout has a par rating.
- Player rating: average of best 8 of last 20 rated rounds.

### Stats dashboard
- Rating snapshot at top with trend arrow.
- Time range: Last 4 / Last 10 / Calendar year / All time.
- Stat tiles and charts; per-course/layout breakdowns with best and average per hole.
- Lifetime counters: rounds, courses played, aces, streak.
- No formal badges. Celebrations (trophy on a round), weekly streak (orange flame), yearly Replay recap.

## 4. Round history
- Rows: course, layout, date, score and +/- par, rating, trophy, Live tag.
- Actions: open, edit, delete, share, CSV export.

## 5. Visual design

### Brand palette
| Name | Hex |
|---|---|
| UDisc Orange (primary) | #FF6116 |
| Birdie Blue | #477EC3 |
| Fairway Green | #208465 |
| OB Red | #D43333 |
| Parked Purple | #6633CC |
| Mando Yellow | #FFC533 |
| Ground Play Gray | #CFD2D7 |
| Griplock Gray | #686A6C |
| Black Ace | #1C1F23 |

Brand is orange-first, blue accent, green secondary.

### Web tokens
Light: bg 251,253,255 · bg-accent1 232,242,255 · divider 222,237,255 · text 53,53,54 · subtle 112,113,114.
Score colors light: ace 53,185,144 · eagle 63,117,186 · birdie 112,157,215 · bogey 255,223,207 · bogey2 251,176,140 · bogey3 255,137,81.
Dark: bg 3,6,10 · bg-accent1 22,33,48 · divider 26,45,69 · text 230,234,241 · birdie 33,65,107 · eagle 72,107,152 · bogey 196,135,106 · bogey2 200,107,66 · bogey3 177,77,34 · ace 45,174,134.

### Typography and layout
- Web body font Rund; display Rund Display Bold. Mobile app uses system fonts.
- Mobile app: bottom tab bar (Home, Courses, central Play, Events, You). Card lists, large numeric score chips, orange primary button, blue secondary. Dark mode is near-black.

## 6. Other features (not in scope for v1)
Measure throw, disc bag, leagues/events, community feed, activity rounds, course traffic, watch apps, CSV export.

## Sources
help.udisc.com articles 11391658, 10705066, 10705077, 10705446, 10705444, 10705189, 15296484, 10705163, 13562551, 12631438, 10705081; udisc.com/blog posts on scoring modes, map scoring, round ratings, smart layouts; udisc.com/media/color-palette; udisc.com/courses pages and CSS bundles.
