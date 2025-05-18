// src/types/home-assistant.ts

export interface DeviceAttribute {
  [key: string]: any;
  unit_of_measurement?: string;
  device_class?: string;
  brightness?: number;
}

export interface HomeAssistantDevice {
  id: string;
  name: string;
  type: 'light' | 'sensor' | 'switch' | 'media_player' | 'climate';
  state: string | number | boolean;
  attributes?: DeviceAttribute;
  icon?: React.ElementType; // For a specific Lucide icon
}

export interface LightDevice extends HomeAssistantDevice {
  type: 'light';
  state: 'on' | 'off';
  attributes?: DeviceAttribute & {
    brightness?: number; // 0-255
  };
}

export interface SensorDevice extends HomeAssistantDevice {
  type: 'sensor';
  state: string | number;
  attributes?: DeviceAttribute & {
    unit_of_measurement?: string;
    device_class?: 'temperature' | 'humidity' | 'power' | 'pressure' | 'motion';
  };
}

export interface SwitchDevice extends HomeAssistantDevice {
  type: 'switch';
  state: 'on' | 'off';
}

export type Device = LightDevice | SensorDevice | SwitchDevice | HomeAssistantDevice;
