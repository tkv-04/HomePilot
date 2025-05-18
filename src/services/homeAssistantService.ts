
// src/services/homeAssistantService.ts
import type { Device } from '@/types/home-assistant';
import { Lightbulb, Power, Wind, Zap, HelpCircle, Thermometer, Droplets, Tv } from 'lucide-react';

const SMART_HOME_API_URL = 'https://smarthome.tkv.in.net/smarthome'; 

// Helper to generate a unique request ID (simple version)
const generateRequestId = (): string => {
  return `homepilot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Maps Google Device Types to internal app types and Lucide icons
const mapGoogleTypeToAppDevice = (googleDevice: any): Partial<Device> => {
  let appType: Device['type'] = 'unknown';
  let icon: React.ElementType = HelpCircle; 
  let deviceSpecificAttributes: Device['attributes'] = {
    googleDeviceType: googleDevice.type,
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
      icon = HelpCircle; // Default for sensors
      let unit = '';
      if (googleDevice.attributes && googleDevice.attributes.sensorStatesSupported && googleDevice.attributes.sensorStatesSupported.length > 0) {
        // Using the first supported state to determine icon/unit for simplicity
        const sensorStateInfo = googleDevice.attributes.sensorStatesSupported[0];
        if (sensorStateInfo.name === 'temperature') {
          icon = Thermometer;
          unit = sensorStateInfo.unit || '°'; 
        } else if (sensorStateInfo.name === 'humidity') {
          icon = Droplets;
          unit = sensorStateInfo.unit || '%';
        }
        // for binary sensors or other sensors, it will keep HelpCircle and no unit
      }
      deviceSpecificAttributes.unit_of_measurement = unit;
      // deviceSpecificAttributes.sensorStatesSupported = googleDevice.attributes?.sensorStatesSupported; // Optionally store all supported states
      break;
    default:
      appType = 'unknown';
      icon = Zap; 
  }
  return {
    type: appType,
    icon: icon,
    attributes: deviceSpecificAttributes,
  };
};

// Fetches the list of devices from your bridge (SYNC intent)
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
        attributes: { ...mappedTypeAndAttributes.attributes },
      };
    });
  } catch (error) {
    console.error('Error in fetchDevicesFromApi:', error);
    throw error; 
  }
};

// Queries the current states of devices from your bridge (QUERY intent)
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
      let stateValue: 'on' | 'off' | 'unknown' | string | number | boolean = 'unknown';
      
      // Based on your bridge, it returns an 'on' property for state.
      if (deviceData.on !== undefined) { 
        stateValue = deviceData.on ? 'on' : 'off';
      } else {
        // If your bridge were to return other state properties for sensors, handle them here.
        // For now, it seems to only provide 'on', so other sensors might appear 'off' or 'unknown'.
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

// Executes a command on a device via your bridge (EXECUTE intent)
export const executeDeviceCommandOnApi = async (
  deviceId: string,
  command: string, 
  params: Record<string, any> 
): Promise<{ success: boolean; newState?: 'on' | 'off' | string | number | boolean }> => {
  try {
    const response = await fetch(SMART_HOME_API_URL, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: generateRequestId(),
        inputs: [{
          intent: 'action.devices.EXECUTE',
          payload: {
            commands: [{
              devices: [{ id: deviceId }],
              execution: [{ command, params }],
            }],
          },
        }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('EXECUTE API Error Response:', errorData);
      throw new Error(`Failed to execute command: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const cmdResponse = data.payload?.commands?.[0];

    if (cmdResponse && cmdResponse.status === 'SUCCESS') {
      let reportedNewState: 'on' | 'off' | string | number | boolean | undefined = undefined;
      if (cmdResponse.states?.on !== undefined) { 
        reportedNewState = cmdResponse.states.on ? 'on' : 'off';
      }
      return { success: true, newState: reportedNewState };
    } else {
      console.error('EXECUTE command failed or invalid response:', data);
      const errorCode = cmdResponse?.errorCode || 'unknownError';
      throw new Error(`Command execution failed with status: ${cmdResponse?.status || 'UNKNOWN'}, error: ${errorCode}`);
    }
  } catch (error) {
    console.error('Error in executeDeviceCommandOnApi:', error);
    throw error;
  }
};
