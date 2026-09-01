# Character → AgentView mapping

Presentation-only. Canonical agent data remains `ProjectedState`. Phaser never invents status.

## Pipeline

`ProjectedState.agents` → `selectAgentViews` / `toAgentView` → `AgentView` (including derived `characterIndex`) → `OfficeScene` / `AgentMarker`

No second store. `characterIndexForAgentId` pins demo IDs in `KNOWN_CHARACTER_BY_ID`; all live/unknown IDs use a stable hash modulo 6. `characterIndex` is presentation-only and is never persisted as domain state.

## Characters (LimeZu Character Generator, 32×32 premade sheets)

These PNGs are **licensed third-party assets**. They are **not** part of the public repository. Install them locally after obtaining them from LimeZu (https://limezu.itch.io/). Credit is **required**. See the README section “Licensed visual assets (LimeZu)” and `public/office/NOTICE.txt`.

The Agent-IO source still maps `characterIndex` → `/office/characters/agent-{n}.png`. Git ignores `public/office/characters/`.

Free Modern tiles pack was **not** used (non-commercial).

| Index | Local file (not in Git) | Demo agent id |
| --- | --- | --- |
| 0 | `public/office/characters/agent-0.png` (Premade 01) | `agent-dev` |
| 1 | `public/office/characters/agent-1.png` (Premade 04) | `agent-planner` |
| 2 | `public/office/characters/agent-2.png` (Premade 07) | `agent-reviewer` |
| 3 | `public/office/characters/agent-3.png` (Premade 10) | `agent-qa` |
| 4 | `public/office/characters/agent-4.png` (Premade 13) | `agent-ops` |
| 5 | `public/office/characters/agent-5.png` (Premade 17) | `agent-ghost` |

Unknown live ids: stable hash modulo 6 (`characterIndexForAgentId`).

Sheet layout: 56 columns × 41 rows of 32×32 frames.

The six premade sheets belong on disk at `public/office/characters/agent-0.png` through `agent-5.png` after a separate legal install. The purchased pack root is also gitignored. Terms in `public/office/LICENSE-INTERIORS.txt` and `public/office/NOTICE.txt`: commercial/non-commercial use is allowed, credit is required, and reselling or distributing the pack is prohibited.

Verified pose rows on `Premade_Character_32x32_01.png`:

| Pose | Row | Columns |
| --- | --- | --- |
| idle (front) | 15 | 0–5 |
| phone/tablet | 15 | 6–11 |
| sit facing desk (back) | 17 | 6–11 |

Error uses the idle frame plus a restrained red tint (hurt rows on this sheet are not usable character frames).

`CHARACTER_POSE_FRAMES` defines idle as row 15, columns 0–5; sit as row 17, columns 6–11; phone as row 15, columns 6–11; and hurt as the idle frame with tint. Loops run at a low frame rate and do not flash.

## Status → pose (does not change the domain enum)

| Status | Pose | Notes |
| --- | --- | --- |
| working | sit | Slow bob |
| planning | phone | Slow bob |
| reviewing | phone | No extra flash |
| waiting | idle | Neutral |
| idle | idle | Relaxed standing frame |
| blocked | idle | Gray tint (restrained) |
| done | idle | Status dot only |
| error | idle + red tint | Hurt sheet rows are not character poses |
| offline | (sprite hidden) | Station remains; empty chair |

Statuses stay: offline, idle, planning, working, waiting, blocked, reviewing, done, error.

`statusConfidence`, `statusEvidence`, and provider/model `unknown` are unchanged (not on `AgentView` beyond existing badge fields).

## Office

- Workstations: six desks; agents do **not** walk between Work / Meeting / Lounge / Support by status.
- Zones are floor tints + labels only.
- Tiles: existing Modern Office Room Builder 16×16 (16-column sheet). Interiors Room Builder was not used as a tilemap — column count differs (76 vs 16), so tile indices would be wrong.
- Extra interiors singles (local-only, not in Git): `public/office/conference-table.png`, `public/office/lounge-sofa.png`.

## Visual rules

- Primary character scale: 32×32 world pixels (map zoom 2).
- Selected: gold ring, slight scale, brighter name.
- Labels: name + status color dot only on the scene.
- Animation: low frame-rate loops; no flashing.

There are no role/provider/model/activity metadata boxes in Phaser; those details belong exclusively in the side panel. The domain `AgentStatus` enum and `ProjectedState` semantics are unchanged. `offline` hides the sprite while leaving the station visible. No contracts or domain records are changed.
