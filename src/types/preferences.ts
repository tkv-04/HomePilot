// src/types/preferences.ts
import type { AutomationRule, AutomationAction } from './automations'; // Keep AutomationAction if it's identical or re-export

// Re-export or define RoutineAction if it's the same as AutomationAction
export type RoutineAction = AutomationAction;

export interface Room {
  id: string;
  name: string;
  deviceIds: string[];
}

export interface DeviceGroup {
  id: string;
  name: string;
  deviceIds: string[];
}

export interface Routine {
  id: string;
  name: string; // e.g., "Good Morning Scene"
  phrase: string; // The exact phrase to trigger it, e.g., "good morning"
  actions: RoutineAction[];
}

export interface UserPreferences {
  selectedDeviceIds?: string[];
  selectedVoiceURI?: string | null;
  rooms?: Room[];
  deviceGroups?: DeviceGroup[];
  automations?: AutomationRule[];
  routines?: Routine[]; // Added routines
}
