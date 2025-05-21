// src/types/preferences.ts
import type { AutomationRule, AutomationAction } from './automations';

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
  name: string;
  phrases: string[]; // Changed from phrase: string
  actions: RoutineAction[];
  customVoiceResponse?: string; // Added optional custom voice response
}

export interface UserPreferences {
  selectedDeviceIds?: string[];
  selectedVoiceURI?: string | null;
  rooms?: Room[];
  deviceGroups?: DeviceGroup[];
  automations?: AutomationRule[];
  routines?: Routine[];
}
