---
name: Medisc
description: A timing screen for a disc golf card; a night-blue field with blue hairlines, amber for everything live, mint only for under par, a soft serif carrying the numbers.
colors:
  night-ground: "#0c1a2c"
  night-deep: "#07101c"
  navy-panel: "#132842"
  navy-raised: "#1c3759"
  navy-pressed: "#27497a"
  chalk: "#eef3fa"
  chalk-2: "#b9c7dc"
  chalk-3: "#8497b3"
  amber: "#ffb340"
  amber-2: "#ffc668"
  on-amber: "#1d1305"
  sky: "#6cb8ff"
  sky-hairline: "rgba(112, 170, 255, 0.18)"
  chalk-hairline: "rgba(238, 243, 250, 0.22)"
  mint: "#5fdcaa"
  mint-wash: "rgba(95, 220, 170, 0.14)"
  signal-red: "#ff6a52"
typography:
  display:
    fontFamily: "Fraunces, Georgia, Times New Roman, serif"
    fontSize: "84px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fraunces, Georgia, Times New Roman, serif"
    fontSize: "46px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Fraunces, Georgia, Times New Roman, serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
  subtitle:
    fontFamily: "Fraunces, Georgia, Times New Roman, serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Nunito Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  body-strong:
    fontFamily: "Nunito Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Nunito Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.03em"
  button:
    fontFamily: "Nunito Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  sm: "2px"
  md: "6px"
  lg: "14px"
  pill: "39px"
  circle: "9999px"
spacing:
  unit: "11px"
  x2: "22px"
  x3: "33px"
  x4: "44px"
  row: "15px"
  tap: "44px"
  tab-bar: "64px"
  column: "480px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.amber-2}"
    textColor: "{colors.on-amber}"
  button-primary-lg:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.chalk}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.navy-pressed}"
    textColor: "{colors.chalk}"
  button-brand:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.on-amber}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.chalk}"
  button-danger:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.on-amber}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  field:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "48px"
  card:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.lg}"
    padding: "22px"
  card-pressed:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.chalk}"
  stat-tile:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    padding: "11px"
  live-panel:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.pill}"
    padding: "22px"
  hole-overlay:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.lg}"
    padding: "11px 22px 15px"
  tab-bar:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.chalk-3}"
    typography: "{typography.label}"
    height: "{spacing.tab-bar}"
  tab-bar-active:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
  toast:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
  score-cell-under:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.md}"
    size: "30px"
  score-cell-par:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    size: "30px"
  score-cell-double:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.md}"
    size: "30px"
  score-cell-triple:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.md}"
    size: "30px"
---

# Design System: Medisc

## Overview

**Creative North Star: "The Timing Screen, at Night"**

Medisc is a scorecard read with one hand free, so the world is built like a race-hub timing screen: a night-blue ground, navy panels stepped up in tone, blue hairlines for structure, and one working colour, amber, reserved for whatever is live right now. Under par gets its own colour, mint, because a birdie is news and should not share a tone with a button. Numbers are the content, set in a heavy humanist serif at sizes that read from arm's length; everything around them is small, dense, sentence-case sans meta.

The system is dark-only and flat. Depth is carried by tone (ground, panel, raised, pressed) and by sky-blue hairlines, never by drop shadows on the field. The ground carries one atmospheric touch: a cool glow at the top of the page that fades into the navy, so the field reads as depth rather than a slab. Corners run on a four-step scale, and the two extremes carry meaning: tight 6px corners for data cells and inputs, full 39px pills for anything the player is about to press. Motion is limited to two authored moments (the score strike and the hole overlay slide) and honours reduced-motion.

The Lando Norris timing-screen structure was pinned as the source and its charcoal-and-lime palette was later rejected as too harsh; the colour world returned to the app's original deep blue with amber, now with mint and sky as working accents. The typefaces were later softened at the owner's request: Fraunces replaced Fraunces and Nunito Sans replaced Nunito Sans.

