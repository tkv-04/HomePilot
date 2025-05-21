
// src/types/preferences.ts
import type { AutomationRule } from './automations';

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

export interface UserPreferences {
  selectedDeviceIds?: string[];
  selectedVoiceURI?: string | null;
  rooms?: Room[];
  deviceGroups?: DeviceGroup[];
  automations?: AutomationRule[]; // Added automations
}
