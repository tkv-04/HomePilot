
// src/services/homeAssistantService.ts
import type { Device } from '@/types/home-assistant';
import { Lightbulb, Power, Wind, Zap, HelpCircle, Thermometer, Droplets, Tv } from 'lucide-react';

const SMART_HOME_API_URL = 'https://smarthome.tkv.in.net/smarthome'; // Base URL for all intents

// Helper to generate a unique request ID (simple version)
const generateRequestId = (): string => {
  return `homepilot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Maps Google Device Types to internal app types and Lucide icons
const mapGoogleTypeToAppDevice = (googleDevice: any): Partial<Device> => {
  let appType: Device['type'] = 'unknown';
  let icon: React.ElementType = HelpCircle; // Fallback to HelpCircle

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
    // Add more mappings as needed for other device types your bridge supports
    // For example, if your bridge supports thermostats:
    // case 'action.devices.types.THERMOSTAT':
    //   appType = 'climate'; // or 'thermostat' if you prefer
    //   icon = Thermometer;
    //   break;
    default:
      appType = 'unknown';
      // Use a more generic icon for unknown types if not a specific category
      icon = Zap; // Or keep HelpCircle if that's preferred for all unknown
  }
  return {
    type: appType,
    icon: icon,
    attributes: {
      googleDeviceType: googleDevice.type,
      // store other relevant attributes from googleDevice.attributes if any
    },
  };
};

// Fetches the list of devices from your bridge (SYNC intent)
export const fetchDevicesFromApi = async (): Promise<Device[]> => {
  try {
    // SYNC request goes to the base SMART_HOME_API_URL
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
      const mappedType = mapGoogleTypeToAppDevice(d);
      return {
        id: d.id, // entity_id
        name: d.name?.name || d.id,
        type: mappedType.type || 'unknown',
        state: 'unknown', // Initial state, will be updated by QUERY
        online: false, // Initial state, will be updated by QUERY
        icon: mappedType.icon,
        attributes: { ...mappedType.attributes },
      };
    });
  } catch (error) {
    console.error('Error in fetchDevicesFromApi:', error);
    throw error; // Re-throw to be caught by UI
  }
};

// Queries the current states of devices from your bridge (QUERY intent)
export const queryDeviceStatesFromApi = async (deviceIds: string[]): Promise<Record<string, { state: 'on' | 'off' | 'unknown' | string | number | boolean; online: boolean }>> => {
  if (deviceIds.length === 0) return {};
  try {
    const response = await fetch(SMART_HOME_API_URL, { // Uses the base URL
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
      // Adapt based on how your bridge reports state for different devices
      let stateValue: 'on' | 'off' | 'unknown' | string | number | boolean = 'unknown';
      if (deviceData.on !== undefined) { // For OnOff trait
        stateValue = deviceData.on ? 'on' : 'off';
      } else if (deviceData.status !== undefined) { // General status
         stateValue = deviceData.status;
      } else {
        // Fallback or handle other device types if your bridge returns different state structures
        // For now, we'll keep it simple and expect 'on' or a generic 'state'
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
  command: string, // e.g., "action.devices.commands.OnOff"
  params: Record<string, any> // e.g., { "on": true }
): Promise<{ success: boolean; newState?: 'on' | 'off' | string | number | boolean }> => {
  try {
    const response = await fetch(SMART_HOME_API_URL, { // Uses the base URL
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
      // Extract the new state from the response if available
      let reportedNewState: 'on' | 'off' | string | number | boolean | undefined = undefined;
      if (cmdResponse.states?.on !== undefined) { // For OnOff trait
        reportedNewState = cmdResponse.states.on ? 'on' : 'off';
      } else if (cmdResponse.states?.status !== undefined) { // More generic state if present
        reportedNewState = cmdResponse.states.status;
      }
      // Potentially add more specific state extractions here based on device type/traits
      // e.g., cmdResponse.states.brightness, cmdResponse.states.thermostatTemperatureSetpoint

      return { success: true, newState: reportedNewState };
    } else {
      console.error('EXECUTE command failed or invalid response:', data);
      // Try to get error code if available
      const errorCode = cmdResponse?.errorCode || 'unknownError';
      throw new Error(`Command execution failed with status: ${cmdResponse?.status || 'UNKNOWN'}, error: ${errorCode}`);
    }
  } catch (error) {
    console.error('Error in executeDeviceCommandOnApi:', error);
    // Ensure the error is re-thrown or handled to indicate failure
    throw error;
  }
};

// --- Mock functions (can be removed or commented out if API integration is complete) ---
// const mockDevices: Device[] = [
//   { id: 'light.living_room', name: 'Living Room Light', type: 'light', state: 'on', online: true, icon: Lightbulb, attributes: { googleDeviceType: 'action.devices.types.LIGHT' } },
//   { id: 'switch.desk_fan', name: 'Desk Fan', type: 'switch', state: 'off', online: true, icon: Power, attributes: { googleDeviceType: 'action.devices.types.SWITCH' }  },
// ];

// export const fetchDevices = async (): Promise<Device[]> => {
//   console.warn("Using mock fetchDevices. Remove for production.");
//   return new Promise((resolve) => setTimeout(() => resolve(mockDevices), 500));
// };
// --- End of mock functions ---