**Key Characteristics:**
- Night-blue ground, navy panels, blue hairlines; amber means live, selected, or forward; mint means under par.
- Soft medium-weight serif for every number and heading (line-height 1, tracking -0.01em); small 700-weight sentence-case sans for labels.
- Flat surfaces, tonal depth, sky hairlines at 18% alpha, one top-of-page glow; no drop shadows on the field.
- 11px spacing base (11 / 22 / 33 / 44); single 480px mobile column.
- Radii 2 / 6 / 14 / 39: data cells and inputs at 6, cards and sheets at 14, buttons and live panels at 39.

## Colors

A navy field in four tones with chalk text, amber as the sole action colour, mint for good scores, sky for structure, and signal red for the worst outcomes.

### Primary
- **Amber** (`amber`): every primary action, the live round panel, the active hole overlay, the active tab, selected chips and segments, the focus ring, the text caret, text selection, the satellite toggle when on, the user's position dot and active map pins. Dark warm text sits on it (`on-amber`); never chalk.
- **Amber Lift** (`amber-2`): the hover and pressed state of any amber surface. Its only job is to acknowledge a tap.
- **Mint** (`mint`): under-par score cells and numerals (ace carries a dark inset ring, eagle a 40% ring), running totals under par, and inline text links. It never fills a button.
- **Mint Wash** (`mint-wash`): a low-alpha mint tint for highlighting a whole row or cell as under par without filling it.

### Neutral
- **Night Ground** (`night-ground`): the page background and the browser theme colour, with a sky glow at the top (`#1a3762` fading to transparent over the first 38% of the viewport). Sticky headers use the ground at 95% with a backdrop blur.
- **Night Deep** (`night-deep`): a step below ground; reserved, rarely used.
- **Navy Panel** (`navy-panel`): cards, sheets, the tab bar, inputs, stat tiles, map popups and attribution, the dark core of map markers.
- **Navy Raised** (`navy-raised`): secondary buttons, pressed cards and rows, ghost-button hover, inline notice panels.
- **Navy Pressed** (`navy-pressed`): pressed secondary buttons, icon-button active, the scrollbar thumb.
- **Chalk** (`chalk`): primary text, the brand button fill, bogey outlines, double-bogey fill, the "casing" line under mapped holes.
- **Chalk 2** (`chalk-2`): body copy inside panels, even-par numerals, inactive segment labels, attribution text.
- **Chalk 3** (`chalk-3`): labels, meta lines, placeholders, inactive tabs, unscored cells, chart axes.
- **Sky Hairline** (`sky-hairline`): the default divider between rows and between stat cells. The tab bar and action row take an amber top edge at 30% instead, because they hold the live controls.
- **Chalk Hairline** (`chalk-hairline`): outlines on secondary buttons, unselected chips, inputs at rest, par cells and the zero line in charts.

### Tertiary
- **Sky** (`sky`): available for informational emphasis on the navy field; currently carried only by the hairlines and the ground glow. Do not spend it on actions.
- **Signal Red** (`signal-red`): the danger button and triple-bogey-or-worse cells and numerals. It appears only for bad news.

### Named Rules
**The One Live Colour Rule.** Amber marks what is live, selected, or the next forward action. It does not decorate, and it does not colour a score. If two amber surfaces sit side by side, one of them is wrong.

**The Dark-on-Amber Rule.** Text and icons on an amber surface are dark warm (`on-amber`), including outlines and chips inside the live panel and hole overlay. Chalk never sits on amber.

**The Score Tone Rule.** Under par is mint (ace carries a dark inset ring, eagle a 40% ring), par is a chalk hairline outline, bogey a 2px chalk outline, double bogey a chalk fill with navy text, triple or worse a signal-red fill with dark text. The same tones colour running totals and per-hole numerals. Amber never appears in a score cell.

## Typography

**Display Font:** Fraunces (with Georgia, Times New Roman, serif), self-hosted variable 400–700 with optical size and the SOFT axis at 100
**Body Font:** Nunito Sans (with ui-sans-serif, system-ui), self-hosted variable 400–800
**Label Font:** Nunito Sans at 700, sentence case, 11–13px

