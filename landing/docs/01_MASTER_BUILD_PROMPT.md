# MASTER BUILD PROMPT — "THE HUNT" · NAVRYA Cinematic Landing Site

> **How to use this file:** paste it whole into Claude Code as the opening message of a fresh session, with the six scene PNGs already copied into the repo. Build it in the phases defined in §12 — do not attempt the whole thing in one pass.

---

## 0. YOUR ROLE

You are the **Executive Creative Director + Lead Creative Technologist** on this build. Your reference bar is Apple product pages, Awwwards Site of the Year, and Active Theory / Resn scrollytelling — not a landing-page template with a gradient hero.

You are building **one page**: the marketing site for **NAVRYA**, a local-first Bitcoin trading journal. The site tells the story of the **Hunter** — one of the product's four trader archetypes — through a single continuous, scroll-scrubbed cinematic sequence. Every feature of the product is revealed at the exact story beat where a real hunter would need it.

**The thesis of the entire page, in one line:**
> *A hunter's value is not the kill. It is everything they did before the shot, and everything they wrote down after they missed.*

That line is why this product exists. Every design decision below serves it. The site's emotional climax is **a miss, not a hit** — the arrow strikes a tree, the stag escapes, and that is where the psychology and review features live. Do not "fix" this into a triumphant hit. The miss is the product.

---

## 1. NON-NEGOTIABLE GUARDRAILS

Read these before writing a line of code. Violating any of them means the build is wrong even if it looks good.

1. **This is a standalone marketing site.** Build it in its own folder (`landing/`) as its own Vite app. Do **not** import from, modify, or entangle it with the existing `tradejournal-react/` application source. It shares design language and language codes with the app; it shares no code.
2. **Six cinematic stills already exist and are final.** They are the spine of the page. Every generated asset must match them — never replace or restyle them.
3. **The page must be fully readable and usable with zero WebGL.** Build the DOM content layer first (Phase 0). The canvas is an enhancement painted *behind* real HTML. If WebGL fails, `prefers-reduced-motion` is set, or JS is slow, the visitor still gets a beautifully typeset, scroll-fading long-form page. No content lives only inside the canvas.
4. **Never letterbox or crop the character out of frame.** Art-direct per breakpoint using dedicated portrait crops, not `object-fit` guesswork.
5. **Four languages, real RTL:** `fa` (Persian, RTL), `ar` (Arabic, RTL), `en` (English, LTR), `es` (Spanish, LTR). RTL is not a `dir` attribute bolted on at the end — the *cinematography mirrors too* (§10).
6. **No invented product claims.** Every feature statement in §8 is derived from the real architecture. Do not add "AI-powered predictions", "guaranteed profits", "95% accuracy", or any number that isn't in §8. If you need filler copy, ask instead.
7. **No stock-template tells.** Forbidden on this build: gradient-mesh blobs, glassmorphism cards, "trusted by" logo strips, three-column icon grids with Lucide icons at 48px, `#D97757`-family terracotta accents, animated counters ticking to a round number, testimonial carousels, purple-to-blue gradients.
8. **One signature element only** (§5.4). Everything else stays disciplined and quiet so the signature can carry the page.
9. **Every phase ends green:** `npm run build` passes, no console errors, a screenshot is taken and self-critiqued before moving on.

---

## 2. TECH STACK

```
Vite 5 + React 18 + TypeScript (strict)
three                          — 3D runtime
@react-three/fiber             — React renderer for three
@react-three/drei              — helpers (useTexture, shaderMaterial, Preload)
@react-three/postprocessing    — Bloom / Vignette / Noise / ChromaticAberration / DOF
postprocessing                 — peer
gsap + ScrollTrigger           — DOM reveal choreography only
lenis                          — smooth scroll (drives BOTH gsap and the canvas)
zustand                        — one global scroll/act store
maath                          — damp() easing helpers
```

**Styling:** CSS custom properties + CSS Modules. **Do not install Tailwind.** Utility classes push this build toward the templated look we are explicitly avoiding, and every value here is bespoke.

**i18n:** a ~60-line custom provider reading four JSON dictionaries + native `Intl` for numbers and dates. No i18next. This mirrors how the product app itself handles i18n (distributed dictionaries, `Intl` formatting), so the landing feels like the same organism.

**Fonts:** self-host as `woff2` in `public/fonts/` with `font-display: swap` and explicit `unicode-range` splits per script. Do not hotlink Google Fonts — the FOUT on a page this dark and this typographic is disqualifying.

---

## 3. ASSET SYSTEM

### 3.1 The six canonical scenes (already delivered)

Copy the six uploaded PNGs into `public/scenes/` and **rename to semantic names**:

| Source file | Rename to | Story beat | What is in frame |
|---|---|---|---|
| `SLIDE_1_DESKTOP_CHARACTER.png` | `00-choosing.png` | The Choosing | Hunter **far left**, backlit ridge, sunlit valley opening right. Left-weighted on purpose: the other three archetype cards occupy the right. |
| `SLIDE_2_SELECT_DESKTOP_CHARACTER.png` | `01-opening.png` | The Opening | Same hunter under the oak; the world has opened — a **stag with full antlers** stands in the misted meadow. |
| `SLIDE_3_START_DESKTOP.png` | `02-draw.png` | The Draw | Tight three-quarter shot, arrow nocked, bow at full draw, eyes over the shaft. |
| `SLIDE_4_ARROW_DESKTOP.png` | `03-flight.png` | The Flight | The arrow alone, **perfectly horizontal**, motion-blurred forest behind it. |
| `SLIDE_5_ARROW_DESKTOP.png` | `04-miss.png` | The Miss | Arrow buried in a mossy trunk, **right foreground**; the stag bolting away, **left midground**. |
| `SLIDE_6_RUN_DESKTOP.png` | `05-return.png` | The Long Hunt | Hunter standing in deep forest, bow lowered, cathedral light shafts ahead. |

