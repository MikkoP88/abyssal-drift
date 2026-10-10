# Visual Quality & Art Direction Analysis — Commercial Fishing Games vs. Abyssal Drift

Date: 2026-10-08 · Method: Steam store screenshots (curl-downloaded to `research/visuals/<game>/`), viewed and annotated. Appids corrected from task list (stale IDs): UFS2=1136380, Fishing Planet=380600, Euro Fishing=314520, Bassmaster 2022=1449500, MSFS(2020)=1250410. RDR2=1174180 and Valheim=892970 were correct.

Trailers: all seven games host trailers on Steam's own CDN (no YouTube embeds on store pages). Notable: UFS2 "Release Trailer" (Steam movie id 256901163); RDR2 "60 FPS Trailer" + "Launch Trailer"; Valheim "1.0 Out Now" / "Deep North Animated Trailer" (also referenced on YouTube as `gsSWz6sfu-U` and `E_Lb7xrSvZI` in store news posts). Community workshop water-shader images could NOT be fetched anonymously (steamcommunity.com workshop requires login) — Valheim's official Deep North shots serve as the community-shader proxy.

---

## 1. Per-Game Visual Breakdown

### 1.1 Ultimate Fishing Simulator 2 (app 1136380)

**ufs2-shot1.jpg** (underwater, trout)
- Lighting: dim teal-green underwater attenuation; soft top-down light shafts; no caustics.
- Water: volumetric absorption (green→dark with depth), suspended particulate motes drifting in beam.
- Detail: submerged logs + reeds with depth-of-field falloff; fish scales individually speckled, red lateral band.
- Atmosphere: heavy depth fog, floating particles — the single most "deep-sea" image in the set.

**ufs2-shot2.jpg** (player holding shark on beach)
- Lighting: harsh tropical noon; strong leaf-shadow dappling on sand.
- Water: shallow turquoise, visible sandy bottom through transparency.
- Fidelity: shark skin has realistic mottling + specular sheen; character model is visibly lower-fi (flat face, simple shirt) — the gap between creature and character art.
- Vegetation: banana palms, dense foliage, wet-sand texture with footprint detail.

**ufs2-shot3.jpg** (FPV fish on scale, alpine lake)
- Lighting: bright day, slight lens-fringing chromatic aberration at frame edges (post FX).
- Water: mirror-calm with crisp tree/mountain reflections; submerged rocks visible near shore (depth-based transparency).
- Vessel/props: detailed rod, digital scale UI (green LCD) — diegetic HUD.
- Terrain: snow-capped peaks, wooden bridge, mossy boulders — high-poly, PBR-textured.

**ufs2-shot4.jpg** (FPV rod, tropical cove)
- Lighting: midday blue sky, soft cumulus.
- Water: calm turquoise bay; cliff reflections sharp; no foam, no sun path.
- Terrain: weathered rock cliffs with vegetation patches, palm clusters of palms.

**ufs2-shot5.jpg** (jungle vista to lagoon)
- Lighting: god-ray shafts through canopy; strong rim light on foreground leaves.
- Water: lagoon visible through trees, calm, pale turquoise.
- Atmosphere: volumetric haze in the mid-ground — their best "AAA feel" shot.
- UI: none (cinematic framing).

### 1.2 Fishing Planet (app 380600)

**fp-shot1.jpg** (dawn pond, dock)
- Lighting: low golden sun, volumetric mist over water, god rays through trees.
- Water: near-still, full mirror reflection of treeline; lily pads; muddy-brown shallow tint near bank.
- Vegetation: dense cattails/grasses with individual blades; worn wooden dock with rot.
- Atmosphere: ground-hugging fog — the key mood-maker.

**fp-shot2.jpg** (lake house at sunrise)
- Lighting: dramatic sunburst + god rays; warm rim light on every tree edge.
- Water: ripples break the reflection into shimmering bands; dock + rowboat with soft contact shading.
- Props: weathered rowboat (plank wear), house with porch furniture, deck chairs.
- Atmosphere: layered fog planes; strongest "pretty" shot of the fishing set.

