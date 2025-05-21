
// src/types/automations.ts

export type AutomationConditionOperator = 
  | 'equals' 
  | 'not_equals'
  | 'greater_than' 
  | 'less_than' 
  | 'greater_than_or_equals' 
  | 'less_than_or_equals';

export interface AutomationTrigger {
  deviceId: string; // ID of the device to monitor
  // For simplicity, we'll assume the primary 'state' of the device is monitored.
  // This could be expanded to monitor specific attributes if the bridge/query provides them.
  // attribute: string; // e.g., 'state', 'brightness', 'temperature' - Keep it simple for now, assume 'state'
  condition: AutomationConditionOperator;
  value: string | number | boolean; // The value to compare against
}

export type AutomationActionCommand = 'turn_on' | 'turn_off';

export interface AutomationAction {
  deviceId: string; // ID of the device to act upon
  command: AutomationActionCommand;
  // params?: Record<string, any>; // For future actions like set_brightness: { brightness: 50 }
}

export interface AutomationRule {
  id: string; // Unique ID for the automation rule
  name: string; // User-defined name for the automation
  trigger: AutomationTrigger;
  action: AutomationAction;
  isEnabled: boolean; // To enable/disable the automation without deleting it
  lastTriggered?: string; // ISO string, optional
}
