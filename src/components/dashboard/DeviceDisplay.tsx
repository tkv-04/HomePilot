
// src/components/dashboard/DeviceDisplay.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import { useEffect, useState, useCallback } from 'react';
import { 
  fetchDevicesFromApi, 
  queryDeviceStatesFromApi, 
  executeDeviceCommandsOnApi // Corrected import
} from '@/services/homeAssistantService';
import { DeviceCard } from './DeviceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash, WifiOff, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const SELECTED_DEVICES_LS_KEY = 'homepilot_selected_device_ids';

interface DeviceDisplayProps {
  onDevicesLoaded?: (devices: Device[]) => void;
}

export function DeviceDisplay({ onDevicesLoaded }: DeviceDisplayProps) {
  const [displayedDevices, setDisplayedDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSelectedDevices, setHasSelectedDevices] = useState(false);
  const { toast } = useToast();

  const updateParentWithDevices = useCallback((devices: Device[]) => {
    if (onDevicesLoaded) {
      onDevicesLoaded(devices);
    }
  }, [onDevicesLoaded]);

  useEffect(() => {
    const loadDevices = async () => {
      setIsLoading(true);
      setError(null);
      setDisplayedDevices([]);

      let selectedIds: string[] = [];
      if (typeof window !== 'undefined') {
        const storedSelection = localStorage.getItem(SELECTED_DEVICES_LS_KEY);
        if (storedSelection) {
          try {
            selectedIds = JSON.parse(storedSelection);
          } catch (e) {
            console.error("Failed to parse selected devices from localStorage", e);
            localStorage.removeItem(SELECTED_DEVICES_LS_KEY);
          }
        }
      }
      
      setHasSelectedDevices(selectedIds.length > 0);

      if (selectedIds.length === 0) {
        setIsLoading(false);
        updateParentWithDevices([]);
        return;
      }

      try {
        const allFetchedDevices = await fetchDevicesFromApi();
        const devicesToQuery = allFetchedDevices.filter(device => selectedIds.includes(device.id));

        if (devicesToQuery.length > 0) {
          const deviceIdsToQuery = devicesToQuery.map(d => d.id);
          console.log("DeviceDisplay: Querying states for IDs:", deviceIdsToQuery);
          const states = await queryDeviceStatesFromApi(deviceIdsToQuery);
          
          const updatedDevices = devicesToQuery.map(device => {
            const deviceStateInfo = states[device.id];
            return {
              ...device,
              state: deviceStateInfo ? deviceStateInfo.state : 'unknown',
              online: deviceStateInfo ? deviceStateInfo.online : false,
            };
          });
          setDisplayedDevices(updatedDevices);
          updateParentWithDevices(updatedDevices);
        } else {
          setDisplayedDevices([]);
          updateParentWithDevices([]);
          if (allFetchedDevices.length > 0) {
             setHasSelectedDevices(true); 
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch devices or their states from API. Full error object:", err);
        let displayError = "Could not load devices. Please check the connection to the smart home bridge or see browser console for details.";
        if (err && err.message) {
            displayError = `Error: ${err.message}. Check browser console for more details.`;
        } else if (typeof err === 'string') {
            displayError = `Error: ${err}. Check browser console for more details.`;
        }
        setError(displayError);
        setDisplayedDevices([]);
        updateParentWithDevices([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadDevices();
  }, [updateParentWithDevices]); // Added updateParentWithDevices to dependency array

  const handleToggleDeviceState = async (deviceId: string, currentDeviceState: Device['state']) => {
    const device = displayedDevices.find(d => d.id === deviceId);
    if (!device) return;

    const currentOnState = currentDeviceState === 'on';
    const targetOnState = !currentOnState;

    let newDeviceList = displayedDevices.map(d =>
      d.id === deviceId ? { ...d, state: targetOnState ? 'on' : 'off' } : d
    );
    setDisplayedDevices(newDeviceList);
    // Optimistic update to parent
    updateParentWithDevices(newDeviceList);


    try {
      const commandToExecute = {
        deviceId: deviceId,
        command: 'action.devices.commands.OnOff', // Standard OnOff command
        params: { on: targetOnState }
      };
      // Use the updated function that expects an array of commands
      const result = await executeDeviceCommandsOnApi([commandToExecute]);

      // Assuming the first command in the result corresponds to our single command
      const commandResult = result.commands[0]; 

      if (commandResult && commandResult.status === 'SUCCESS') {
        toast({
          title: "Command Sent",
          description: `${device.name} turned ${targetOnState ? 'ON' : 'OFF'}.`,
        });
        
        // If EXECUTE returns new states, use them.
        const newApiState = commandResult.states?.on !== undefined ? (commandResult.states.on ? 'on' : 'off') : undefined;
        const newApiOnline = commandResult.states?.online !== undefined ? commandResult.states.online : device.online;

        if (newApiState !== undefined) {
           newDeviceList = displayedDevices.map(d =>
            d.id === deviceId ? { ...d, state: newApiState, online: newApiOnline } : d
          );
          setDisplayedDevices(newDeviceList);
          updateParentWithDevices(newDeviceList);
        } else {
          // If EXECUTE doesn't return state, query it after a short delay
          setTimeout(async () => {
            try {
              const updatedStates = await queryDeviceStatesFromApi([deviceId]);
              if (updatedStates[deviceId]) {
                const refreshedDeviceList = displayedDevices.map(d =>
                  d.id === deviceId ? { ...d, state: updatedStates[deviceId].state, online: updatedStates[deviceId].online } : d
                );
                setDisplayedDevices(refreshedDeviceList);
                updateParentWithDevices(refreshedDeviceList);
              }
            } catch (queryError) {
              console.error(`Failed to re-query state for ${deviceId} after command:`, queryError);
            }
          }, 1000);
        }
      } else {
        toast({
          title: "Command Failed",
          description: `Could not change ${device.name} state. Reverting UI. Error: ${commandResult?.errorCode || 'Unknown error'}`,
          variant: "destructive",
        });
        newDeviceList = displayedDevices.map(d =>
          d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d
        );
        setDisplayedDevices(newDeviceList);
        updateParentWithDevices(newDeviceList);
      }
    } catch (err: any) {
      toast({
        title: "API Error",
        description: `Error controlling ${device.name}: ${err.message}. Reverting UI.`,
        variant: "destructive",
      });
       newDeviceList = displayedDevices.map(d =>
        d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d
      );
       setDisplayedDevices(newDeviceList);
       updateParentWithDevices(newDeviceList);
    }
  };

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-6 text-center">Your Selected Devices</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 p-4 border rounded-lg bg-card shadow-md">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto">
        <ServerCrash className="h-5 w-5" />
        <AlertTitle>Error Loading Devices</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!hasSelectedDevices && !isLoading) {
    return (
      <Alert className="max-w-lg mx-auto">
        <Settings2 className="h-5 w-5" />
        <AlertTitle>No Devices Selected for Dashboard</AlertTitle>
        <AlertDescription>
          You haven't selected any devices to display on your dashboard yet.
          Go to the device management page to choose which devices you'd like to control.
        </AlertDescription>
        <div className="mt-4">
          <Button asChild>
            <Link href="/manage-devices">
              <Settings2 className="mr-2 h-4 w-4" /> Manage Devices
            </Link>
          </Button>
        </div>
      </Alert>
    );
  }
  
  if (displayedDevices.length === 0 && hasSelectedDevices && !isLoading) {
     return (
       <Alert className="max-w-lg mx-auto">
        <WifiOff className="h-5 w-5" />
        <AlertTitle>No Devices to Display</AlertTitle>
        <AlertDescription>
          Selected devices might be offline or no longer available from your smart home bridge.
          Try managing your devices or check your bridge connection.
        </AlertDescription>
         <div className="mt-4">
          <Button asChild variant="outline">
            <Link href="/manage-devices">
              <Settings2 className="mr-2 h-4 w-4" /> Manage Devices
            </Link>
          </Button>
        </div>
      </Alert>
    );
  }


  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6 text-center">Your Selected Devices</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {displayedDevices.map((device) => (
          <DeviceCard 
            key={device.id} 
            device={device} 
            onToggleState={ (device.type === 'light' || device.type === 'switch' || device.type === 'fan' || device.type === 'outlet') && device.online ? handleToggleDeviceState : undefined}
          />
        ))}
      </div>
    </div>
  );
}

