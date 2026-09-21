---
version: 1
slug: "src-routes-home-tsx"
primary_target: "src/routes/Home.tsx"
related_targets: ["src/routes/Scorecard.tsx","src/routes/Courses.tsx","src/routes/Stats.tsx","src/routes/Rounds.tsx","src/routes/Settings.tsx"]
---

# Surface brief: Medisc app (all screens; Operate)

Scope: the whole product UI, mobile-first PWA. Visitor mode: Operate. Audience: Ivan and friends at Charlotte-area courses, phone in hand, often in sun. Job: find course, start round, score fast, mark tees/baskets, review rounds and stats. Constraint: scoring speed and sunlight legibility; attributions required; keep all functions and copy.

Pinned by the user: the Lando Norris design system (charcoal #3b3c38 ground, dark olive #282c20 primary surfaces, acid lime #d2ff00 accent/surface, off-white #f4f4ed text, dark olive text on lime, radius 2/6/14/39, spacing base 11, heavy tight serif display, small 800-weight sans labels). A pinned system beats the roll.

## Direction contract

THESIS: A paddock-grade race hub for a disc golf card: charcoal and dark olive fields with acid lime as the working colour of everything live, and a heavy humanist serif shouting the numbers. It refuses the pale rounded-card kit and the pastel score palette.

OWN-WORLD: Ground #3b3c38, panels #282c20, lime #d2ff00 for primary actions, the live round, active hole, under-par scores and selected states; off-white #f4f4ed type; on lime, dark olive text. Display face Young Serif (free stand-in for Brier), set tight (line-height 0.85, tracking -0.02em) for hole numbers, scores and headings; Mona Sans 800 at 11–12px for labels and meta, Mona Sans 500/600 for body. Radii 2/6/14 with 39px pills for primary buttons. Hairlines in lime at low alpha; no drop shadows on the field; depth by tone step. Score chips: under par = lime fill dark text; par = olive outline; bogey = off-white outline; double+ = off-white fill dark text; ace = lime with a dark ring.

STORY: The player lands on a hub that already knows their live round, course and form; scoring feels like a live timing screen; stats read like a season sheet.

FIRST VIEWPORT (Home): full-bleed charcoal; the greeting as a two-line Young Serif headline at 44px; beneath it the live round as a lime panel (39px radius corners) with course name in serif, player chips and a huge score to par; if no live round, a lime pill "Start a round". Then a quick-stats strip on an olive panel, then recent rounds as olive rows with serif score numerals in lime. Scorecard: a lime hole overlay bar (hole number 72px serif, par, length, distance to basket), Tee here / Basket here as pills, the hole strip as lime-ringed circles, players as olive rows with serif score and lime plus / outlined minus.

FORM: user-pinned system, outside the dealt hand; seed key 6854740b recorded for the round it replaced.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Cited adaptations
- Par chips use an off-white hairline outline rather than olive, because an olive outline on the olive panel would vanish.
- The scorecard's Next hole and Finish buttons are lime pills (primary), matching OWN-WORLD; the plus buttons are lime too, so lime marks every forward action on that screen.
- Hole numeral is 84px rather than 72px: larger reads better in sun.

## Signature interaction
Scoring a hole "strikes" the chip: the new number snaps in with a 120ms lime flash, no glow, no tweening of numerals. One authored moment: on entering a hole the overlay bar slides in from the left like a timing screen; reduced motion disables it.

## Unresolved
Whether a light theme is offered at all: the pinned system is dark; a light variant is not built in this pass.
