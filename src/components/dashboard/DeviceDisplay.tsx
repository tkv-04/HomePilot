
// src/components/dashboard/DeviceDisplay.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import type { Room } from '@/types/preferences';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  fetchDevicesFromApi, 
  queryDeviceStatesFromApi, 
  executeDeviceCommandsOnApi
} from '@/services/homeAssistantService';
import { DeviceCard } from './DeviceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash, WifiOff, Settings2, HomeIcon, ListChecks } from 'lucide-react'; // Added HomeIcon, ListChecks
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface DeviceDisplayProps {
  onDevicesLoaded?: (devices: Device[]) => void;
}

export function DeviceDisplay({ onDevicesLoaded }: DeviceDisplayProps) {
  const [allApiDevices, setAllApiDevices] = useState<Device[]>([]);
  const [devicesWithState, setDevicesWithState] = useState<Device[]>([]);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const { toast } = useToast();
  const { 
    preferences, 
    isLoading: isLoadingPreferences, 
    error: preferencesError,
    rooms 
  } = useUserPreferences();

  const updateParentWithDevices = useCallback((devices: Device[]) => {
    if (onDevicesLoaded) {
      onDevicesLoaded(devices);
    }
  }, [onDevicesLoaded]);

  useEffect(() => {
    const loadInitialDeviceList = async () => {
       setIsLoadingInitialData(true);
       setError(null);
      try {
        const fetchedDevices = await fetchDevicesFromApi();
        setAllApiDevices(fetchedDevices);
      } catch (err: any) {
         console.error("Failed to fetch initial device list from API:", err);
         let displayError = "Could not load device list from bridge.";
         if (err && err.message) displayError = `Error fetching device list: ${err.message}.`;
         setError(displayError);
         setAllApiDevices([]); // Clear devices on error
         setIsLoadingInitialData(false);
         setHasAttemptedLoad(true);
      }
      // Note: We don't set setIsLoadingInitialData to false here yet, 
      // as we still need to load preferences and then device states.
    };
    loadInitialDeviceList();
  }, []);


  useEffect(() => {
    const loadSelectedDevicesAndStates = async () => {
      if (isLoadingPreferences || allApiDevices.length === 0 && !error) { 
        // Wait for preferences and initial API device list to load, or if there's already an error from initial load.
         if(!isLoadingPreferences && allApiDevices.length === 0 && !error && hasAttemptedLoad) {
            // All API devices loaded, but it's an empty list (and no error from API itself)
            setDevicesWithState([]);
            updateParentWithDevices([]);
            setIsLoadingInitialData(false); // Done loading if API returned empty
        } else if (!isLoadingInitialData && error) {
            // If an error occurred fetching allApiDevices, don't proceed.
            setDevicesWithState([]);
            updateParentWithDevices([]);
        }
        // else, still loading preferences or allApiDevices, so just wait.
        return;
      }
      
      if (preferencesError) {
        setError(`Failed to load user preferences: ${preferencesError.message}`);
        setDevicesWithState([]);
        updateParentWithDevices([]);
        setIsLoadingInitialData(false);
        setHasAttemptedLoad(true);
        return;
      }

      // If error is already set from fetching allApiDevices, don't proceed.
      if (error && allApiDevices.length === 0) {
         setIsLoadingInitialData(false);
         setHasAttemptedLoad(true);
         return;
      }
      
      // Start loading states if we haven't already started (setIsLoadingInitialData might still be true from previous effect)
      if(isLoadingInitialData && !error) setIsLoadingInitialData(true);
      if(!error) setError(null); // Clear previous non-critical errors if we are proceeding
      setDevicesWithState([]); // Clear previous states

      const selectedIds = preferences?.selectedDeviceIds || [];
      
      if (selectedIds.length === 0) {
        setIsLoadingInitialData(false);
        updateParentWithDevices([]);
        setDevicesWithState([]);
        setHasAttemptedLoad(true);
        return;
      }

      try {
        const devicesToQueryStatesFor = allApiDevices.filter(device => selectedIds.includes(device.id));

        if (devicesToQueryStatesFor.length > 0) {
          const deviceIdsToQuery = devicesToQueryStatesFor.map(d => d.id);
          const states = await queryDeviceStatesFromApi(deviceIdsToQuery);
          
          const updatedDevices = devicesToQueryStatesFor.map(device => {
            const deviceStateInfo = states[device.id];
            return {
              ...device,
              state: deviceStateInfo ? deviceStateInfo.state : 'unknown',
              online: deviceStateInfo ? deviceStateInfo.online : false,
            };
          });
          setDevicesWithState(updatedDevices);
          updateParentWithDevices(updatedDevices);
        } else {
          setDevicesWithState([]);
          updateParentWithDevices([]);
        }
      } catch (err: any) {
        console.error("Failed to query device states from API. Full error object:", err);
        let displayError = "Could not load device states. Please check the connection to the smart home bridge or see browser console for details.";
        if (err && err.message) {
            displayError = `Error querying states: ${err.message}. Check browser console for more details.`;
        } else if (typeof err === 'string') {
            displayError = `Error: ${err}. Check browser console for more details.`;
        }
        setError(displayError);
        setDevicesWithState([]);
        updateParentWithDevices([]);
      } finally {
        setIsLoadingInitialData(false);
        setHasAttemptedLoad(true);
      }
    };
    
    // Only run if allApiDevices has been populated (or initial load errored)
    if (allApiDevices.length > 0 || (hasAttemptedLoad && error)) {
       loadSelectedDevicesAndStates();
    } else if (!isLoadingInitialData && allApiDevices.length === 0 && !error && hasAttemptedLoad) {
        // Case: API loaded, returned no devices, no error.
        setIsLoadingInitialData(false);
        setDevicesWithState([]);
        updateParentWithDevices([]);
    }

  }, [allApiDevices, preferences, isLoadingPreferences, preferencesError, updateParentWithDevices, error, hasAttemptedLoad, isLoadingInitialData]);

  const handleToggleDeviceState = async (deviceId: string, currentDeviceState: Device['state']) => {
    const device = devicesWithState.find(d => d.id === deviceId);
    if (!device) return;

    const currentOnState = currentDeviceState === 'on';
    const targetOnState = !currentOnState;

    let newDeviceList = devicesWithState.map(d =>
      d.id === deviceId ? { ...d, state: targetOnState ? 'on' : 'off' } : d
    );
    setDevicesWithState(newDeviceList);
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
           newDeviceList = devicesWithState.map(d =>
            d.id === deviceId ? { ...d, state: newApiState, online: newApiOnline } : d
          );
        } else {
           const updatedStates = await queryDeviceStatesFromApi([deviceId]);
           if (updatedStates[deviceId]) {
             newDeviceList = devicesWithState.map(d =>
               d.id === deviceId ? { ...d, state: updatedStates[deviceId].state, online: updatedStates[deviceId].online } : d
             );
           }
        }
        setDevicesWithState(newDeviceList);
        updateParentWithDevices(newDeviceList);

      } else {
        toast({
          title: "Command Failed",
          description: `Could not change ${device.name} state. Reverting UI. Error: ${commandResult?.errorCode || 'Unknown error'}`,
          variant: "destructive",
        });
        newDeviceList = devicesWithState.map(d =>
          d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d
        );
        setDevicesWithState(newDeviceList);
        updateParentWithDevices(newDeviceList);
      }
    } catch (err: any) {
      toast({
        title: "API Error",
        description: `Error controlling ${device.name}: ${err.message}. Reverting UI.`,
        variant: "destructive",
      });
       newDeviceList = devicesWithState.map(d =>
        d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d
      );
       setDevicesWithState(newDeviceList);
       updateParentWithDevices(newDeviceList);
    }
  };
  
  const { devicesInRooms, devicesNotInRooms } = useMemo(() => {
    const inRooms: Record<string, Device[]> = {};
    const notInRooms: Device[] = [];
    const allRoomDeviceIds = new Set(rooms.flatMap(room => room.deviceIds));

    devicesWithState.forEach(device => {
      let inARoom = false;
      for (const room of rooms) {
        if (room.deviceIds.includes(device.id)) {
          if (!inRooms[room.id]) {
            inRooms[room.id] = [];
          }
          inRooms[room.id].push(device);
          inARoom = true; 
          // A device can be in multiple rooms by this logic if UI allows,
          // but for display, we'll just pick the first room it's found in for this grouping.
          // Or, if you want devices to appear under each room they are part of, the logic would be slightly different.
          // For simplicity, let's assume a device is primarily grouped under one room for display in this accordion.
          // The current logic for `inRooms[room.id].push(device)` will add it to every room it belongs to.
        }
      }
      if (!inARoom) {
        notInRooms.push(device);
      }
    });
    return { devicesInRooms: inRooms, devicesNotInRooms: notInRooms };
  }, [devicesWithState, rooms]);

  const isLoading = isLoadingInitialData || isLoadingPreferences;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold mb-6 text-center">Your Smart Home Dashboard</h2>
         <Accordion type="multiple" defaultValue={['loading-placeholder']} className="w-full">
          <AccordionItem value="loading-placeholder">
            <AccordionTrigger>
              <Skeleton className="h-6 w-32" />
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="space-y-3 p-4 border rounded-lg bg-card shadow-md">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-10 w-1/2" />
                    <Skeleton className="h-4 w-1/4" />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
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

  const noDevicesSelectedOnDashboard = !preferences?.selectedDeviceIds || preferences.selectedDeviceIds.length === 0;

  if (hasAttemptedLoad && noDevicesSelectedOnDashboard && !isLoading) {
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
              <Settings2 className="mr-2 h-4 w-4" /> Manage Dashboard Devices
            </Link>
          </Button>
        </div>
      </Alert>
    );
  }
  
  if (hasAttemptedLoad && devicesWithState.length === 0 && !noDevicesSelectedOnDashboard && !isLoading) {
     return (
       <Alert className="max-w-lg mx-auto">
        <WifiOff className="h-5 w-5" />
        <AlertTitle>No Devices to Display</AlertTitle>
        <AlertDescription>
          None of your selected dashboard devices could be loaded. They might be offline or no longer available.
          Try managing your devices or check your smart home bridge connection.
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
  
  const defaultAccordionOpenValues = rooms.length > 0 ? [rooms[0].id, ...(devicesNotInRooms.length > 0 ? ['other-devices'] : [])] : (devicesNotInRooms.length > 0 ? ['other-devices'] : []);


  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold mb-6 text-center">Your Smart Home Dashboard</h2>
      <Accordion type="multiple" defaultValue={defaultAccordionOpenValues} className="w-full space-y-4">
        {rooms.map((room) => {
          const roomDevices = devicesInRooms[room.id] || [];
          if (roomDevices.length === 0) return null; // Don't render accordion for room with no selected devices
          return (
            <AccordionItem value={room.id} key={room.id} className="border bg-card shadow-sm rounded-lg">
              <AccordionTrigger className="px-6 py-4 hover:no-underline text-lg font-medium">
                <div className="flex items-center">
                  <HomeIcon className="h-6 w-6 mr-3 text-primary" />
                  {room.name}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-0">
                {roomDevices.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-4">
                    {roomDevices.map((device) => (
                      <DeviceCard 
                        key={device.id} 
                        device={device} 
                        onToggleState={ (device.type === 'light' || device.type === 'switch' || device.type === 'fan' || device.type === 'outlet') && device.online ? handleToggleDeviceState : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground pt-4">No devices from this room are selected for the dashboard or available.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}

        {devicesNotInRooms.length > 0 && (
          <AccordionItem value="other-devices" className="border bg-card shadow-sm rounded-lg">
            <AccordionTrigger className="px-6 py-4 hover:no-underline text-lg font-medium">
               <div className="flex items-center">
                  <ListChecks className="h-6 w-6 mr-3 text-primary" />
                  Other Devices
                </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-4">
                {devicesNotInRooms.map((device) => (
                  <DeviceCard 
                    key={device.id} 
                    device={device} 
                    onToggleState={ (device.type === 'light' || device.type === 'switch' || device.type === 'fan' || device.type === 'outlet') && device.online ? handleToggleDeviceState : undefined}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

