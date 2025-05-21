
// src/app/(app)/dashboard/page.tsx
"use client";

import { VoiceControl } from '@/components/dashboard/VoiceControl';
import { DeviceDisplay } from '@/components/dashboard/DeviceDisplay';
import { Separator } from '@/components/ui/separator';
import type { Device } from '@/types/home-assistant';
import { useState, useCallback } from 'react';
import { queryDeviceStatesFromApi } from '@/services/homeAssistantService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const [dashboardDevices, setDashboardDevices] = useState<Device[]>([]);
  const { toast } = useToast();
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  const handleRefreshDeviceStates = useCallback(async (deviceIdsToRefresh: string[]) => {
    if (deviceIdsToRefresh.length === 0) return;
    
    // Determine if this call is for a global refresh triggered by the button
    const isTriggeredByGlobalButton = deviceIdsToRefresh.length === dashboardDevices.length && 
                           dashboardDevices.every(d => deviceIdsToRefresh.includes(d.id));
    
    if (isTriggeredByGlobalButton && !isRefreshingAll) { // Check !isRefreshingAll to prevent re-entry if already refreshing
      setIsRefreshingAll(true);
    }

    try {
      const newStates = await queryDeviceStatesFromApi(deviceIdsToRefresh);
      setDashboardDevices(prevDevices => 
        prevDevices.map(device => {
          if (newStates[device.id]) {
            return {
              ...device,
              state: newStates[device.id].state,
              online: newStates[device.id].online,
            };
          }
          return device;
        })
      );
      if (isTriggeredByGlobalButton) {
        toast({ title: "Device States Refreshed", description: "All device states have been updated." });
      }
      // For single device refresh (from voice query), no separate toast is needed here as VoiceControl handles its own feedback.
    } catch (error) {
      console.error("Error refreshing device states:", error);
      toast({ title: "Refresh Error", description: "Could not update device states.", variant: "destructive" });
    } finally {
      if (isTriggeredByGlobalButton) {
        setIsRefreshingAll(false);
      }
    }
  }, [toast, dashboardDevices, isRefreshingAll]); // Added dashboardDevices and isRefreshingAll

  const handleDevicesLoadedOrUpdated = useCallback((devices: Device[]) => {
    setDashboardDevices(devices);
  }, []);

  const handleRefreshAllClick = () => {
    if (dashboardDevices.length > 0) {
      handleRefreshDeviceStates(dashboardDevices.map(d => d.id));
    } else {
      toast({ title: "No Devices", description: "No devices loaded on the dashboard to refresh."});
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end mb-4">
        <Button onClick={handleRefreshAllClick} disabled={isRefreshingAll || dashboardDevices.length === 0} variant="outline">
          {isRefreshingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh Device States
        </Button>
      </div>
      <VoiceControl
        selectedDevices={dashboardDevices}
        onRefreshDeviceStates={handleRefreshDeviceStates}
      />
      <Separator className="my-10" />
      <DeviceDisplay onDevicesLoaded={handleDevicesLoadedOrUpdated} />
    </div>
  );
}