**fp-shot3.jpg** (charter boat offshore)
- Lighting: bright day, high sun.
- Water: deep teal open ocean, whitecaps on wave crests, choppy swells — the best fishing-game ocean shot in the set.
- Vessel: full fishing charter with T-top, outriggers, rigging wires, radar, crew NPCs; hull wrap decal (purple "Chameleon").
- Detail: lighthouse on distant island; cloud cover realistic altocumulus.

**fp-shot4.jpg** (resort pier at sunset)
- Lighting: sunset flare, long dock perspective; sun glitter path across water.
- Water: vivid turquoise, sun-glitter sparkle band from horizon to pier.
- Props: detailed pier railings, resort building, flags, surfboards, loungers.

**fp-shot5.jpg** (night fjord bridge, aurora)
- Lighting: night; aurora borealis (green/purple curtains) as sky light source; bridge lamps as point lights.
- Water: dark, subtle lamp reflections, star field.
- Atmosphere: moody, low-detail geometry readable in darkness — proves night scenes sell on light sources, not geometry.

### 1.3 Euro Fishing (app 314520)

**ef-shot1.jpg** (pond at morning)
- Lighting: high sun with hexagonal lens-flare artifacts (cheap post FX, noticeable).
- Water: milky teal, lily pads, calm; no visible sun path.
- Vegetation: grasses, thistle flowers in foreground, birch trees; fence posts.
- Overall: competent mid-fi; flatter lighting than FP/UFS2.

**ef-shot2.jpg** (third-person angler casting on dock)
- Lighting: flat overcast-ish day; minimal shadows.
- Water: calm blue-green; visible cast-target reticle (thin white ring) on surface — diegetic aiming aid.
- Character: full-body third person, decent proportions, simple clothing.
- Props: plank dock with metal bolts; reed beds.

**ef-shot3.jpg** (lake shore vista)
- Lighting: soft morning haze, pale sky.
- Water: glassy, faint far-shore reflection.
- Vegetation: ferns, birches, wildflowers — good density, lower texture resolution.
- Atmosphere: distance haze flattens the far shore.

**ef-shot4.jpg** (angler on dock, river channel)
- Lighting: bright day, washed-out highlights.
- Water: teal channel with floating leaf litter/debris on surface (nice detail touch).
- UI: circular interaction prompt (hand icon) top-right — minimal, diegetic.
- Character: waders, rod with spinning reel; wet-dark patches on dock planks.

### 1.4 Bassmaster Fishing 2022 (app 1449500)

**bm-shot1.jpg** (dawn tournament dock)
- Lighting: pink/lavender pre-dawn; calm water mirror-reflecting bridge + pylons.
- Vessels: two bass boats (Falcon hulls, Yamaha outboards, trolling motors, gunwale details) — highest boat fidelity of the fishing set.
- Props: branded feather banners (Mercury), dock pilings, distant bridge.
- Water: perfectly still dawn water, long soft reflections.

**bm-shot2.jpg** (pro angler portrait)
- Lighting: soft daylight, shallow depth-of-field (bokeh) — cinematic.
- Character: photoreal face scan (Hank Cherry), stubble, reflective sunglasses showing sky reflection, embroidered jersey patches.
- This is their flagship visual: licensed real-person faces.

**bm-shot3.jpg** (sunset lake, multiple boats)
- Lighting: golden-hour, orange sky reflected across entire water surface.
- Water: full-surface sunset reflection with ripple distortion — the money shot.
- Vessels: 4 bass boats with anglers standing on decks; docks, boathouse, covered launch.
- Atmosphere: warm haze on treeline.

**bm-shot4.jpg** (award stage)
- Lighting: stage spotlights, smoke jets, confetti particles, LED wall.
- VFX: dense confetti + volumetric smoke — shows their particle budget is spent on spectacle, not water.

### 1.5 Red Dead Redemption 2 (app 1174180) — AAA benchmark

**rdr2-shot1.jpg** (night river, canoe)
- Lighting: moonlit night; warm campfire glow from shore houses; blue ambient fill.
- Water: dark with animated firelight reflections — warm orange specular streaks dancing on ripples, moon glints. This is the reference for "light sources reflected in moving water".
- Atmosphere: dense ground fog layer over the river, silhouetted pines, crescent moon.
- Vessel: simple dugout canoe, readable in silhouette.