### 3.2 Assets you must generate

Everything else is produced from **`02_ASSET_PROMPT_PACK.md`** (the companion file). It contains locked-DNA image prompts and video prompts for: the three other archetype cards, the 5-frame draw sequence, depth maps, layer cut-outs, the stag sprite, particle and light-shaft textures, portrait mobile crops, and the OG image.

### 3.3 Graceful asset degradation — **build this first, it is not optional**

Create `src/assets/manifest.ts` where **every optional asset declares a fallback chain**:

```ts
export const SCENES = {
  draw: {
    still:    '/scenes/02-draw.png',
    depth:    '/scenes/depth/02-draw.depth.png',   // optional
    sequence: '/scenes/seq/draw-%02d.webp',        // optional, 5 frames
    video:    '/scenes/video/draw.mp4',            // optional
    portrait: '/scenes/portrait/02-draw.png',      // optional
  },
  // ...
} as const;
```

At runtime, resolve in order: `video → sequence → depth-parallax → flat still`. A missing file must **never** throw, log an error, or leave a black frame — it silently drops to the next tier. **The site must ship, look intentional, and be reviewable with only the six PNGs present.** Every generated asset added later upgrades a tier without a single code change.

### 3.4 Product screenshots

Reserve `public/app/` and build the Field Kit section (§6, Beat 05) against these exact filenames and dimensions. Ship with a tasteful placeholder (a dark panel with the app's `#79DF59` grid and a "screenshot" label) so layout is reviewable before the real captures exist.

| File | Size | Content |
|---|---|---|
| `desktop-dashboard.png` | 2880×1800 | Hunter dashboard, sessions library, market clocks visible |
| `desktop-session.png` | 2880×1800 | Session workspace — timeline, scenarios, loop ring |
| `desktop-patterns.png` | 2880×1800 | Pattern Registry, a pattern's stages + screenshots |
| `desktop-reports.png` | 2880×1800 | Reports — equity curve + trading calendar |
| `mobile-dashboard.png` | 1170×2532 | Dashboard on phone |
| `mobile-wizard.png` | 1170×2532 | Trade wizard, emotions step |
| `mobile-mindset.png` | 1170×2532 | Psychology page |

Device frames are **drawn in CSS/SVG**, never raster mockups — they must stay crisp at 3× and re-tint with the theme.

---

## 4. ART DIRECTION — LOCKED

### 4.1 Palette (extracted from the six stills, then anchored to the product)

The six images cluster tightly around a warm olive-amber grade with crushed near-black shadows. There is **no saturated green anywhere in the photography** — foliage reads desaturated olive. That gives us the page's central colour thesis:

> **The world is warm, analog, and golden. The instrument laid over it is cold, precise, and green.**

`#79DF59` is the Hunter theme's real accent inside the product (`panel-system.js`). On this page it appears **only** on interface and instrumentation: the bowstring rail, act numbers, data ticks, focus rings, buttons, HUD hairlines. It must **never** be colour-graded into the imagery, never used as a glow behind the character, never used as a gradient. That restraint is what makes it read as an instrument rather than decoration.

```css
:root {
  /* World — sampled from the stills */
  --void:        #0B0A05;  /* page ground, deepest shadow */
  --bark:        #1A170F;  /* section ground, card fill */
  --moss-deep:   #2E2A1C;  /* raised surfaces, dividers */
  --moss:        #4B432B;  /* hairlines, disabled */
  --hide:        #8D7E64;  /* secondary text, captions */
  --amber:       #C0A57A;  /* body text on dark */
  --sunhaze:     #F2DBAD;  /* headlines, high-emphasis */

  /* Instrument — the product's real Hunter accent */
  --instrument:      #79DF59;
  --instrument-rgb:  121, 223, 89;
  --instrument-dim:  rgba(121,223,89,.14);
  --instrument-line: rgba(121,223,89,.30);

  /* Used EXACTLY TWICE on the whole page: the impact flash, and the
     Red Flags chip in Beat 04. Nowhere else. */
  --quarry-rust: #A8442C;

  /* Other archetypes — used only on their own dimmed card in Beat 00 */
  --engineer:  #398CFF;
  --commander: #FF5F5E;
  --sage:      #C362FF;
}
```

**Contrast rule:** all body text sits on a scrim. Every text block over imagery gets a locally-generated gradient scrim (`--void` at 78% → transparent) sized to the text block, not a full-screen dim. Verify AA (4.5:1) on the brightest frame of each scene, not the darkest.

### 4.2 Typography

Three roles. The display face is used with restraint — headlines and act titles only, never for body or UI.

| Role | LTR (`en`, `es`) | `fa` | `ar` |
|---|---|---|---|
| **Display** — act titles, hero, feature headlines | **Young Serif** 400 | **Morabba** (fallback Vazirmatn 900) | **Reem Kufi** 600 |
| **Body** — paragraphs, buttons, nav | **Familjen Grotesk** 400/500 | **Vazirmatn** 400/600 | **Tajawal** 400/500 |
| **Utility** — eyebrows, act numbers, proof chips, HUD readouts | **Martian Mono** 300/500, `letter-spacing: .18em`, uppercase (LTR only) | Vazirmatn 500 + `font-feature-settings:'tnum'` | Tajawal 500 + `tnum` |

Young Serif is deliberate: its wedge serifs and heavy organic stems read like something carved from wood or knapped from stone — it belongs to the hunter's world. Do not substitute Playfair, Cormorant, Instrument Serif, or DM Serif; those are the reflexive picks and they will make this page look like every other AI-generated site.

Martian Mono is the instrument voice: it is what the numbers on a rangefinder look like. Never use it above 14px.

**Type scale** (fluid, `clamp()`, 1.333 ratio, 1440px reference):

```
hero        clamp(3.25rem, 7.2vw, 7.5rem)   Young Serif 400 / lh .94 / ls -.03em
act-title   clamp(2.25rem, 4.6vw, 4.25rem)  Young Serif 400 / lh 1.02 / ls -.02em
headline    clamp(1.75rem, 2.9vw, 2.75rem)  Young Serif 400 / lh 1.08 / ls -.015em
body-lg     clamp(1.05rem, 1.25vw, 1.3rem)  Familjen 400 / lh 1.62
body        1rem                            Familjen 400 / lh 1.65
utility     .72rem                          Martian Mono 500 / ls .18em / uc
```

**RTL type adjustments:** Persian and Arabic need more leading and less negative tracking. Under `[dir="rtl"]`, set `letter-spacing: 0` on all display roles and multiply line-height by 1.15. Never uppercase or letter-space Persian or Arabic. Numerals in Farsi UI stay Latin-digit with `tnum` for stable layout, matching the product app.

### 4.3 Motion grammar

Everything on this page moves like something heavy that has been aimed. Three rules:

1. **Damped, never sprung.** Scroll-driven values pass through `maath/easing.damp()` with `lambda ≈ 4` (camera) / `6` (UI). Never `easeOutBack`, never bouncy overshoot.
2. **Two speeds only.** *Draw* (slow, 900ms–1400ms, `cubic-bezier(.16,1,.3,1)`) for anything preparing. *Release* (fast, 180ms–320ms, `cubic-bezier(.36,0,.06,1)`) for anything committing. No third speed.
3. **Silence between beats.** Every act ends with 8–12% of scroll where nothing animates but the ambient layer (haze drift, particles, light flicker). The stillness is what makes the release land.

### 4.4 The signature element — **the Bowstring Rail**

**One memorable thing.** A full-height, 1px `--instrument-line` rail pinned to the inline-start edge of the viewport (left in LTR, right in RTL), 32px from the edge. It is scroll progress, section nav, and story instrument in one object, rendered as a single SVG path.

Its behaviour tracks the narrative literally:

- **Beat 00–01 (Choosing / Opening):** perfectly straight. A small `--instrument` **nock marker** sits at the current scroll position with a Martian Mono readout of the act number.
- **Beat 02 (The Draw):** the rail **bows** — the path bends inward toward the viewport centre, curvature interpolated 0 → 48px against act progress. Tension is visible. A faint hairline "arrow shaft" appears perpendicular at the nock.
- **The release instant (start of Beat 03):** the curve **snaps straight in 180ms**, the nock marker fires forward, and a single quiet oscillation (±6px, 2 cycles, 400ms) dies out. This is the one moment of violence on the page.
- **Beat 03–04 (Flight / Miss):** the rail becomes a thin shaft rail; the marker travels it. At impact it stops hard and gains a 1px rust tick.
- **Beat 05–06:** rail returns to rest, the marker becomes a nocked arrow at rest.

Clicking any act tick on the rail scrolls to that beat. It carries a real `role="navigation"` with labelled links. Hidden below 900px — mobile gets a 2px top progress hairline instead, which also bows during Beat 02.

**Do not add a second signature.** No custom cursor, no magnetic buttons, no marquee, no scramble text. If you find yourself adding one, remove it.

---

## 5. SCENE ARCHITECTURE

### 5.1 The layer stack

```
z 30   Bowstring Rail (SVG, fixed, pointer-events on ticks only)
z 20   Header: wordmark · language switcher · "Open the journal"
z 10   Content layer — real DOM, scrollable, transparent spacers
z  5   Scrim layer — per-block gradient scrims for text legibility
z  0   <Canvas> — fixed, inset:0, the whole cinematic
```

**Critical:** the canvas is `position: fixed; inset: 0` and **never pinned**. The DOM above it scrolls normally. This avoids every ScrollTrigger pinning bug and keeps the document natural for accessibility and for reduced-motion mode (where the canvas simply doesn't mount).

### 5.2 The scroll engine

```ts
// store/scroll.ts — zustand
{
  progress: number,        // 0..1 whole document
  act: 0|1|2|3|4|5|6,
  actProgress: number,     // 0..1 within current act
  velocity: number,        // signed, for streaks + shake
  direction: 1 | -1,       // +1 LTR, -1 RTL — mirrors ALL x-motion
  tier: 'high'|'mid'|'low'|'static',
}
```

Lenis drives one RAF loop. That loop updates the zustand store. GSAP ScrollTrigger is bound to Lenis (`lenis.on('scroll', ScrollTrigger.update)`) and is used **only** for DOM reveals. The canvas reads the store inside `useFrame` and damps toward targets — it never subscribes to React re-renders. **Zero React state updates per scroll frame.**

Act boundaries (fractions of total document scroll):

```
00 THE CHOOSING    0.000 – 0.080
01 THE OPENING     0.080 – 0.180
02 THE DRAW        0.180 – 0.420   ← 3 features
03 THE FLIGHT      0.420 – 0.640   ← 2 features + inline app screens
04 THE MISS        0.640 – 0.800   ← 3 features
05 THE FIELD KIT   0.800 – 0.900   ← devices + 4 languages
06 THE LONG HUNT   0.900 – 1.000   ← XP, community, CTA, footer
```

Total document height ≈ **760vh**. Tune so each feature card has ≥ 90vh of dwell.

### 5.3 Making 2D stills feel genuinely 3D

The six images are stills. Three techniques, layered, produce real dimensional depth. Implement in this order:

**(a) Fragment-shader depth parallax — primary.** Each scene is a full-bleed `planeGeometry` with a `ShaderMaterial`. The fragment shader offsets UV sampling by a grayscale depth map:

```glsl
// uOffset = damped camera offset, driven by scroll + pointer
// uDepth  = grayscale depth map (white = near, black = far)
float d = texture2D(uDepth, vUv).r;
vec2 uv = vUv + (d - 0.5) * uOffset * uStrength;
vec4 c  = texture2D(uMap, uv);
```

`uStrength` ≈ 0.055 desktop / 0.03 mobile. This is chosen over geometry displacement deliberately: no silhouette tearing at high-contrast edges, and it costs one texture fetch. If the depth map is missing, `uStrength` → 0 and the plane renders flat and clean.

**(b) Cut-out layer separation — for the two hero frames only** (`00-choosing`, `04-miss`). Split into 3 planes at different z: `fg` (foliage frame, z +1.2), `mid` (character / arrowed trunk, z 0), `bg` (valley, z −2.4). Real camera translation now produces real parallax with correct occlusion. Worth the extra assets only on these two frames.

**(c) Camera, not zoom.** Never animate `scale` on a plane. Move a `PerspectiveCamera(fov 38)` along a `CatmullRomCurve3` with a damped `lookAt` target. The push-in during Beat 02 is a **dolly**, so the parallax shader reacts correctly and it reads as a real camera move rather than a CSS zoom.

**Scene crossfades:** blend inside a single shader with `mix(texA, texB, uMix)` — never fade two stacked meshes, which double-composites the haze and turns every transition milky.

### 5.4 Atmosphere pass

- **God rays:** 4–6 additive cone meshes from an off-screen sun, `uOpacity` breathing on a slow sine + a `simplex` shimmer. Not the `postprocessing` GodRays pass — hand-placed cones match the stills' geometry far better.
- **Particles:** two instanced `Points` layers. `pollen` (near, 700 pts, large soft sprite, fast drift) and `motes` (far, 2200 pts, 1px, near-static). Both drift on curl noise. In Beat 03 their velocity inherits scroll velocity and they streak.
- **Haze:** one very large, very slow-scrolling noise-alpha plane between mid and bg. This single element does more for "3D" than anything else — it separates depth planes the way real atmospheric perspective does.
- **Post FX (high tier):** `Bloom(intensity .55, threshold .86, smoothing .3)` · `Vignette(offset .28, darkness .72)` · `Noise(.045, premultiply)` · `ChromaticAberration(offset [.0005,.0005])` · `DepthOfField(focusDistance, bokehScale 2.4)` only on Beats 02 and 04.

### 5.5 The arrow — the only true 3D object

Built procedurally, no model file: `CylinderGeometry` shaft (dark carved wood, roughness .8) + `ConeGeometry` head (metal, `MeshStandardMaterial` metalness .9, roughness .35) + three thin `PlaneGeometry` fletchings with an alpha feather texture.

Beat 03 choreography, driven entirely by `actProgress`:

```
0.00–0.12  camera whip-pans to behind the nock; arrow at rest
0.12–0.20  RELEASE. shaft launches, camera follows at 2.1 units behind,
           offset by direction * 0.6 on x. FOV 38 → 46 for speed distortion.
0.20–0.78  the long flight. arrow settles PERFECTLY HORIZONTAL and centred —
           it becomes the page's horizon line. Feature text sits ABOVE it,
           product screenshots BELOW it. It barely moves; the WORLD moves past.
0.78–1.00  the trunk enters frame from the leading edge. Arrow accelerates.
```

- **Trail:** a `TubeGeometry` along the last 24 positions, additive, alpha 0 → .22 by velocity. Cheaper and more filmic than real motion blur.
- **Impact one-shot** (fires once at `act === 4 && actProgress < 0.02`): camera shake (`simplex` offset, amplitude .34 → 0 over 380ms) · 60 bark-chip particles on a gravity arc · one 40ms `--quarry-rust` screen flash at 12% opacity · the stag sprite bolting on a bezier out of the leading edge, scaling 1 → .72 · rail marker hard-stop. Fire it exactly once, guarded by a ref, and make it re-armable on scroll-back-up.
- **Audio:** optional, **default muted**, one persistent toggle in the header. If enabled: forest ambience bed, a bowstring creak that pitch-rises with draw tension, one release *thwip*, one wooden *thock* at impact. Never autoplay. Never gate content on it.

---

## 6. THE STORYBOARD — BEAT BY BEAT

For each beat: what the canvas does, what the DOM does, and the copy. Copy is canonical English; §9 covers the other three languages.

---

### BEAT 00 · THE CHOOSING — `0.000–0.080`
**Scene:** `00-choosing.png`. Camera settles from a 4% over-scale with a slow 2.5s drift down and inline-end. God rays at 70%. Pollen active.

**DOM:** Hero. Because the hunter occupies the frame's inline-start, all type sits inline-end in a 46ch column. Below it, a row of **four archetype cards**: Hunter (active, `--instrument` hairline, 1.0 opacity) and Engineer, Commander, Sage (56% opacity, grayscale .7). Hovering a dimmed card lifts it 6px and warms its own hairline to its real accent — the only place those three colours ever appear.

```
eyebrow   NAVRYA · CHOOSE YOUR ARCHETYPE
hero      You don't need a better entry.
          You need a better record.
sub       A local-first journal for people who trade Bitcoin intraday and are
          tired of learning the same lesson twice.
cta       Enter as the Hunter          (primary, --instrument fill, --void text)
cta2      Read the field manual        (ghost, --amber hairline)

cards
  HUNTER      Patient. Tracks the setup, not the candle.        [ SELECTED ]
  ENGINEER    Systematic. Trusts the checklist over the mood.   In the app
  COMMANDER   Decisive. Executes the plan already written.      In the app
  SAGE        Reflective. Reads the market's psychology first.  In the app

footnote  All four keep the same journal. This is the Hunter's path through it.
```

The scroll cue is the bowstring rail's nock marker beginning to travel — no bouncing chevron, no "scroll" label.

---

### BEAT 01 · THE OPENING — `0.080–0.180`
**Scene:** crossfade `00-choosing → 01-opening` over `actProgress 0.1–0.55`. Camera dollies **forward and inline-end**, canopy opening. Haze lifts 30%. God rays swell to 100%. The stag resolves out of the mist in the final 20% — bring it up on its own alpha ramp so the eye finds it late, the way it would in a real meadow.

**DOM:** almost nothing. One centred act title, one line. This is the page's first silence — protect it.

```
act       01 — THE OPENING
title     There it is.
line      The setup you've been waiting for shows up about four times a week,
          and you will be tempted to shoot the moment you see it.
```

---

### BEAT 02 · THE DRAW — `0.180–0.420` · **3 features**
**Scene:** crossfade to `02-draw.png`. Slow, continuous **dolly-in** across the entire beat (camera z −2.6 → −0.9). Depth-parallax strength ramps 0.03 → 0.075, so the closer we get, the more dimensional it becomes. DOF engages, focus locked on the arrowhead. If the 5-frame draw sequence exists, crossfade through frames at `actProgress` 0.10 / 0.32 / 0.54 / 0.76 / 0.92. Bowstring rail bows to full curvature.

**DOM:** three cards enter one at a time in the inline-end column, each pinned for ~30% of the act. Enter: `y +36px, opacity 0, blur 6px` → rest, 1100ms *draw* easing, stagger 90ms across eyebrow / headline / body / chip. Exit: fade only, no movement.

```
act       02 — THE DRAW
title     Everything that decides the outcome happens here.

┌ 01 — PREPARATION
│ Write the scenario before the candle
│ Open a session, attach your 5m through 1D charts, and log scenarios that can
│ be proven wrong. Probability is append-only, so you can see every time you
│ talked yourself into a different story.
│ chip: Nothing overwritten. Every revision kept.

┌ 02 — MARKET COGNITION
│ Name the pattern, then defend it
│ Build reusable patterns with ordered stages, completion thresholds and
│ reference screenshots. Each one carries its own report: how often it actually
│ occurred, and what the linked trades did afterwards.
│ chip: Insufficient data stays insufficient — no fabricated zeroes.

┌ 03 — STRATEGY
│ One playbook for each way you trade
│ Every strategy owns its position management, risk limits, framework, training
│ and detection history separately. Delete a strategy and the trades behind it
│ survive, unlinked.
│ chip: 72-hour detection funnel per strategy.
```

---

### BEAT 03 · THE FLIGHT — `0.420–0.640` · **2 features + inline product screens**
**Scene:** the release, then the long flight (§5.5). `03-flight.png` becomes the moving world; the 3D arrow rides in front of it, dead horizontal, dead centre. The arrow **is the page's horizon**.

**DOM — this is the layout signature of the beat:** a 3-row grid pinned to the arrow's screen-space y.

```
        ┌──────────────── feature text ────────────────┐
════════╡  the 3D arrow — the horizon line, centred    ╞════════
        └────────── product screenshot, tilted ────────┘
```

Text sits above the shaft, the screenshot below it, both entering from the leading edge with the arrow's own velocity. Two features, ~45% of the act each.

```
act       03 — THE FLIGHT
title     The part everyone thinks is the whole job.

┌ 04 — THE MATH
│ Size it before you feel it
│ Enter any two values and the calculator solves the rest — stop distance, risk
│ amount and percent, position size, leverage, isolated liquidation, weighted
│ multi-target R:R, round-trip commission and breakeven.
│ chip: Eight bidirectional passes. Fields you lock stay locked.
│ screen: desktop-session.png

┌ 05 — EXECUTION
│ Log the trade you actually took
│ The wizard captures status, timeframe, the patterns you saw, screenshots, and
│ the three emotions running the show. In a hurry? Quick-log costs you
│ discipline score — deliberately.
│ chip: Emotions append-only · stress, focus, commitment scored 1–10.
│ screen: mobile-wizard.png
```

---

### BEAT 04 · THE MISS — `0.640–0.800` · **3 features**
**Scene:** impact one-shot (§5.5), then settle into `04-miss.png`. Camera holds still — after the shake, absolute stillness. The stag exits. Haze returns. Light drops 15% cooler. **Cut the god rays to 40%** — the page gets quieter and colder here, and that shift is the whole emotional pivot.

**DOM:** a hard typographic break. The act title is set at hero scale, alone, for a full viewport before any feature appears. Give it room.

```
act       04 — THE MISS
title     You missed.
line      Most traders close the chart and open a new one. That reflex is the
          single most expensive habit in this business — and it is the only
          thing this section exists to interrupt.

┌ 06 — AFTER THE SHOT
│ The reflection fires when the trade closes
│ Not while you're logging the next one. One post-trade prompt, one cool-down
│ timer, and a monthly checklist of the seven biases most likely to be running
│ you right now.
│ chip: Written to avoid diagnostic language. It is a mirror, not a verdict.

┌ 07 — SELF-KNOWLEDGE
│ A profile built from what you already did
│ Intake once, then continuous tracking: triggers, red flags and pre-trade
│ context — each one carrying the trade IDs that justify it. Distress language
│ routes to a calm card and a human referral, never to an analysis.
│ chip: Evidence attached to every flag.      [ --quarry-rust hairline ]

┌ 08 — REVIEW
│ Equity, funnel, calendar, everything
│ Filter by week, month, quarter, custom range or pattern. Watch detection
│ become open become closed. Days coloured by P&L intensity, every trade one
│ click from its own screenshots.
│ chip: Drawn on canvas. No charting library, no upsell.
│ screen: desktop-reports.png
```

---

### BEAT 05 · THE FIELD KIT — `0.800–0.900`
**Scene:** the world recedes — camera pulls back, `04-miss.png` desaturates to 40% and blurs to 8px. This beat is deliberately the least cinematic: the product steps forward and the forest becomes wallpaper. That contrast is the point.

**DOM:** the device showcase. A desktop frame (CSS/SVG, 16:10, thin `--moss-deep` bezel, subtle `--instrument` power hairline) tilted `rotateY(direction * -9deg) rotateX(4deg)` with a scroll-driven ±3° sway, and a phone frame overlapping its inline-start corner at `rotateY(direction * 7deg)`. Both cast a long soft shadow onto nothing — they float.

A **live language switcher** sits under the frames: four chips (فارسی · العربية · English · Español). Clicking one **switches the entire page's language and direction in place, animating the whole layout mirror** — and the screenshots inside the frames swap to that language's capture. This is the single best proof of the product's i18n and the most delightful interaction on the page. Build it properly.

```
act       05 — THE FIELD KIT
title     Four languages. Both directions. One journal.
line      Persian, Arabic, English and Spanish — with real right-to-left layout,
          localized rank titles, Jalali and Gregorian dates side by side, and
          market clocks on live IANA zones for New York, London, Tokyo and Sydney.
chips     Local-first · works with the server unreachable
          Your charts, patterns and trades stay in your browser first
```

---

### BEAT 06 · THE LONG HUNT — `0.900–1.000`
**Scene:** crossfade to `05-return.png`. Slow dolly forward down the forest path, god rays back to 100% and warm. Particles thin out. The camera ends still, looking down the path — the shot deliberately doesn't resolve.

**DOM:** the XP/mastery block, community, CTA, footer.

```
act       06 — THE LONG HUNT
title     Seven levels. None of them buyable.

body      Experience only lands on complete, verifiable work: a session closed
          with a written outcome, a trade reviewed, a pattern resolved against a
          real scenario. Profit is worth nothing here. Win rate is worth nothing
          here. Volume is worth nothing here.

ladder    (a vertical rail, echoing the bowstring — 7 ticks, current-state empty)
          1  Newcomer                 0
          2  Market apprentice      100
          3  Analyst                300
          4  Disciplined trader     700
          5  Strategist            1500
          6  Trading master        3000
          7  Grand market master   6000

gate      Experience alone never levels you up. Level 6 additionally requires
          that no single domain accounts for more than 60% of your total — you
          cannot become a master of one thing and call it mastery.

┌ 09 — CONTRIBUTION
│ Publish a pattern only with its evidence
│ Listings carry the real occurrence rate and the sample size that produced it,
│ never a bare percentage. Rating something requires having bought it — enforced
│ in the database, not in the interface.

cta       Start your first session
cta2      Read the field manual
foot      Local-first · Persian, Arabic, English, Spanish · Built for intraday
          Bitcoin traders who keep receipts.
```

**Last frame:** after the footer, the bowstring rail's marker settles into a nocked-arrow-at-rest glyph and the `--instrument` accent fades to 40%. The hunt isn't over; you just stopped scrolling.

---

## 7. COPY VOICE — FOR ANY STRING NOT SPECIFIED ABOVE

Field manual, not marketing. Rules:

- Second person, present tense, verbs first.
- Specific over clever, always. "Eight bidirectional passes" beats "powerful calculations."
- Never these words: *seamless, effortless, revolutionary, game-changing, unlock, empower, journey, elevate, supercharge, leverage (as a verb), transform.*
- Never an exclamation mark. Never an em-dash used as excitement.
- Numbers are real or absent. If you don't have the number, cut the sentence.
- Buttons name their outcome: "Start your first session," never "Get Started."
- Empty and error states are directions, not apologies: "That screenshot is over 15 MB. Try a PNG under 15 MB." not "Oops! Something went wrong."
- The product never claims to make anyone money. Not once, anywhere, in any language.

---

## 8. FEATURE FACT SHEET — THE ONLY CLAIMS YOU MAY MAKE

Every number below is real. Do not exceed this list.

| Area | Verified facts available for copy |
|---|---|
| Sessions | Optional 5m/1h/4h/1D chart uploads · market, main timeframe · Gregorian + Jalali dates · update interval + grace period · elapsed and loop rings · timeline and report views · similarity alert at a configurable 70% default against the three closest past sessions |
| Scenarios | Falsifiable, with explicit invalidation conditions · probability is append-only history · pattern completion gates the position protocol against each pattern's own threshold |
| Pattern Registry | Ordered stages · completion thresholds · reference screenshots up to 15 MB · drag reorder · pattern-scoped chat · per-pattern report aggregating scenarios and linked trades · shows "insufficient data" instead of fabricated zeroes |
| Strategy Education | Multiple independent playbooks · each owns position management, risk & capital, overall framework, attachments, chat, AI summary and detection events · 72-hour detection funnel · deleting a strategy unlinks trades, never deletes them |
| Calculator | Up to 8 bidirectional solve passes · respects manually locked fields · stop distance, risk amount/percent, position size, margin/leverage, isolated-margin liquidation, weighted multi-TP R:R, round-trip commission, breakeven, commission-adjusted profit · returns `null` rather than `NaN` |
| Trade wizard | Status, timeframe (1m/5m/15m/1h/4h/1D), observed concepts and patterns, emotions, screenshots · quick-log applies a negative discipline impact · up to 3 dominant emotions · stress/focus/commitment normalized 1–10 · emotion log append-only |
| Open positions | Hunting → open → closed or cancelled · exit price and P&L on close · every card links to the full trade |
| Reports | Week / month / quarter / all-time / custom range / by pattern · detection→open→closed funnel · equity curve, pattern win rate, activity, all drawn on native canvas · calendar coloured by daily P&L intensity |
| Psychology | Optional intake · continuous tracking with pre-trade context · post-trade reflection on close, not before · cool-down timer · monthly checklist of 7 curated biases · red flags always carry the evidence that produced them · distress language triggers a calm, non-diagnostic card and a professional referral |
| AI assistant | Persistent dock on every page · fills open forms through a preview-and-approve step, never auto-applying · screenshot → pre-filled trade wizard · four providers (OpenAI, Anthropic, Kimi, DeepSeek) one click apart · bring your own key, stored only in your browser |
| Community | Listings show success rate paired with sample size, never a bare percentage · purchases are mock-only in this version · rating requires a real purchase, enforced by a database constraint · reporting available from day one |
| XP | 7 levels: 0 / 100 / 300 / 700 / 1500 / 3000 / 6000 · 6 domains · XP alone never levels you up · Level 6 requires no domain above 60%; Level 7 requires none above 50% and at least 15% each from reflection and planning · profit, win rate and trade count are never level requirements |
| Platform | Local-first: writes land in the browser first and sync in the background · works offline · Persian, Arabic, English, Spanish · IANA market clocks for New York, London, Tokyo, Sydney |

**Honesty requirements — state these plainly somewhere on the page, do not bury them:** marketplace purchases are mock-only in this version, and the AI assistant requires your own API key.

---

## 9. INTERNATIONALIZATION

### 9.1 Structure

```
src/i18n/
  provider.tsx      — context, <html lang dir>, persistence, Intl helpers
  en.json  fa.json  ar.json  es.json
```

Flat, semantic keys: `beat02.feature01.headline`. Never key by English text. Every string on the page — including alt text, aria-labels, the audio toggle, and the scroll hints — lives in the dictionaries. Zero hardcoded copy in components.

Persistence: `localStorage['tradejournal-landing-lang']`, defaulting to `navigator.language` matched against the four, then `en`. Switching sets `document.documentElement.lang` and `dir` and swaps the font stack via a `[lang]` CSS selector — no re-mount, no flash.

### 9.2 Translation brief

Translate the *intent and register*, never the words. The field-manual voice must survive in all four.

- **Persian (fa):** direct and warm, no formal literary register. Keep Latin technical terms as the app already does — Pattern Registry, Session, Setup, Risk, R:R, Stop Loss stay Latin; the surrounding sentence is Persian. Do not translate `Bitcoin`. Numerals stay Latin digits with `tnum`.
- **Arabic (ar):** Modern Standard, plain and instructional. Same Latin-term policy. Watch line-height: Arabic needs ~1.15× the Latin leading at every size.
- **Spanish (es):** neutral Latin American, `tú` not `usted` — this audience is peers, not clients.

Headline anchors so the tone is unmistakable (translate the rest to match these, not to match English literally):

| Key | en | fa |
|---|---|---|
| `hero.line1` | You don't need a better entry. | ورود بهتر مشکل تو نیست. |
| `hero.line2` | You need a better record. | ثبت بهتر مشکل توست. |
| `beat04.title` | You missed. | زدی و نخورد. |
| `beat06.title` | Seven levels. None of them buyable. | هفت سطح. هیچ‌کدام خریدنی نیست. |

### 9.3 RTL — the cinematography mirrors too

This is the detail that will separate this build from every other multilingual site. Under `dir="rtl"`, `direction` in the scroll store flips to `−1` and:

- Every scene plane gets `scale.x = -1` — **the hunter now faces inline-start in both directions and the arrow flies right-to-left.** The composition is mirrored, not just the text.
- The bowstring rail moves to the right edge and bows the other way.
- All entrance transforms flip sign; all `padding-inline` / `margin-inline` / `inset-inline` logical properties do the work automatically — no `left`/`right` anywhere in CSS.
- Device frames tilt the other way; the phone overlaps the desktop's other corner.
- **Do not mirror:** product screenshots (they contain their own correctly-directioned UI), the wordmark, and the four archetype card portraits (faces must not flip).

Test all four languages at 375px, 768px, 1440px and 2560px before calling any phase done.

---

## 10. PERFORMANCE, TIERS, ACCESSIBILITY

### 10.1 Device tiers

Detect once on mount (WebGL2 support, `deviceMemory`, `hardwareConcurrency`, `matchMedia('(pointer:coarse)')`, DPR) and store in `tier`.

| | `high` | `mid` | `low` | `static` |
|---|---|---|---|---|
| DPR cap | 2 | 1.5 | 1 | — |
| Depth parallax | yes | yes | no (flat) | — |
| Cut-out layers | yes | yes | no | — |
| Particles | 2900 | 1200 | 350 | 0 |
| God ray cones | 6 | 4 | 2 | 0 |
| Post FX | all | no DOF | Bloom + Vignette only | none |
| 3D arrow | yes | yes | yes (no trail) | SVG |

`static` triggers on `prefers-reduced-motion: reduce`, WebGL failure, or a sustained sub-24fps reading. In `static` the canvas never mounts: scenes become `<img>` backdrops with a per-section 400ms opacity fade, the arrow beat becomes a static SVG rail, and the page is a straightforward, beautiful long-form document. **Verify it looks intentional, not broken.**

### 10.2 Budgets

- LCP < 2.0s on a 4G laptop; INP < 200ms; CLS < 0.02.
- Initial JS ≤ 260 KB gzipped. Lazy-load `three` + R3F behind the hero — the hero paints as an `<img>` first and the canvas takes over on load.
- Textures: AVIF with WebP fallback, max 2400px on the long edge, per-act lazy load with a two-act look-ahead. Depth maps: 1024px grayscale WebP.
- If a scrub video is used, encode with all-keyframe H.264 (`-g 1 -bf 0`) plus WebM/VP9, `preload="auto"`, `playsInline`, `muted` — and **never** rely on video on iOS Low Power Mode; the frame-sequence tier must cover it.
- Preloader: the bowstring rail drawing itself from 0 to full height. No spinner, no percentage.

### 10.3 Accessibility floor

Non-negotiable: visible `--instrument` focus rings (2px, 2px offset) on every interactive element · full keyboard path through archetype cards, rail ticks, language chips and CTAs · a skip link to the content layer · every scene image has meaningful `alt` in the active language · the canvas is `aria-hidden` · the rail is `<nav aria-label>` with real anchors · AA contrast verified against the brightest frame of each scene · reduced-motion fully honoured · never trap or hijack the scroll — no scroll-jacking to snap points, no disabled native scrolling.

---

## 11. FILE STRUCTURE

```
landing/
├─ index.html
├─ vite.config.ts
├─ public/
│  ├─ scenes/           00-choosing.png … 05-return.png
│  │  ├─ depth/         *.depth.png            (optional)
│  │  ├─ seq/           draw-01…05.webp        (optional)
│  │  ├─ layers/        00-fg|mid|bg.png       (optional)
│  │  ├─ portrait/      *.png                  (optional)
│  │  └─ video/         *.mp4 | *.webm         (optional)
│  ├─ app/              desktop-*.png · mobile-*.png
│  ├─ tex/              pollen.png · shaft.png · grain.png · noise.png
│  └─ fonts/            *.woff2
└─ src/
   ├─ main.tsx  ·  App.tsx
   ├─ assets/manifest.ts          ← fallback chains (§3.3)
   ├─ store/scroll.ts  ·  store/tier.ts
   ├─ i18n/provider.tsx  ·  en|fa|ar|es.json
   ├─ styles/tokens.css  ·  reset.css  ·  type.css
   ├─ scroll/lenis.ts  ·  useScrollBinding.ts
   ├─ canvas/
   │  ├─ Stage.tsx                 ← <Canvas>, camera rig, act machine
   │  ├─ ScenePlane.tsx  ·  shaders/parallax.glsl.ts
   │  ├─ Arrow.tsx  ·  Trail.tsx  ·  Impact.tsx  ·  Stag.tsx
   │  ├─ GodRays.tsx  ·  Particles.tsx  ·  Haze.tsx
   │  └─ Effects.tsx
   ├─ ui/
   │  ├─ BowstringRail.tsx         ← THE SIGNATURE (§4.4)
   │  ├─ Header.tsx  ·  LanguageSwitcher.tsx  ·  AudioToggle.tsx
   │  ├─ ArchetypeCards.tsx  ·  FeatureCard.tsx  ·  ProofChip.tsx
   │  ├─ DeviceFrame.tsx  ·  XPLadder.tsx  ·  CTA.tsx  ·  Footer.tsx
   │  └─ Scrim.tsx
   └─ beats/  Beat00.tsx … Beat06.tsx
```

---

## 12. BUILD PHASES — STOP AND SHOW WORK AFTER EACH

Do not skip ahead. Each phase ends with `npm run build` green, a screenshot, and a two-line self-critique naming the weakest thing you just made.

| # | Deliverable | Done when |
|---|---|---|
| **0** | Scaffold · tokens · fonts · i18n with all four dictionaries fully populated · the entire page as a static long-scroll document with real copy, real images as `<img>`, zero animation | Reads beautifully with JS animation disabled. This is the `static` tier and it must already be a site you'd ship. |
| **1** | Lenis + scroll store + GSAP DOM reveals + **the Bowstring Rail**, including its bow, snap and oscillation | The rail alone tells the story. Scrub up and down 20×: no drift, no stuck states. |
| **2** | `<Canvas>`, scene planes, act state machine, shader crossfades, camera curve | Six scenes transition cleanly. No milky double-fades. Camera moves feel weighted. |
| **3** | Depth parallax · cut-out layers · god rays · particles · haze · post FX | Stills read as dimensional. Take a screenshot mid-transition and compare it against the source PNG — the grade must be identical. |
| **4** | The 3D arrow · camera follow · trail · impact one-shot · stag exit | The release lands physically. Test scroll-back-up: the impact re-arms correctly. |
| **5** | Field Kit devices · product screenshots · in-place live language switching | Switching to Persian mirrors composition, arrow direction and rail, with no reflow jump. |
| **6** | Tier system · reduced motion · a11y sweep · perf budgets · four languages × four breakpoints | Lighthouse ≥ 95 on Performance and 100 on Accessibility. All 16 language×breakpoint combinations screenshotted. |

---

## 13. FINAL SELF-CRITIQUE — RUN THIS BEFORE YOU CALL IT DONE

Answer each honestly in writing. Fix anything that fails.

1. If I removed all the copy, would the animation alone still tell the story of a hunter who prepares, shoots, misses, and writes it down?
2. Is `#79DF59` still exclusively an instrument colour, or did it leak into the imagery?
3. Is the Bowstring Rail genuinely the one signature, or did I add a second flourish? (Remove one accessory.)
4. Does any sentence on this page sound like it could appear on any other SaaS site? Rewrite it.
5. Does the Persian version look **designed**, or does it look like the English version with the text swapped?
6. In `static` tier, does the page look deliberate or degraded?
7. Is there any number on this page that isn't in §8?
8. Does the miss still feel like the emotional centre — or did I accidentally make the hit the hero?
