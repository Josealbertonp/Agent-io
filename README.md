# Agent-io

Visual workspace for monitoring AI agents through Maestri.

This repository contains the Agent-IO application source code and documentation. It does **not** redistribute purchased third-party art packs.

## Licensed visual assets (LimeZu)

Agent-IO’s office and character presentation uses licensed visual assets from **LimeZu**.

- LimeZu: https://limezu.itch.io/
- Credit is **required** by the LimeZu license.

The LimeZu asset files are **not** included in the public GitHub repository. They must be obtained separately by anyone who wants the complete visual experience. This repo ships the Agent-IO implementation (code, mapping, Phaser scene), not a copy of the purchased pack.

Do not commit the purchased pack or the local copies listed below.

### Local installation paths

After you legally obtain the required LimeZu assets, place the application copies here:

| Local path | Role |
| --- | --- |
| `public/office/characters/agent-0.png` … `agent-5.png` | Six 32×32 Character Generator premade sheets |
| `public/office/conference-table.png` | Meeting-zone furniture single |
| `public/office/lounge-sofa.png` | Lounge-zone furniture single |

The runtime still loads `/office/characters/agent-N.png` and the two furniture URLs. Git ignores those paths so the public tree stays source-only.

Existing Modern Office tiles already used by earlier stages remain in `public/office/` (room builder, desks, chairs, and related tiles). Those files were not added by the character redesign.

### Verify local assets

```bash
npm run verify:assets
```

The check reports any missing licensed copies and exits with a non-zero status if they are absent. Missing assets do not change Agent-IO’s domain or status logic; Phaser simply will not have those textures until the files are installed locally.

See `docs/CHARACTER-AGENT-VIEW.md` for Character → AgentView mapping and `public/office/NOTICE.txt` for credit text.