**rdr2-shot2.jpg** (gunfight, brick building)
- Materials: leather, denim, brick, wood — all with micro-detail normal/roughness variation; muzzle flash + smoke.
- (Included for material benchmark, not water.)

**rdr2-shot3.jpg** (snowy mountain pass)
- Lighting: overcast diffuse; snow sparkle.
- Atmosphere: layered distance fog, falling snow particles, wind-blown snow on poncho.
- Materials: woven blanket pattern, frost on hat.

**rdr2-shot5.jpg** (golden-hour hillside)
- Lighting: THE reference sunset — warm key, cool shadow fill, volumetric dust/haze catching light, cloud undersides lit orange.
- Atmosphere: airborne particulate (pollen/dust) visible in the light shafts.
- Composition: rule-of-thirds, lone tree silhouette.

### 1.6 Microsoft Flight Simulator 2020 (app 1250410) — photoreal water benchmark

**msfs-shot1.jpg** (marketing collage — skipped for analysis)

**msfs-shot2.jpg** (A310 above clouds)
- Clouds: volumetric, correctly shaded (lit tops, dark bases); aircraft panel lines + paint decals crisp.
- Sky: physically-based gradient, deep zenith blue.

**msfs-shot4.jpg** (helicopter over offshore rigs)
- Water: open-ocean deep blue with thousands of small whitecap sparkles; wave chop consistent to horizon; platform legs with foam at waterline.
- Sky: cumulus with correct self-shadowing; haze at horizon.
- This is the "water at distance" benchmark: sparkle density + horizon haze.

**msfs-shot5.jpg** (C-130 water landing)
- Water: close-range ripples with crisp specular; bow spray + wake foam; dark hull reflection.
- Interaction: hydroplaning spray particles where hull meets water — the key "object meets water" effect.

### 1.7 Valheim (app 892970) — community shader benchmark

**vh-shot1.jpg** (Deep North, aurora night)
- Lighting: aurora as dominant light source; snow sparkle; blue ambient.
- Atmosphere: god-ray shafts through snowy pines, falling snow, fog.
- Style: low-poly geometry + strong atmosphere = "pretty on a budget" proof.

**vh-shot2.jpg** (frozen sea at sunset)
- Lighting: orange horizon glow over ice; silhouette figures.
- Water/ice: flat ice sheet with subtle blue sheen; snow particles with bokeh.
- Vessel: longship with furled sail, ice on rigging — stylized but atmospheric.

**vh-shot3.jpg** (longship sailing, daytime)
- Water: bright cyan, gentle swell, white bow wake + wake trail behind hull.
- Vessel: striped sail, dragon-head prow, rope rigging; sail has cloth shading.
- Atmosphere: lens flare, distant blue mountains, light haze.

---

## 2. SUPERIORITY MATRIX

Scale 1–5. Evidence in brackets = key evidence.

