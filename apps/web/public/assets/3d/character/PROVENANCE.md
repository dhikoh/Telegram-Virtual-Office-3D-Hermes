# Provenance — 3D characters (`*.glb` in this folder)

## Source

| | |
| --- | --- |
| Pack | **Ultimate Animated Character Pack — Nov 2019** |
| Author | **Quaternius** — https://www.patreon.com/quaternius |
| Licence | **CC0 1.0 Universal (Public Domain Dedication)** |
| Licence URL | https://creativecommons.org/publicdomain/zero/1.0/ |
| Licence text (verbatim, as shipped) | `LICENSE-Quaternius.txt` |
| Archive as received | `Ultimate Animated Character Pack - Nov 2019-20261014T021733Z-1-001.zip` |
| Download date | 2026-10-14 (archive timestamp `20261014T021733Z`) |
| Files taken from the archive | `Ultimate Animated Character Pack - Nov 2019/glTF/*.gltf` only — the FBX / Blend / OBJ folders were never extracted |
| Textures | none in the pack (colour comes from the glTF materials), so no image is bundled |

Only these 8 of the pack's 52 characters are used — one per department from
`packages/shared/src/layout.ts`, all office-appropriate staff:

| Department | Source `.gltf` | Committed `.glb` | Size (bytes) |
| --- | --- | --- | --- |
| `command` | `Suit_Male.gltf` | `suitMale.glb` | 326472 |
| `social` | `Casual_Female.gltf` | `casualFemale.glb` | 328716 |
| `marketing` | `Kimono_Female.gltf` | `kimonoFemale.glb` | 407960 |
| `sales` | `Casual2_Male.gltf` | `casual2Male.glb` | 222628 |
| `analytics` | `OldClassy_Male.gltf` | `oldClassyMale.glb` | 298016 |
| `finance` | `Suit_Female.gltf` | `suitFemale.glb` | 336628 |
| `support` | `Worker_Male.gltf` | `workerMale.glb` | 199996 |
| `hr` | `Casual3_Female.gltf` | `casual3Female.glb` | 382832 |

**Total: 8 files, 2 503 248 bytes (2.39 MiB)** — each ≤ 500 KB, all together
≤ 4 MB. The manifest that maps department → file lives in
`apps/web/src/components/office/office-3d/glbCharacter.ts`.

## Conversion (reproducible)

Run outside the repo so `package.json` / `package-lock.json` stay untouched
(`npx -y @gltf-transform/cli@4`, resolved 4.5.1, Node 22).

```bash
# 1. keep only the three clips the app plays (Python, on a copy of the .gltf):
#    drop every entry of "animations" whose name is not Idle / Walk / SitDown.

# 2. one chain per character (X.gltf is the result of step 1):
npx -y @gltf-transform/cli@4 copy     X.gltf tmp.a
npx -y @gltf-transform/cli@4 prune    tmp.a  tmp.b     # drops 906 orphan accessors + 16 clips
npx -y @gltf-transform/cli@4 resample tmp.b  tmp.c     # lossless keyframe dedup
npx -y @gltf-transform/cli@4 quantize tmp.c  <name>.glb
```

* **Quantize only** — `KHR_mesh_quantization` is decoded natively by three's
  `GLTFLoader`, so no Draco / meshopt decoder has to be shipped.
  `KHR_draco_mesh_compression` and `EXT_meshopt_compression` are absent.
* No Draco, no meshopt, no texture compression (there are no textures).
* Output is a single **self-contained GLB**: the buffer is the BIN chunk, no
  external `uri`, nothing else for the loader to fetch. Intermediate `tmp.*`
  files and their sidecar `.bin` are scratch only — never committed.
* Skinning is preserved: 1 skin / 23 joints per file.

## What the committed clips are

Every file carries exactly `Idle`, `Walk`, `SitDown` (the pack's other 13–14
clips — Death, Defeat, Jump, PickUp, Punch, RecieveHit, Roll, Run, Run_Carry,
Shoot_OneHanded, StandUp, SwordSlash, Victory, Walk_Carry — were dropped).
`Agent3D.tsx` plays `Walk` while moving, `Idle` while standing, and `SitDown`
(once, held) for `waiting_approval`.

## Verification

* Parsed with three's real `GLTFLoader` + `AnimationMixer`: 8/8 load, all three
  clips create actions, 5–8 meshes each, feet at y = 0 after normalisation.
* `gltf-transform validate`: no errors (one pre-existing
  `NODE_SKINNED_MESH_NON_ROOT` warning, inherited from the source pack).
* Locked by `apps/web/src/components/office/__tests__/character-3d.test.ts`.

## Also in this folder (unrelated, kept)

`knight.glb` + `LICENSE-KayKit-Adventurers.txt` — an earlier CC0 KayKit
Adventurers model from the tahap 13 asset pass, still asserted by
`tahap13.test.ts`. It is not part of this manifest.