**Character:** A soft, rounded serif carrying the numbers at a medium weight, and a friendly rounded sans doing everything else. Nothing is set heavier than 700, nothing is shouted in capitals except the four tab names, and display lines have a full line-height so tall numerals sit in air rather than pressing on each other. Numerals are tabular everywhere they can be compared.

### Hierarchy
- **Display** (500, 84px, line-height 1): the current hole number in the scorecard overlay. The Stats form figure uses 72px; the live score-to-par on Home uses 56px. These are the only sizes above 46.
- **Headline** (500, 46px, line-height 1): the two-line greeting on Home. The scorecard stroke count is 44px; the stats best-round figure 40px; hole data (par, length, distance) 36px.
- **Title** (500, 30px, line-height 1): page headers, the live panel's course name, round-row score numerals, stat-tile values.
- **Subtitle** (500, 26px): section headings and sheet titles. 22–24px for empty-state and notice headings.
- **Body** (500, 15px): default copy. Names and course titles in rows use body-strong (700, 15px). Explanatory copy inside panels is 14px at 500 in `chalk-2`.
- **Label** (700, 11px, 0.03em, sentence case): every meta line, stat label, chip and segment. The tab bar alone keeps uppercase. Hints under fields are 12px at 500 in `chalk-3`.
- **Button** (700, 12 / 13 / 15px by size, sentence case, normal tracking): the three button sizes.

### Named Rules
**The Serif Owns the Numbers Rule.** Any score, par, distance, count or heading is set in Fraunces with tabular numerals. The sans never carries a headline or a hero figure.

**The Soft Set Rule.** Display text is set at line-height 1 and tracking -0.01em with the SOFT axis at 100. No weight above 500 on the serif and none above 700 on the sans; emphasis comes from size, not from bolding.

**The Sentence Case Rule.** Buttons, chips, segments and labels read as words, not as capitals. Uppercase survives only on the tab bar, where four short words need to hold their width.

## Layout

One mobile column: the app shell centres a 480px max-width column on the night ground and adds 96px of bottom padding for the fixed tab bar (64px plus the safe-area inset). Screens are edge-to-edge within that column; content sits inside 22px horizontal gutters on Home and inside 11px section padding with an inner 11px heading inset elsewhere. Rows inside a panel use 22px horizontal and 15px vertical padding; compact rows use 11px on both axes.

Spacing runs on an 11px base: 11 between related elements, 22 between groups and as panel padding, 33 between the masthead and the headline, 44 before a new section. Small internal gaps (6px hole strip, 8px flex gaps) come from Tailwind's default scale and are acceptable below the base unit.

Density is high by design. Quick stats sit four across in a single navy strip divided by sky hairlines; stat tiles run two or three across in a grid; the scorecard's hole strip is a horizontal scroll of 32px circles with the scrollbar hidden. Tap targets on the scorecard are 48px (plus and minus) and the bottom action row is 56px tall. Sticky headers are 56px minimum, blurred over the ground at 95% opacity. Sheets rise from the bottom to 80% or 92% of the viewport with a amber top edge.

The map (MapLibre) is a panel too: 30% of the viewport on the scorecard, 46% on course detail, 66% on Courses, with 14px corners. Its controls are 40px circles on navy with a chalk hairline; the satellite toggle fills amber when on.

## Elevation & Depth

Flat, tonal, dark-only. The card shadow token resolves to `none` and every panel sits on the ground by tone alone: ground (night-blue) < panel (navy) < raised (navy-raised) < pressed (navy-pressed). Separation inside a panel is a sky hairline; separation between a panel and the ground is the tone step itself. The tab bar and the scorecard action row are distinguished from the ground by a amber top edge at 30%, not a shadow. Modal sheets darken the ground with black at 60% and lift the sheet with a 1px amber top border.

