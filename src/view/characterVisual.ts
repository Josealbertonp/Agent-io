import { AgentStatus } from '../contracts';

/** LimeZu Character Generator 32×32 premade sheet: 56 columns × 41 rows. */
export const CHARACTER_SHEET = {
  frameWidth: 32,
  frameHeight: 32,
  columns: 56,
} as const;

export const CHARACTER_COUNT = 6;

export type CharacterPose = 'idle' | 'sit' | 'phone' | 'hurt';

function frame(row: number, col: number): number {
  return row * CHARACTER_SHEET.columns + col;
}

/**
 * Presentation poses only. Status values stay the domain enum.
 * Rows verified against Premade_Character_32x32 sheets.
 */
export const CHARACTER_POSE_FRAMES: Record<CharacterPose, { start: number; end: number; frameRate: number }> = {
  idle: { start: frame(15, 0), end: frame(15, 5), frameRate: 2 },
  sit: { start: frame(17, 6), end: frame(17, 11), frameRate: 2 },
  phone: { start: frame(15, 6), end: frame(15, 11), frameRate: 2 },
  hurt: { start: frame(15, 0), end: frame(15, 0), frameRate: 1 },
};

const KNOWN_CHARACTER_BY_ID: Record<string, number> = {
  'agent-dev': 0,
  'agent-planner': 1,
  'agent-reviewer': 2,
  'agent-qa': 3,
  'agent-ops': 4,
  'agent-ghost': 5,
};

/** Stable 0..5 index from agent id. Demo ids are pinned for visual consistency. */
export function characterIndexForAgentId(agentId: string): number {
  if (agentId in KNOWN_CHARACTER_BY_ID) return KNOWN_CHARACTER_BY_ID[agentId];
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return hash % CHARACTER_COUNT;
}

export function characterAssetKey(index: number): string {
  return `char-agent-${index % CHARACTER_COUNT}`;
}

export function characterAssetUrl(index: number): string {
  return `/office/characters/agent-${index % CHARACTER_COUNT}.png`;
}

/** Maps canonical status to a sheet pose. Does not invent status. */
export function poseForStatus(status: AgentStatus): CharacterPose {
  switch (status) {
    case 'working':
      return 'sit';
    case 'planning':
      return 'phone';
    case 'reviewing':
      return 'phone';
    case 'error':
      return 'hurt';
    case 'idle':
    case 'waiting':
    case 'blocked':
    case 'done':
      return 'idle';
    case 'offline':
      return 'idle';
    default:
      return 'idle';
  }
}

export function poseAnimKey(characterIndex: number, pose: CharacterPose): string {
  return `${characterAssetKey(characterIndex)}-${pose}`;
}
