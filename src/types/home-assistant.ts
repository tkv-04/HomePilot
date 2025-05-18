// src/types/home-assistant.ts

export interface DeviceAttribute {
  [key: string]: any;
  // Removed specific attributes like brightness for now,
  // as the provided bridge focuses on On/Off.
  // We can add them back if the bridge/API supports them.
  googleDeviceType?: string; // e.g., 'action.devices.types.LIGHT'
}

export interface HomeAssistantDevice {
  id: string; // This will be the entity_id from Home Assistant
  name: string;
  type: 'light' | 'switch' | 'fan' | 'outlet' | 'sensor' | 'media_player' | 'climate' | 'unknown'; // App's internal type
  state: string | number | boolean; // 'on', 'off', or sensor value
  online: boolean; // Device online status
  attributes?: DeviceAttribute;
  icon?: React.ElementType; // For a specific Lucide icon (can be set by service)
  // traits?: string[]; // e.g. ['action.devices.traits.OnOff'] - might be useful later
}

// Specific device types can be less specific for now if focusing on On/Off
export interface LightDevice extends HomeAssistantDevice {
  type: 'light';
  state: 'on' | 'off' | 'unknown';
}

export interface SwitchDevice extends HomeAssistantDevice {
  type: 'switch' | 'outlet';
  state: 'on' | 'off' | 'unknown';
}

export interface FanDevice extends HomeAssistantDevice {
  type: 'fan';
  state: 'on' | 'off' | 'unknown';
}

// Generic Device type covering all possibilities for now
export type Device = HomeAssistantDevice;