The only shadows in the build are on map markers, where they are needed for legibility over aerial imagery rather than for depth in the UI.

### Shadow Vocabulary
- **Marker drop** (`box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45)`): hole markers and course pins over the map tiles.
- **User halo** (`box-shadow: 0 0 0 3px rgba(255, 179, 64, 0.35), 0 2px 6px rgba(0, 0, 0, 0.5)`): the player's own position dot.

### Named Rules
**The Flat Field Rule.** No box shadows on panels, buttons, chips, sheets or toasts. Depth is a tone step or a sky hairline. Shadows exist only on map markers.

**The Amber Edge Rule.** A surface that must read as a separate layer (tab bar, action row, sheet) gets a 1px amber top edge, at 30% for bars and full for sheets, instead of a shadow.

## Shapes

Four radii, each with a job. Tight corners (6px) belong to data: inputs, stat tiles, score cells, avatars, chart tooltips, map popups. Panel corners (14px) belong to containers: cards, sheets, the hole overlay, map panels, the app icon. Pills (39px) belong to anything pressable or live: every button size, chips, segmented controls, toasts, the Home live panel. The 2px step exists in the token set but is used once; it is reserved rather than active. Full circles are a fifth, unnamed shape for the hole strip, the plus and minus strokes, icon buttons, map controls and player avatars in the players list.

Borders are hairlines: 1px chalk at 22% on outlined controls and par cells, 1px amber at 16% between rows, and 2px solid (chalk on bogey cells and the minus button, navy on chips inside amber surfaces) when a stroke must survive sunlight. The course pin is a rotated teardrop (50% 50% 50% 0) in navy with a amber stroke and a amber core; the active pin inverts to a amber fill with an navy core and scales to 1.25.

## Components

### Buttons
- **Character:** flat pills, sentence-case sans, colour-only state change in 150ms.
- **Shape:** full pill (39px) at all three heights: 36px small (12px type, 14px side padding), 44px medium (13px, 20px), 56px large (15px, 24px). Icon buttons are 40px circles.
- **Primary:** amber fill, dark text; hover and active shift to amber-2. Used for the single forward action on a screen: Start a round, Next hole, Finish, the plus stroke, Play.
- **Secondary (default):** navy-raised fill, chalk text, chalk hairline; hover and active step to navy-pressed. Previous hole, cancel, open.
- **Brand:** chalk fill, dark text; hover to white. Save and submit inside forms and sheets.
- **Ghost:** transparent, chalk text, navy-raised on hover. Dismissals.
- **Danger:** signal-red fill, dark text, 90% opacity on hover. Destructive confirmations only.
- **Focus:** 2px amber outline, 2px offset, on every focusable element. Disabled: 40% opacity, pointer events off.

### Chips
- **Style:** 36px pill, label typography, chalk text over a chalk hairline on a transparent ground; hover to navy-raised.
- **Selected:** amber fill, amber border, dark text. Chips inside an amber surface invert: transparent with an dark 40% or 2px dark border, dark text, and a filled navy chip with amber text when the item is marked (Tee here, Basket here).
- **Segmented control:** the same pill language inside a 39px navy track with a chalk hairline and 4px inset; the selected tab is a amber pill, unselected labels sit in chalk-2.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** navy panel; a pressable card steps to navy-raised on press. The one exception is the Home live panel, a 39px-radius amber card with dark text, a pulsing navy dot beside its "Live round" label and a 56px serif score.
- **Shadow Strategy:** none (see Elevation & Depth). A card that needs emphasis takes a 1px amber border, as the claim-rounds notice does.
- **Border:** none by default; rows inside are divided by sky hairlines and the last row drops its edge.
- **Internal Padding:** 22px for content cards, 11px for stat tiles, 22px by 15px for list rows.

### Inputs / Fields
- **Style:** 48px tall, 6px corners, navy panel fill, chalk hairline, 15px semibold chalk text, chalk-3 medium placeholder, amber caret. Labels above use the label style in chalk-2 with 8px below; hints below are 12px chalk-3.
- **Focus:** border turns amber; the global outline is suppressed on the input itself.
- **Search:** the same field with a leading chalk-3 icon inset 14px and a trailing 32px clear circle.

