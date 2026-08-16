# ASSET PROMPT PACK — "THE HUNT"

Companion to `01_MASTER_BUILD_PROMPT.md`. Everything here produces assets that must be **indistinguishable in grade and world** from your six existing stills.

> **The single most important rule:** always pass your existing images as a style reference. Prompt text alone will not hold consistency across 30 assets.
> - **Midjourney:** append `--sref <url of 02-draw.png> --sw 120 --style raw --ar 3:2 --v 7`
> - **Flux / Nano Banana / Gemini:** attach 2–3 of the stills and open with *"Match the exact art direction, colour grade, lighting and character design of the attached reference images."*
> - **Runway / Kling / Veo:** use the still itself as the **first frame** (image-to-video). Never text-to-video for these.

---

## 0. LOCKED STYLE DNA — append to every image prompt

```
STYLE: cinematic fantasy realism, painterly-photoreal hybrid, matte-painting
finish. Dense temperate broadleaf forest at golden-hour sunrise. Heavy
volumetric god rays cutting through the canopy, low ground mist, airborne
pollen catching the light. Colour grade is warm and almost monochrome-amber:
crushed olive-black shadows (#0B0A05), bark and moss midtones (#2E2A1C to
#4B432B), warm leather highlights (#8D7E64 to #C0A57A), pale gold atmospheric
haze (#F2DBAD). Foliage is DESATURATED OLIVE, never bright or saturated green.
Subject strongly backlit with a clean rim light. Shot on 35mm anamorphic,
shallow depth of field, natural lens flare, fine film grain, subtle halation
in the highlights. Moss-covered bark, wet stone, dew. Muted, earthy, reverent,
still. No text, no watermark, no logo, no UI, no modern objects.
--ar 3:2, ultra detailed, 8k
```

## 0b. LOCKED CHARACTER DNA — append whenever the hunter is in frame

```
CHARACTER: one lone human archer, male, mid-thirties, weathered skin, only the
eyes visible. Hood of a dark charcoal-green cloak pulled up; the cloak's hem is
torn into long ragged strips. Layered scale and lamellar leather armour in
near-black with faint aged-gold stitching and small brass fittings. Dark green
cloth mask across nose and mouth. Quiver of feather-fletched arrows over the
right shoulder. Dark carved-wood recurve longbow. Heavy leather bracers and
gloves, wide belt with a round brass buckle, tall worn leather boots.
Exactly the same character, costume and proportions in every frame.
```

---

## 1. PRIORITY A — needed for a complete Beat 00

### A1 · Engineer archetype card
```
Portrait of a lone figure standing at the edge of the same misted forest valley
at golden-hour sunrise, three-quarter view, backlit, framed left of centre with
open valley to the right. A precise, methodical builder-scout: dark canvas and
oiled-leather coat over a fitted jerkin, brass-and-steel instruments on a wide
belt — calipers, a folding rule, a small sighting device on a lanyard. Short
practical hair, no hood, clean-shaven, calm analytical expression, a leather
document satchel across the chest. Grounded, unhurried posture, one hand
resting on the satchel. Same world, same light, same grade as the reference —
this figure is a peer of the hooded archer, from the same story.
[STYLE DNA]
```
*Note:* his card hairline is `#398CFF` in the UI — **do not** put blue in the image. The colour lives only in the interface.

### A2 · Commander archetype card
```
Portrait of a lone figure standing on a rocky outcrop above the same misted
forest valley at golden-hour sunrise, three-quarter view, backlit, framed left
of centre. A field commander: dark weathered plate-and-leather half-armour with
a heavy pauldron on one shoulder, a long deep-charcoal campaign cloak lifting
slightly in the wind, a sheathed longsword at the hip, a rolled map tucked
under one arm. Bare-headed, short grey-streaked hair, hard steady gaze fixed on
the valley. Upright, decisive stance. Same world, same light, same grade as the
reference.
[STYLE DNA]
```

### A3 · Market Sage archetype card
```
Portrait of a lone figure standing among the roots of an enormous ancient oak
at the forest's edge at golden-hour sunrise, three-quarter view, backlit,
framed left of centre with the misted valley beyond. An elder scholar-observer:
long layered robes of undyed wool and dark linen, a worn shawl, a heavy leather-
bound book held closed against the chest, a string of small carved wooden beads
at the wrist. Long grey hair and beard, deeply lined face, eyes half-closed as
if listening rather than looking. Still, patient, weightless posture. Same
world, same light, same grade as the reference.
[STYLE DNA]
```

### A4 · Portrait mobile crops — **all six scenes**
Do not crop in code. For each of the six stills:
```
Recompose this exact scene as a vertical 9:16 frame. Keep the subject, the
light direction, the grade and every element identical — extend the canopy
upward and the forest floor downward to fill the taller frame. The subject must
sit in the lower two-thirds with clean negative space above for text.
[STYLE DNA]  --ar 9:16
```
Save as `public/scenes/portrait/00-choosing.png` … `05-return.png`.

