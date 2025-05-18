
// src/app/(app)/dashboard/page.tsx
"use client";

import { VoiceControl } from '@/components/dashboard/VoiceControl';
import { DeviceDisplay } from '@/components/dashboard/DeviceDisplay';
import { Separator } from '@/components/ui/separator';
import type { Device } from '@/types/home-assistant';
import { useState, useCallback } from 'react';
import { queryDeviceStatesFromApi } from '@/services/homeAssistantService';
import { useToast } from '@/hooks/use-toast';

export default function DashboardPage() {
  const [dashboardDevices, setDashboardDevices] = useState<Device[]>([]);
  const { toast } = useToast();

  const handleRefreshDeviceStates = useCallback(async (deviceIdsToRefresh: string[]) => {
    if (deviceIdsToRefresh.length === 0) return;
    try {
      const newStates = await queryDeviceStatesFromApi(deviceIdsToRefresh);
      setDashboardDevices(prevDevices => 
        prevDevices.map(device => {
          if (newStates[device.id]) {
            // Ensure we merge, not just overwrite, if newStates[device.id] is partial
            return {
              ...device,
              state: newStates[device.id].state,
              online: newStates[device.id].online,
            };
          }
          return device;
        })
      );
      // Optional: toast({ title: "Device States Refreshed" });
    } catch (error) {
      console.error("Error refreshing device states for voice query:", error);
      toast({ title: "Refresh Error", description: "Could not update device states.", variant: "destructive" });
    }
  }, [toast]);

  const handleDevicesLoadedOrUpdated = useCallback((devices: Device[]) => {
    setDashboardDevices(devices);
  }, []);

  return (
    <div className="space-y-8">
      <VoiceControl
        selectedDevices={dashboardDevices}
        onRefreshDeviceStates={handleRefreshDeviceStates}
      />
      <Separator className="my-10" />
      <DeviceDisplay onDevicesLoaded={handleDevicesLoadedOrUpdated} />
    </div>
  );
}
