import { describe, expect, it } from 'vitest';
import { AgentStatus } from '../contracts';
import {
  CHARACTER_COUNT,
  characterIndexForAgentId,
  poseForStatus,
} from './characterVisual';
import { OFFICE_ZONES, zoneAtTile, WORKSTATIONS } from './officeMap';
import { buildAgentViews, resetAgentViewCache } from './agentViewModel';
import { Agent } from '../contracts';

function makeAgent(overrides: Partial<Agent> & Pick<Agent, 'id'>): Agent {
  return {
    workspaceId: 'ws-1',
    name: overrides.name ?? overrides.id,
    provider: 'unknown',
    model: 'unknown',
    role: 'Developer',
    status: 'idle',
    position: { x: 5, y: 6 },
    ...overrides,
  };
}

describe('characterVisual', () => {
  it('pins demo agent ids to six distinct character slots', () => {
    const ids = [
      'agent-dev',
      'agent-planner',
      'agent-reviewer',
      'agent-qa',
      'agent-ops',
      'agent-ghost',
    ];
    const indexes = ids.map(characterIndexForAgentId);
    expect(new Set(indexes).size).toBe(CHARACTER_COUNT);
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('hashes unknown live ids stably into 0..5', () => {
    expect(characterIndexForAgentId('live-alpha')).toBe(characterIndexForAgentId('live-alpha'));
    expect(characterIndexForAgentId('live-alpha')).toBeGreaterThanOrEqual(0);
    expect(characterIndexForAgentId('live-alpha')).toBeLessThan(CHARACTER_COUNT);
  });

  it('maps domain statuses to presentation poses without inventing status', () => {
    const expected: Record<AgentStatus, string> = {
      working: 'sit',
      planning: 'phone',
      reviewing: 'phone',
      error: 'hurt',
      idle: 'idle',
      waiting: 'idle',
      blocked: 'idle',
      done: 'idle',
      offline: 'idle',
    };
    for (const [status, pose] of Object.entries(expected)) {
      expect(poseForStatus(status as AgentStatus)).toBe(pose);
    }
  });
});

describe('office zones', () => {
  it('defines Work, Meeting, Lounge and Support without relocating workstations', () => {
    expect(OFFICE_ZONES.map((z) => z.id).sort()).toEqual(['lounge', 'meeting', 'support', 'work']);
    expect(WORKSTATIONS).toHaveLength(6);
    expect(zoneAtTile(5, 5)?.id).toBe('work');
    expect(zoneAtTile(21, 8)?.id).toBe('meeting');
    expect(zoneAtTile(8, 15)?.id).toBe('lounge');
    expect(zoneAtTile(24, 15)?.id).toBe('support');
  });
});

describe('AgentView character mapping', () => {
  it('exposes characterIndex from ProjectedState agent id', () => {
    resetAgentViewCache();
    const views = buildAgentViews([makeAgent({ id: 'agent-dev', status: 'working' })]);
    expect(views[0].characterIndex).toBe(0);
    expect(views[0].status).toBe('working');
  });

  it('keeps offline status on the view (sprite hide is Phaser-only)', () => {
    resetAgentViewCache();
    const views = buildAgentViews([makeAgent({ id: 'agent-ghost', status: 'offline' })]);
    expect(views[0].status).toBe('offline');
    expect(views[0].characterIndex).toBe(5);
  });
});
