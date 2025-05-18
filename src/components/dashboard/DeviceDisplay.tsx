
// src/components/dashboard/DeviceDisplay.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import { useEffect, useState, useCallback } from 'react';
import { 
  fetchDevicesFromApi, 
  queryDeviceStatesFromApi, 
  executeDeviceCommandsOnApi
} from '@/services/homeAssistantService';
import { DeviceCard } from './DeviceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash, WifiOff, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useUserPreferences } from '@/contexts/UserPreferencesContext'; // Added import

interface DeviceDisplayProps {
  onDevicesLoaded?: (devices: Device[]) => void;
}

export function DeviceDisplay({ onDevicesLoaded }: DeviceDisplayProps) {
  const [displayedDevices, setDisplayedDevices] = useState<Device[]>([]);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const { toast } = useToast();
  const { 
    preferences, 
    isLoading: isLoadingPreferences, 
    error: preferencesError 
  } = useUserPreferences();

  const updateParentWithDevices = useCallback((devices: Device[]) => {
    if (onDevicesLoaded) {
      onDevicesLoaded(devices);
    }
  }, [onDevicesLoaded]);

  useEffect(() => {
    const loadDevices = async () => {
      if (isLoadingPreferences || !preferences) {
        // Wait for preferences to load or if there are no preferences (e.g. new user, or error)
        if(!isLoadingPreferences && !preferences && !preferencesError){
            // Preferences loaded, but no preferences object (e.g. new user with no saved prefs)
            setDisplayedDevices([]);
            updateParentWithDevices([]);
            setIsLoadingInitialData(false);
            setHasAttemptedLoad(true);
        } else if (!isLoadingPreferences && preferencesError) {
            setError(`Failed to load user preferences: ${preferencesError.message}`);
            setIsLoadingInitialData(false);
            setHasAttemptedLoad(true);
        }
        // else, still loading preferences, so just wait.
        return;
      }
      
      setIsLoadingInitialData(true);
      setError(null);
      setDisplayedDevices([]); // Clear previous devices

      const selectedIds = preferences.selectedDeviceIds || [];
      
      if (selectedIds.length === 0) {
        setIsLoadingInitialData(false);
        updateParentWithDevices([]);
        setHasAttemptedLoad(true);
        return;
      }

      try {
        const allFetchedDevices = await fetchDevicesFromApi();
        const devicesToQuery = allFetchedDevices.filter(device => selectedIds.includes(device.id));

        if (devicesToQuery.length > 0) {
          const deviceIdsToQuery = devicesToQuery.map(d => d.id);
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
        setIsLoadingInitialData(false);
        setHasAttemptedLoad(true);
      }
    };

    loadDevices();
  }, [preferences, isLoadingPreferences, preferencesError, updateParentWithDevices]);

  const handleToggleDeviceState = async (deviceId: string, currentDeviceState: Device['state']) => {
    const device = displayedDevices.find(d => d.id === deviceId);
    if (!device) return;

    const currentOnState = currentDeviceState === 'on';
    const targetOnState = !currentOnState;

    // Optimistic UI update
    let newDeviceList = displayedDevices.map(d =>
      d.id === deviceId ? { ...d, state: targetOnState ? 'on' : 'off' } : d
    );
    setDisplayedDevices(newDeviceList);
    updateParentWithDevices(newDeviceList);

    try {
      const commandToExecute = {
        deviceId: deviceId,
        command: 'action.devices.commands.OnOff',
        params: { on: targetOnState }
      };
      const result = await executeDeviceCommandsOnApi([commandToExecute]);
      const commandResult = result.commands[0]; 

      if (commandResult && commandResult.status === 'SUCCESS') {
        toast({
          title: "Command Sent",
          description: `${device.name} turned ${targetOnState ? 'ON' : 'OFF'}.`,
        });
        
        const newApiState = commandResult.states?.on !== undefined ? (commandResult.states.on ? 'on' : 'off') : undefined;
        const newApiOnline = commandResult.states?.online !== undefined ? commandResult.states.online : device.online;

        if (newApiState !== undefined) {
           newDeviceList = displayedDevices.map(d =>
            d.id === deviceId ? { ...d, state: newApiState, online: newApiOnline } : d
          );
        } else {
           // If EXECUTE doesn't return state, query it after a short delay
           const updatedStates = await queryDeviceStatesFromApi([deviceId]);
           if (updatedStates[deviceId]) {
             newDeviceList = displayedDevices.map(d =>
               d.id === deviceId ? { ...d, state: updatedStates[deviceId].state, online: updatedStates[deviceId].online } : d
             );
           }
        }
        setDisplayedDevices(newDeviceList); // Update with confirmed state
        updateParentWithDevices(newDeviceList);

      } else {
        toast({
          title: "Command Failed",
          description: `Could not change ${device.name} state. Reverting UI. Error: ${commandResult?.errorCode || 'Unknown error'}`,
          variant: "destructive",
        });
        // Revert optimistic update
        newDeviceList = displayedDevices.map(d =>
          d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d // Revert to original state
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
      // Revert optimistic update
       newDeviceList = displayedDevices.map(d =>
        d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d
      );
       setDisplayedDevices(newDeviceList);
       updateParentWithDevices(newDeviceList);
    }
  };
  
  const isLoading = isLoadingInitialData || isLoadingPreferences;

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

  const noDevicesSelected = !preferences?.selectedDeviceIds || preferences.selectedDeviceIds.length === 0;

  if (hasAttemptedLoad && noDevicesSelected && !isLoading) {
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
  
  if (hasAttemptedLoad && displayedDevices.length === 0 && !noDevicesSelected && !isLoading) {
     return (
       <Alert className="max-w-lg mx-auto">
        <WifiOff className="h-5 w-5" />
        <AlertTitle>No Devices to Display</AlertTitle>
        <AlertDescription>
          Your selected devices might be offline or no longer available from your smart home bridge.
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
