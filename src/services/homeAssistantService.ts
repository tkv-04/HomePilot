
// src/services/homeAssistantService.ts
import type { Device } from '@/types/home-assistant';
import { Lightbulb, Power, Wind, Zap, HelpCircle, Thermometer, Droplets, Tv } from 'lucide-react';

const SMART_HOME_API_URL = 'https://smarthome.tkv.in.net/smarthome';

// Helper to generate a unique request ID
const generateRequestId = (): string => {
  return `homepilot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Maps Google Device Types to internal app types and Lucide icons
const mapGoogleTypeToAppDevice = (googleDevice: any): Partial<Device> => {
  let appType: Device['type'] = 'unknown';
  let icon: React.ElementType = HelpCircle;
  let deviceSpecificAttributes: Device['attributes'] = {
    googleDeviceType: googleDevice.type,
    // Ensure sensorStatesSupported is an array, even if undefined in source
    sensorStatesSupported: googleDevice.attributes?.sensorStatesSupported || [],
  };

  switch (googleDevice.type) {
    case 'action.devices.types.LIGHT':
      appType = 'light';
      icon = Lightbulb;
      break;
    case 'action.devices.types.SWITCH':
      appType = 'switch';
      icon = Power;
      break;
    case 'action.devices.types.OUTLET':
      appType = 'outlet';
      icon = Power;
      break;
    case 'action.devices.types.FAN':
      appType = 'fan';
      icon = Wind;
      break;
    case 'action.devices.types.SENSOR':
      appType = 'sensor';
      icon = HelpCircle; // Default for generic sensors
      let unit = '';
      // Check sensorStatesSupported from SYNC response
      if (deviceSpecificAttributes.sensorStatesSupported && deviceSpecificAttributes.sensorStatesSupported.length > 0) {
        const sensorStateInfo = deviceSpecificAttributes.sensorStatesSupported[0]; // Using the first supported state
        if (sensorStateInfo.name === 'temperature') {
          icon = Thermometer;
          unit = sensorStateInfo.unit || '°';
        } else if (sensorStateInfo.name === 'humidity') {
          icon = Droplets;
          unit = sensorStateInfo.unit || '%';
        }
      }
      deviceSpecificAttributes.unit_of_measurement = unit;
      break;
    default:
      appType = 'unknown';
      icon = Zap; // Fallback for other/unknown device types
  }
  return {
    type: appType,
    icon: icon,
    attributes: deviceSpecificAttributes,
  };
};

export const fetchDevicesFromApi = async (): Promise<Device[]> => {
  try {
    const response = await fetch(SMART_HOME_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: generateRequestId(),
        inputs: [{ intent: 'action.devices.SYNC' }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('SYNC API Error Response:', errorData);
      throw new Error(`Failed to fetch devices (SYNC): ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.payload || !data.payload.devices) {
      console.error('SYNC API Invalid Response:', data);
      throw new Error('Invalid SYNC response format from API');
    }
    
    return data.payload.devices.map((d: any): Device => {
      const mappedTypeAndAttributes = mapGoogleTypeToAppDevice(d);
      return {
        id: d.id, 
        name: d.name?.name || d.id,
        type: mappedTypeAndAttributes.type || 'unknown',
        state: 'unknown', 
        online: false, 
        icon: mappedTypeAndAttributes.icon,
        attributes: { ...(d.attributes || {}), ...mappedTypeAndAttributes.attributes },
      };
    });
  } catch (error) {
    console.error('Error in fetchDevicesFromApi:', error);
    throw error; 
  }
};

export const queryDeviceStatesFromApi = async (deviceIds: string[]): Promise<Record<string, { state: 'on' | 'off' | 'unknown' | string | number | boolean; online: boolean }>> => {
  if (deviceIds.length === 0) return {};
  try {
    const response = await fetch(SMART_HOME_API_URL, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: generateRequestId(),
        inputs: [{
          intent: 'action.devices.QUERY',
          payload: {
            devices: deviceIds.map(id => ({ id })),
          },
        }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('QUERY API Error Response:', errorData);
      throw new Error(`Failed to query device states: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.payload || !data.payload.devices) {
      console.error('QUERY API Invalid Response:', data);
      throw new Error('Invalid QUERY response format from API');
    }

    const deviceStates: Record<string, { state: 'on' | 'off' | 'unknown' | string | number | boolean; online: boolean }> = {};
    for (const deviceId in data.payload.devices) {
      const deviceData = data.payload.devices[deviceId];
      console.log(`Query data for ${deviceId}:`, JSON.stringify(deviceData));

      let stateValue: 'on' | 'off' | 'unknown' | string | number | boolean = 'unknown';
      
      if (deviceData.on !== undefined) {
        stateValue = deviceData.on ? 'on' : 'off';
      } else {
        // Try to find the primary sensor value (e.g., temperature value, humidity value)
        // This assumes the bridge's QUERY response includes the main sensor reading directly
        // e.g., { "temperature": 22, "online": true }
        const potentialStateKeys = Object.keys(deviceData).filter(k => k !== 'online' && k !== 'on');
        if (potentialStateKeys.length > 0) {
          stateValue = deviceData[potentialStateKeys[0]];
        }
      }
      deviceStates[deviceId] = {
        state: stateValue,
        online: deviceData.online || false, 
      };
    }
    return deviceStates;
  } catch (error) {
    console.error('Error in queryDeviceStatesFromApi:', error);
    throw error;
  }
};

export interface DeviceCommand {
  deviceId: string;
  command: string; // e.g., 'action.devices.commands.OnOff'
  params: Record<string, any>; // e.g., { on: true }
}

// Executes one or more commands on devices via your bridge (EXECUTE intent)
export const executeDeviceCommandsOnApi = async (
  commandsToExecute: DeviceCommand[]
): Promise<{ commands: Array<{ ids: string[]; status: string; states?: any; errorCode?: string }> }> => {
  if (commandsToExecute.length === 0) {
    return { commands: [] };
  }
  try {
    const executionPayload = commandsToExecute.map(cmd => ({
      devices: [{ id: cmd.deviceId }],
      execution: [{ command: cmd.command, params: cmd.params }],
    }));

    const response = await fetch(SMART_HOME_API_URL, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: generateRequestId(),
        inputs: [{
          intent: 'action.devices.EXECUTE',
          payload: {
            commands: executionPayload,
          },
        }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('EXECUTE API Error Response:', errorData);
      throw new Error(`Failed to execute command(s): ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // The bridge already returns a payload.commands array with statuses for each.
    if (data.payload && Array.isArray(data.payload.commands)) {
      return { commands: data.payload.commands };
    } else {
      console.error('EXECUTE command failed or invalid response format:', data);
      // Construct a generic error response for all commands if format is unexpected
      const errorResults = commandsToExecute.map(cmd => ({
        ids: [cmd.deviceId],
        status: 'ERROR',
        errorCode: 'unknownDeviceError',
      }));
      return { commands: errorResults };
    }
  } catch (error)
 {
    console.error('Error in executeDeviceCommandsOnApi:', error);
    // Construct a generic error response for all commands on network/request error
    const errorResults = commandsToExecute.map(cmd => ({
      ids: [cmd.deviceId],
      status: 'ERROR',
      errorCode: error instanceof Error ? error.message : 'clientSideError',
    }));
    return { commands: errorResults };
  }
};