### Navigation
- **Tab bar:** fixed, 64px plus safe area, navy fill, amber 30% top edge, four equal tabs. Each tab is a 22px line icon over an 11px uppercase label with 6px gap; inactive in chalk-3 at stroke 2, active in amber at stroke 2.6. Hidden on the scorecard and new-round screens, where a bottom action row of the same construction takes its place.
- **Page header:** sticky, night-blue at 95% with blur, 56px minimum, a 40px back circle, a 30px serif title and an optional label subtitle in chalk-3.
- **Home masthead:** 30px logo, the brand name as a label, and a settings icon button; no page title.

### Score Cell (signature)
A 30px square (or scaled) with 6px corners and a heavy tabular numeral at 46% of its size, coloured by the Score Tone Rule: amber fill for under par (ace with a 2px inset navy ring, eagle with the ring at 40%), chalk hairline outline for par, 2px chalk outline for bogey, chalk fill for double, signal-red fill for triple or worse, and a amber-hairline outline with chalk-3 dash for unscored. The scorecard's live stroke count is the same tone logic at 44px serif, and the number "strikes": it snaps in with a 120ms amber flash stepped in two frames, no tween.

### Hole Overlay (signature)
The scorecard's masthead is a amber panel with 14px corners and 11px side margins: "Hole" as a label over an 84px serif numeral at line-height 0.8, with par, length and distance-to-basket as 36px serif figures under their labels to the right, a row of navy-outlined 32px pill chips (Tee here, Basket here) and the GPS accuracy as a 70% label. On each hole change it slides in from 12px left over 260ms with an ease-out-expo curve; reduced motion disables it. Beneath it the hole strip is a scrolling row of 32px circles: amber fill for the current hole, amber outline for scored holes, chalk hairline for the rest.

### Map Markers
Tee markers are 26px amber circles with a 2px dark ring and an 700-weight 12px number; basket markers invert to navy with a amber ring and amber numeral; the active marker scales 1.25 and swaps its ring to chalk. Hole lines are dashed amber (chalk when inactive) over an 85% navy casing. The user dot is a 16px amber circle with a 3px navy ring and a amber halo.

## Do's and Don'ts

### Do:
- **Do** set every number and heading in Fraunces at 400 with tabular numerals, line-height 0.8–0.85 and -0.02em tracking.
- **Do** put navy (`on-amber`) text and outlines on any amber surface, including chips and dots inside it.
- **Do** use amber for exactly the live, selected, under-par or forward element on a screen and nothing else.
- **Do** separate rows with a sky hairline at 16% and separate layers with a tone step or a amber top edge.
- **Do** keep spacing on the 11px base (11 / 22 / 33 / 44) and buttons on the 36 / 44 / 56 height ladder as 39px pills.
- **Do** use 6px corners for data (cells, tiles, inputs) and 14px for containers.
- **Do** colour scores by the Score Tone Rule so the same outcome reads identically in a cell, a running total and a chart.
- **Do** keep the two authored motions (120ms stepped strike, 260ms overlay slide) and disable them under reduced motion.

### Don't:
- **Don't** put a box shadow on any panel, button, chip, sheet or toast; shadows belong to map markers only.
- **Don't** set chalk text on amber, or amber text on chalk.
- **Don't** use a second accent; signal red is for danger actions and triple-bogey-or-worse only.
- **Don't** introduce a light theme, pale cards or pastel score colours; the system is dark-only and the theme preference always resolves to dark.
- **Don't** bold or track-out the serif, or drop the sans below weight 500.
- **Don't** use a 39px pill on a data cell or a 6px corner on a button; the radius carries meaning.
- **Don't** add drop shadows, gradients or glows to acknowledge a tap; a tone step (amber-2, navy-raised, navy-pressed) is the whole state change.
