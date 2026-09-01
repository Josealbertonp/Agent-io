import { create } from 'zustand';
import { Event } from '../contracts';
import { ProjectedState } from './types';
import { createInitialState, applyEvents, projectEvent } from './projection';
import { serializeState, deserializeState } from './snapshot';

export interface ProjectedStore extends ProjectedState {
  // Actions puras
  ingest: (events: Event | readonly Event[]) => void;
  reset: () => void;
  loadState: (state: ProjectedState) => void;
  getSnapshot: () => string;
  restoreSnapshotString: (jsonString: string) => void;
}

export const useProjectedStore = create<ProjectedStore>((set, get) => ({
  ...createInitialState(),

  ingest: (events: Event | readonly Event[]) => {
    const list = Array.isArray(events) ? events : [events];
    if (list.length === 0) return;

    set((state) => {
      if (list.length === 1) {
        return projectEvent(state, list[0]);
      }
      return applyEvents(state, list);
    });
  },

  reset: () => {
    set(createInitialState());
  },

  loadState: (newState: ProjectedState) => {
    set({
      agents: newState.agents,
      tasks: newState.tasks,
      activities: newState.activities,
      connectionStatus: newState.connectionStatus,
      seenEventIds: new Set(newState.seenEventIds),
      pendingOrphanEvents: [...newState.pendingOrphanEvents],
      lastSequence: newState.lastSequence,
      lastOccurredAt: newState.lastOccurredAt,
      ignoredEventsCount: newState.ignoredEventsCount,
      rejectedEventsCount: newState.rejectedEventsCount,
      invalidPayloadCount: newState.invalidPayloadCount,
      droppedOrphanEventsCount: newState.droppedOrphanEventsCount,
    });
  },

  getSnapshot: () => {
    return serializeState(get());
  },

  restoreSnapshotString: (jsonString: string) => {
    const loaded = deserializeState(jsonString);
    get().loadState(loaded);
  },
}));
