// src/services/homeAssistantService.ts
import type { Device } from '@/types/home-assistant';
import { Lightbulb, Thermometer, Droplets, Power, Tv, Wind } from 'lucide-react';

// Mock data simulating devices from Home Assistant
const mockDevices: Device[] = [
  {
    id: 'light_living_room',
    name: 'Living Room Light',
    type: 'light',
    state: 'on',
    attributes: { brightness: 180 },
    icon: Lightbulb,
  },
  {
    id: 'light_kitchen',
    name: 'Kitchen Overhead',
    type: 'light',
    state: 'off',
    icon: Lightbulb,
  },
  {
    id: 'sensor_living_room_temp',
    name: 'Living Room Temperature',
    type: 'sensor',
    state: '22.5',
    attributes: { unit_of_measurement: '°C', device_class: 'temperature' },
    icon: Thermometer,
  },
  {
    id: 'sensor_living_room_humidity',
    name: 'Living Room Humidity',
    type: 'sensor',
    state: '45',
    attributes: { unit_of_measurement: '%', device_class: 'humidity' },
    icon: Droplets,
  },
  {
    id: 'switch_desk_fan',
    name: 'Desk Fan',
    type: 'switch',
    state: 'off',
    icon: Power,
  },
  {
    id: 'media_player_living_room_tv',
    name: 'Living Room TV',
    type: 'media_player',
    state: 'playing',
    attributes: { media_title: 'The Future of AI', media_artist: 'Tech Talks Daily' },
    icon: Tv,
  },
  {
    id: 'climate_main_thermostat',
    name: 'Main Thermostat',
    type: 'climate',
    state: 'cool',
    attributes: { current_temperature: 23, target_temperature: 21, hvac_action: 'cooling' },
    icon: Wind,
  },
  {
    id: 'sensor_office_motion',
    name: 'Office Motion',
    type: 'sensor',
    state: 'detected',
    attributes: { device_class: 'motion'},
    icon: Lightbulb // Using lightbulb as a generic motion icon placeholder
  }
];

// Simulate fetching devices with a delay
export const fetchDevices = async (): Promise<Device[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockDevices);
    }, 1000); // Simulate 1 second network delay
  });
};
