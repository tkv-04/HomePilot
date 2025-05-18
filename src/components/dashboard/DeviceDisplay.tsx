// src/components/dashboard/DeviceDisplay.tsx
"use client";

import { useEffect, useState } from 'react';
import type { Device } from '@/types/home-assistant';
import { 
  fetchDevicesFromApi, 
  queryDeviceStatesFromApi, 
  executeDeviceCommandOnApi 
} from '@/services/homeAssistantService'; // Updated import
import { DeviceCard } from './DeviceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function DeviceDisplay() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadDevices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedDevices = await fetchDevicesFromApi();
        if (fetchedDevices.length > 0) {
          const deviceIds = fetchedDevices.map(d => d.id);
          const states = await queryDeviceStatesFromApi(deviceIds);
          
          const updatedDevices = fetchedDevices.map(device => {
            const deviceStateInfo = states[device.id];
            return {
              ...device,
              state: deviceStateInfo ? deviceStateInfo.state : 'unknown',
              online: deviceStateInfo ? deviceStateInfo.online : false,
            };
          });
          setDevices(updatedDevices);
        } else {
          setDevices([]);
        }
      } catch (err: any) {
        console.error("Failed to fetch devices from API:", err);
        setError(err.message || "Could not load devices. Please check the connection to the smart home bridge.");
        setDevices([]); // Clear devices on error
      } finally {
        setIsLoading(false);
      }
    };

    loadDevices();
  }, []);

  const handleToggleDeviceState = async (deviceId: string, currentDeviceState: Device['state']) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    // For toggleable devices, currentDeviceState should be 'on' or 'off'
    const currentOnState = currentDeviceState === 'on';
    const targetOnState = !currentOnState;

    // Optimistically update UI
    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.id === deviceId ? { ...d, state: targetOnState ? 'on' : 'off' } : d
      )
    );

    try {
      const result = await executeDeviceCommandOnApi(
        deviceId,
        'action.devices.commands.OnOff', // Standard OnOff command
        { on: targetOnState }
      );

      if (result.success) {
        toast({
          title: "Command Sent",
          description: `${device.name} turned ${targetOnState ? 'ON' : 'OFF'}.`,
        });
        // Optionally, re-query state for this device or trust the result
        if (result.newState !== undefined) {
           setDevices(prevDevices =>
            prevDevices.map(d =>
              d.id === deviceId ? { ...d, state: result.newState!, online: true } : d
            )
          );
        } else {
          // If API doesn't return new state, re-query just this device after a short delay
          setTimeout(async () => {
            const updatedStates = await queryDeviceStatesFromApi([deviceId]);
            if (updatedStates[deviceId]) {
              setDevices(prevDevices =>
                prevDevices.map(d =>
                  d.id === deviceId ? { ...d, state: updatedStates[deviceId].state, online: updatedStates[deviceId].online } : d
                )
              );
            }
          }, 1000);
        }
      } else {
        toast({
          title: "Command Failed",
          description: `Could not change ${device.name} state. Reverting UI.`,
          variant: "destructive",
        });
        // Revert optimistic update
        setDevices(prevDevices =>
          prevDevices.map(d =>
            d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d
          )
        );
      }
    } catch (err: any) {
      toast({
        title: "API Error",
        description: `Error controlling ${device.name}: ${err.message}. Reverting UI.`,
        variant: "destructive",
      });
       // Revert optimistic update
       setDevices(prevDevices =>
        prevDevices.map(d =>
          d.id === deviceId ? { ...d, state: currentOnState ? 'on' : 'off' } : d
        )
      );
    }
  };

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-6 text-center">Your Devices</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 p-4 border rounded-lg bg-card">
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

  if (devices.length === 0) {
    return (
       <Alert className="max-w-lg mx-auto">
        <WifiOff className="h-5 w-5" />
        <AlertTitle>No Devices Found</AlertTitle>
        <AlertDescription>
          Could not find any devices from your smart home bridge. 
          Please ensure it's running and correctly configured.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6 text-center">Your Devices</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {devices.map((device) => (
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