| Pillar | UFS2 | FishPlanet | EuroFish | Bassmaster | RDR2 | MSFS | Valheim |
|---|---|---|---|---|---|---|---|
| Water realism | 3 [calm lakes, shallow transparency; weak open ocean] | 4 [fp3 whitecaps, fp4 sun path, fp5 night] | 2 [flat teal, no sun path, lens-flare artifact] | 4 [bm3 full sunset reflection, bm1 dawn mirror] | 5 [rdr1 firelight-on-water, moon glints] | 5 [msfs4 sparkle density, msfs5 wake/spray] | 3 [vh3 wake trail; stylized] |
| Lighting/atmosphere | 4 [ufs5 god rays, ufs1 underwater attenuation] | 5 [fp1/fp2 god rays + ground fog + aurora night] | 3 [soft haze, flat light, hex flare] | 4 [bm1/bm3 golden hour; stage VFX] | 5 [rdr5 dust-in-light, rdr1 fog layers] | 4 [correct cloud shading, horizon haze] | 4 [vh1 aurora + shafts on low-poly] |
| Vessel fidelity | 2 [rowboats only, no rigging] | 4 [fp3 full charter: T-top, outriggers, rigging, crew] | 1 [docks only] | 5 [bm1/bm3 bass boats: trolling motors, hull decals, gunwales] | 3 [canoe silhouette] | 5 [aircraft-grade detail; msfs5 hull spray] | 3 [longship: sail, rigging, wake] |
| Materials/textures | 4 [ufs1 scales, ufs2 shark skin, ufs3 PBR rock] | 4 [weathered wood, hull wraps] | 3 [decent, lower res] | 5 [bm2 face scans, embroidered jerseys] | 5 [leather/brick micro-detail] | 5 [panel lines, paint] | 2 [stylized, intentional] |
| Particles/VFX | 3 [ufs1 underwater motes] | 4 [fog, aurora, stars] | 2 [leaf litter on water only] | 3 [confetti/smoke on stage] | 5 [snow, dust, smoke, muzzle flash] | 4 [spray, wake, clouds] | 4 [snow, wake, aurora] |
| UI/HUD polish | 4 [diegetic scale LCD, minimal] | 3 [clean, sparse] | 3 [interaction prompts, cast reticle] | 4 [broadcast-style, tournament branding] | 5 [invisible until needed] | 4 [clean glass cockpit] | 3 [minimal, readable] |
| **Total /30** | **20** | **24** | **13** | **25** | **28** | **28** | **19** |

Takeaway: the fishing sims win on *scenery composition* (docks, piers, boats, golden hour) and lose to AAA on *water dynamics, light-through-atmosphere, and material micro-detail*. Our deep-sea niche (UFS2 shot1, RDR2 shot1, Valheim shot1) is the least-covered visual territory — underwater attenuation + bioluminescence + night is where a prototype can look unique, not just "better".

---

## 3. TOP 10 CONCRETE TECHNIQUES (ranked by impact-per-effort, procedural-only)

