
// src/types/automations.ts

export type AutomationConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equals'
  | 'less_than_or_equals';

export interface DeviceAutomationTrigger {
  type: 'device';
  deviceId: string;
  condition: AutomationConditionOperator;
  value: string | number | boolean;
}

// Base for time triggers
interface TimeAutomationTriggerBase {
  type: 'time';
  time: string; // HH:mm format, e.g., "08:00"
}

// For recurring schedules (days of the week)
export interface RecurringTimeAutomationTrigger extends TimeAutomationTriggerBase {
  scheduleType: 'recurring';
  days: number[]; // Array of day numbers: 0 (Sun) - 6 (Sat)
  specificDate?: never; // Ensures specificDate is not present for this type
}

// For schedules on a specific date
export interface SpecificDateAutomationTrigger extends TimeAutomationTriggerBase {
  scheduleType: 'specific_date';
  specificDate: string; // YYYY-MM-DD format
  days?: never; // Ensures days array is not present for this type
}

export type TimeAutomationTrigger = RecurringTimeAutomationTrigger | SpecificDateAutomationTrigger;

export type AutomationTrigger = DeviceAutomationTrigger | TimeAutomationTrigger;

export type AutomationActionCommand = 'turn_on' | 'turn_off';

export interface AutomationAction {
  deviceId: string;
  command: AutomationActionCommand;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  conditions?: DeviceAutomationTrigger[];
  action: AutomationAction;
  isEnabled: boolean;
  lastTriggered?: string;
}