---

## 2. PRIORITY B — the draw sequence (Beat 02's biggest upgrade)

Five frames, cross-faded on scroll. Generate each from `02-draw.png` as the reference so camera position, background and grade never shift.

| File | Prompt (append STYLE DNA + CHARACTER DNA) |
|---|---|
| `seq/draw-01.webp` | *Identical camera, identical background, identical framing to the reference. The archer has just nocked the arrow — bowstring completely at rest, bow arm extended but relaxed, drawing hand at the string with no tension, arrow lying level on the rest. Eyes down the shaft. Shoulders soft.* |
| `seq/draw-02.webp` | *Identical camera and background. Quarter draw — the string has moved back roughly a hand's width, the bow limbs have begun to flex, the drawing forearm has engaged. Slight tension entering the shoulders.* |
| `seq/draw-03.webp` | *Identical camera and background. Half draw — string clearly back, bow limbs visibly bent, back muscles engaged, the cloak pulled taut across the shoulder blade. Jaw set.* |
| `seq/draw-04.webp` | *Identical camera and background. Three-quarter draw — deep limb flex, drawing hand approaching the jaw, forearm tendons visible through the glove, breath held. Maximum visible strain in the fletching-side hand.* |
| `seq/draw-05.webp` | *Identical camera and background. FULL DRAW at anchor — drawing hand locked against the jaw beneath the ear, bow limbs at maximum flex, the whole body a single loaded line, absolute stillness, eye locked down the shaft past the arrowhead. This is the held moment before release.* |

Export: WebP, 2400px long edge, quality 82. Keep the file order — the site cross-fades them at `actProgress` 0.10 / 0.32 / 0.54 / 0.76 / 0.92.

---

## 3. PRIORITY B — the stag sprite (Beat 04's exit animation)

Three poses, **each on a flat mid-grey background you will key out**:
```
A large red deer stag with a full wide antler rack, side profile, [POSE],
lit from behind by low golden sunrise light with a strong warm rim light along
the back, spine and antlers. Realistic anatomy and coat, damp fur, breath
visible in cold air. Isolated on a plain flat neutral mid-grey background
(#808080), evenly lit background, no shadow cast on the background, subject
edges crisp and fully separated for masking. Same grade and light direction as
the reference forest images.
--ar 3:2
```
`[POSE]` = `standing alert, head raised, ears forward` · `mid-stride bolting away, all four legs off the ground, head low` · `at full gallop seen from three-quarter rear, tail up`

Then: remove background → PNG with alpha at 1600px wide → `public/tex/stag-01.png` … `stag-03.png`.

---

## 4. PRIORITY B — cut-out layers for parallax

Only for the two hero frames, `00-choosing` and `04-miss`. For each, generate three matched plates:

```
FOREGROUND — Reproduce ONLY the extreme foreground of this scene: the
overhanging branches, leaves and foliage that frame the top and edges, plus the
nearest ground vegetation. Everything else fully transparent. Identical
lighting, identical leaf shapes, identical grade.

MIDGROUND — Reproduce ONLY the subject and their immediate ground: [the hooded
archer and the rock he stands on / the mossy trunk with the arrow embedded in
it]. Everything else fully transparent. Identical pose, costume, lighting.

BACKGROUND — Reproduce this scene with the foreground foliage and the subject
COMPLETELY REMOVED, painting in the forest, mist and valley that would sit
behind them. Fully continuous, no holes, no ghosting where the subject was.
```
Save as `public/scenes/layers/00-fg.png`, `00-mid.png`, `00-bg.png` (and `04-*`). PNG with alpha, 2400px.

*Faster alternative:* do the cut-outs by hand in Photoshop (Select Subject → refine hair on the cloak strips → generative fill the background). For two frames this is usually quicker and cleaner than prompting.

---

## 5. PRIORITY A — depth maps (the single biggest 3D win per minute spent)

**Do not prompt these.** Generate them properly:

1. Run each of the six stills (plus any portrait crops) through **Depth Anything V2** or **MiDaS 3.1** — Hugging Face Spaces, ComfyUI, or `transformers` locally.
2. Export 16-bit grayscale, then convert to **8-bit grayscale WebP, 1024px long edge**.
3. **Gaussian blur 2px.** Un-blurred maps produce visible stair-stepping in the parallax shader.
4. Verify polarity: **white = near, black = far.** Invert if your tool outputs the opposite.
5. Hand-fix the character silhouette in the two hero frames — the model usually smears the cloak's torn strips into the background, which reads as a rubbery edge when the camera moves.

Save to `public/scenes/depth/00-choosing.depth.png` etc. Missing files degrade silently to a flat plane (see `manifest.ts`).

---

## 6. PRIORITY C — textures