1. **Sun glitter path (specular streak) on the water.** A narrow vertical band of boosted specular along the camera↔sun reflection axis, broken by wave normals and faded by distance. Every competitor's hero shot (fp4, bm3, msfs5) has it; ours has a single Blinn-Phong glint. Cost: ~10 lines in the ocean fragment shader (dot of reflected-ray vs sun, sharpened, modulated by existing noise).
2. **Radial-gradient sun/moon glow sprite + fake god rays.** Billboard sprite at the sun with a 2-stop radial alpha (bright core → wide soft halo), additive blending; 3–5 elongated stretched quads fanned from the sun for ray streaks, opacity tied to sun altitude and cloud cover. Replaces the flat sky-dome disc with a bloom-like halo without post-processing. Cost: one CanvasTexture + one Sprite + a few planes.
3. **Depth-based water color + shore shallows.** Mix deep→shallow color by a procedural "depth" uniform (distance-to-coast mask (we already have island/rock positions) so water turns turquoise over sand and dark over the abyss — the single biggest realism cue in ufs2-shot4, fp-shot1, msfs shots. Cost: one extra uniform + mix in the fragment shader.
4. **Contact shadow blob under the boat.** A dark radial-gradient disc (CanvasTexture, multiply/normal blend) parented to the boat at water level, scaled by boat size, opacity ~0.35. Instantly grounds the vessel (every competitor's boat has a dark hull-shadow zone; ours floats). Cost: one sprite, no shadow maps.
5. **Wave-crest rim light.** In the ocean shader, add a thin white-blue term where the analytic normal tilts toward the sun AND height is high (crest) — `pow(max(dot(N, sunDir),0),k) * crestMask`. Makes waves read as 3D from any angle (fp3, msfs4). Cost: 3 lines.
6. **Atmospheric depth layering (two-tone fog).** Near fog (existing exp²) + a second, lighter "horizon band" fog that only kicks in beyond a distance threshold and tints toward the sky-horizon color — creates the layered depth of fp1/rdr5 without volumetrics. Cost: one extra mix in the fragment shader + matching scene fog.
7. **Boat wake + bow spray.** A short-lived particle burst (Points with a soft-dot CanvasTexture) emitted at the bow when speed > threshold, plus a fading V-shaped wake: two stretched quads with scrolling alpha noise trailing the stern (Valheim vh3, MSFS msfs5). Cost: one Points system + two textured quads.
8. **Underwater visibility mode (our differentiator).** When the camera dips below the surface: switch fog to green-teal exponential, add a caustic shimmer term (two scrolling noise octaves projected on submerged objects), darken with depth, and spawn drifting mote particles (UFS2 shot1). We already have the on-foot fisherman swimming — this makes it *look* underwater. Cost: fog uniform swap + one caustic function + existing particle pattern.
9. **Bioluminescent night water.** Night mode: darken water base, add sparse glowing specks (noise-thresholded points) + a moon glitter path (same math as #1 with moon dir). Mirrors fp5/rdr1/Valheim aurora nights; almost no competitor fishing game does this well. Cost: reuse of #1 + a speckle term.
10. **Procedural texture micro-detail pass.** Bump-map-style detail on boat hull and dock planks via a second procedural CanvasTexture (plank grain + noise) as roughnessMap/normal-ish bump, plus a subtle vignette + film-grain overlay in a final composer pass (EffectComposer is already vendored). Closes the "flat material" gap vs RDR2/Bassmaster. Cost: two CanvasTextures + one fullscreen pass.

---

## 4. LANDABLE TODAY (verified against current code)

Current state (verified): `game/ocean.js` = 5-wave sum + fresnel + sky-gradient reflection + single Blinn-Phong glint + crest foam + exp² fog; `game/sky.js` = gradient dome with sun disc + halo, moon, stars, clouds, golden-hour tint, `castShadow=false` (no dynamic shadows anywhere); `game/game.js` = ACES Filmic, exposure 1.05, no EffectComposer usage; `game/boat.js` = MeshStandardMaterial with roughness/metalness + emissive nav lights; `game/environment.js` = procedural rocks/islands/gulls/rain; no god rays, no sprites, no contact shadows.

| # | Technique | Effort | Why it lands today |
|---|---|---|---|
| 1 | Sun glitter path | **~1h** | Pure fragment-shader math in `ocean.js` FRAG; reuses `uSunDir`, `vNormal`, existing `vnoise`. No new resources. |
| 5 | Wave-crest rim light | **~30min** | 3 lines in the same FRAG; reuses `vHeight` + `uSunDir`. |
| 4 | Contact shadow blob | **~1h** | One CanvasTexture (we have `textures.js` patterns) + Sprite parented to boat group in `boat.js`. |
| 2 | Sun glow sprite + fake god rays | **~2h** | CanvasTexture radial gradient + THREE.Sprite + 3–4 additive planes; `sky.js` already exposes sun world direction. |
| 6 | Two-tone horizon fog | **~1h** | Extra mix() addition in ocean FRAG + scene.fog tuning in `config.js`. |
| 3 | Depth-based water color | **~2h** | Needs a coast-distance signal: compute min distance to island/rock centers on CPU (positions already in `environment.js`), pass as uniform, mix in FRAG. |
| 9 | Bioluminescent night water | **~2h** | Reuses #1 math with moon dir (sky.js already tracks `_moon`) + noise-threshold speckle in FRAG; night mode already exists (day factor). |
| 8 | Underwater mode | **~3h** | Camera-Y check vs `seaLevel` (already in config) → swap fog uniforms (ocean.update already takes fog params), add caustic term, reuse rain-particle pattern for motes. |
| 7 | Wake + bow spray | **~3h** | Points system modeled on `environment.js` rain; wake quads scroll a CanvasTexture. |
| 10 | Micro-detail + vignette/grain pass | **~4h** | CanvasTextures trivial; EffectComposer vendored in `libs/three.module.js` — wire one RenderPass + one ShaderPass (grain/vignette). |

**Recommended order for maximum perceived gain:** 1 → 5 → 4 → 2 → 6 (all same-day, ~5h total, all in two files), then 9 → 3 → 8 (the deep-sea identity), then 7 → 10.

After items 1–6, a static screenshot of our cove at golden hour will read at Fishing-Planet tier; items 8–9 put us in visual territory no fishing sim occupies.
