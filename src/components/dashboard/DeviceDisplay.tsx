// src/components/dashboard/DeviceDisplay.tsx
"use client";

import { useEffect, useState } from 'react';
import type { Device } from '@/types/home-assistant';
import { fetchDevices } from '@/services/homeAssistantService';
import { DeviceCard } from './DeviceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash } from 'lucide-react';

export function DeviceDisplay() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDevices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedDevices = await fetchDevices();
        setDevices(fetchedDevices);
      } catch (err) {
        console.error("Failed to fetch devices:", err);
        setError("Could not load devices. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDevices();
  }, []);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-6 text-center">Your Devices</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
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
       <Alert className="max-w-md mx-auto">
        <AlertTitle>No Devices Found</AlertTitle>
        <AlertDescription>It seems there are no devices to display at the moment.</AlertDescription>
      </Alert>
    );
  }

  // Group devices by type for potentially different section rendering in future
  const groupedDevices: { [key: string]: Device[] } = devices.reduce((acc, device) => {
    const type = device.type || 'other';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(device);
    return acc;
  }, {} as { [key: string]: Device[] });


  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6 text-center">Your Devices</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {devices.map((device) => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>
    </div>
  );
}