| File | How to make it |
|---|---|
| `tex/pollen.png` | 256×256, radial white→transparent gradient, slightly irregular edge, ~4% noise. Photoshop or a 10-line canvas script. |
| `tex/shaft.png` | 512×2048, soft vertical white gradient with faint horizontal streaking — the alpha for the god-ray cones. |
| `tex/grain.png` | 512×512 tiling monochrome film grain, ~4% amplitude, seamless. |
| `tex/noise.png` | 512×512 seamless simplex/curl noise, used for haze drift and camera shake. |
| `tex/bark-chip.png` | 128×128, five small irregular dark-brown wood splinters on transparent, for the impact burst. |

---

## 7. VIDEO — the top tier (optional but transformative)

Three short clips, scrubbed by `video.currentTime` against scroll. Always **image-to-video with your still as frame 1**.

### V1 · The draw and release — `scenes/video/draw.mp4`
```
Start from this exact frame. The archer draws the bowstring back in one slow,
controlled motion over three seconds — the bow limbs bend, the cloak pulls taut
across his back, his drawing hand comes to anchor beneath his jaw. He holds,
completely still, for one second. Then he releases: the string snaps forward
and the arrow leaves frame. He remains in his follow-through.
Camera: locked off, no movement. Only the archer and the drifting pollen move.
5 seconds, 30fps, cinematic, no cuts, no camera shake, no zoom.
```

### V2 · The arrow's flight — `scenes/video/flight.mp4`
```
Start from this exact frame. A tracking shot flying alongside an arrow in
flight, the arrow held perfectly horizontal and stationary in the centre of the
frame while the forest streaks past behind it with strong horizontal motion
blur. The arrow rotates very slowly around its own axis; the fletching
flutters. Warm sunrise light flickers across the shaft as it passes through
gaps in the canopy.
Camera: locked to the arrow, moving fast laterally. 4 seconds, 30fps, no cuts.
```

### V3 · Impact and the stag's escape — `scenes/video/miss.mp4`
```
Start from this exact frame. The arrow strikes the mossy tree trunk with a hard
impact — the shaft buries itself and vibrates rapidly, bark chips and moss burst
outward and fall. In the background the stag flinches, wheels, and bolts away
across the meadow into the mist. Dust and pollen swirl in the disturbed air.
Camera: locked off, a single small jolt on impact, then completely still.
5 seconds, 30fps, no cuts.
```

### V4 · Ambient loop — `scenes/video/ambient.mp4` (optional)
```
Start from this exact frame. Absolutely nothing happens except the living
forest: mist drifts slowly across the meadow, pollen floats through the light
shafts, leaves stir faintly, the god rays shift as the canopy moves. The
character does not move.
Camera: completely locked off. 8 seconds, seamless loop, 30fps.
```

### Encoding — required for smooth scrubbing
```bash
ffmpeg -i draw_raw.mp4 -c:v libx264 -crf 20 -g 1 -bf 0 -pix_fmt yuv420p \
       -movflags +faststart -an draw.mp4
ffmpeg -i draw_raw.mp4 -c:v libvpx-vp9 -crf 32 -b:v 0 -g 1 -an draw.webm
ffmpeg -i draw.mp4 -vf "select=eq(n\,0)" -q:v 2 draw-poster.jpg
```
`-g 1 -bf 0` makes every frame a keyframe. Without it, `currentTime` scrubbing stutters badly. The file gets large — keep clips ≤ 5s and cap the long edge at 1440px.

**iOS caveat:** Low Power Mode blocks programmatic video playback. The frame-sequence tier (§2) must be able to carry the experience on its own, so treat video as the top tier, never the only one.

---

## 8. SOCIAL & BRAND

| File | Prompt / spec |
|---|---|
| `public/og.png` (1200×630) | Crop `02-draw.png` to 1.91:1 with the archer in the inline-start third; overlay the wordmark and *"You don't need a better entry. You need a better record."* in Young Serif, `--sunhaze`, over a `--void` scrim. Produce one per language. |
| `favicon.svg` | A single 24×24 line glyph: a bowstring at full draw, `--instrument` on `--void`. Not a bow-and-arrow clipart — just the bent string and the nocked shaft. |
| `apple-touch-icon.png` | 180×180, same glyph, `--void` field. |

---

## 9. PRODUCTION ORDER

Build the site with only the six stills first. Then add assets in this order — each one visibly upgrades the page with zero code changes:

1. **Depth maps** (×6) — the biggest 3D gain per hour of work.
2. **Portrait crops** (×6) — unlocks a properly art-directed mobile experience.
3. **Three archetype cards** — completes Beat 00.
4. **Stag sprite** (×3) — completes the Beat 04 emotional payoff.
5. **Draw sequence** (×5) — makes Beat 02 feel authored rather than static.
6. **Cut-out layers** (×6) — real occlusion parallax on the two hero frames.
7. **Textures** (×5) — atmosphere polish.
8. **Video** (×3) — the top tier, only after everything above is done.
