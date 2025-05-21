
// src/types/automations.ts

export type AutomationConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equals'
  | 'less_than_or_equals';

export interface DeviceAutomationTrigger { // This will also serve as the type for individual conditions
  type: 'device'; // This type property helps if we ever need to differentiate condition types, though currently only device conditions are supported
  deviceId: string;
  // attribute: string; // Future: for specific attributes beyond primary state
  condition: AutomationConditionOperator;
  value: string | number | boolean; // The value to compare against
}

export interface TimeAutomationTrigger {
  type: 'time';
  time: string; // HH:mm format, e.g., "08:00"
  days: number[]; // Array of day numbers: 0 (Sun) - 6 (Sat)
}

export type AutomationTrigger = DeviceAutomationTrigger | TimeAutomationTrigger;

export type AutomationActionCommand = 'turn_on' | 'turn_off';

export interface AutomationAction {
  deviceId: string; // ID of the device to act upon
  command: AutomationActionCommand;
  // params?: Record<string, any>; // For future actions like set_brightness: { brightness: 50 }
}

export interface AutomationRule {
  id: string; // Unique ID for the automation rule
  name: string; // User-defined name for the automation
  trigger: AutomationTrigger; // The primary trigger (time or a single device event)
  conditions?: DeviceAutomationTrigger[]; // Optional: Additional device conditions that must ALL be true
  action: AutomationAction;
  isEnabled: boolean; // To enable/disable the automation without deleting it
  lastTriggered?: string; // ISO string, optional
}
