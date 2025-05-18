
// src/components/dashboard/ManageDevicesContent.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import { useEffect, useState } from 'react';
import { fetchDevicesFromApi } from '@/services/homeAssistantService';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ListChecks, AlertCircle, CheckSquare, Square, Save, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

const SELECTED_DEVICES_LS_KEY = 'homepilot_selected_device_ids';

export function ManageDevicesContent() {
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadAllDevices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedDevices = await fetchDevicesFromApi();
        setAllDevices(fetchedDevices);
      } catch (err: any) {
        console.error("Failed to fetch all devices:", err);
        setError(err.message || "Could not load devices. Please try again.");
        setAllDevices([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllDevices();

    // Load selected devices from localStorage
    if (typeof window !== 'undefined') {
      const storedSelection = localStorage.getItem(SELECTED_DEVICES_LS_KEY);
      if (storedSelection) {
        try {
          setSelectedDeviceIds(new Set(JSON.parse(storedSelection)));
        } catch (e) {
          console.error("Failed to parse selected devices from localStorage", e);
          localStorage.removeItem(SELECTED_DEVICES_LS_KEY); // Clear invalid data
        }
      }
    }
  }, []);

  const handleToggleSelection = (deviceId: string) => {
    setSelectedDeviceIds(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(deviceId)) {
        newSelected.delete(deviceId);
      } else {
        newSelected.add(deviceId);
      }
      return newSelected;
    });
  };

  const handleSaveSelection = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_DEVICES_LS_KEY, JSON.stringify(Array.from(selectedDeviceIds)));
      toast({
        title: "Selection Saved",
        description: `${selectedDeviceIds.size} devices will now be shown on your dashboard.`,
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-3xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><ListChecks className="mr-2 h-6 w-6 text-primary" /> Manage Dashboard Devices</CardTitle>
          <CardDescription>Loading available devices...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 border rounded-md bg-card/50">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle>Error Loading Devices</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center"><ListChecks className="mr-2 h-6 w-6 text-primary" /> Manage Dashboard Devices</CardTitle>
        <CardDescription>Select the devices you want to see and control on your main dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto p-4">
        {allDevices.length === 0 && !isLoading ? (
           <Alert>
            <ListChecks className="h-5 w-5" />
            <AlertTitle>No Devices Found</AlertTitle>
            <AlertDescription>
              Could not find any devices from your smart home bridge. 
              Ensure it's running and correctly configured.
            </AlertDescription>
          </Alert>
        ) : (
          allDevices.map(device => (
            <div key={device.id} className="flex items-center space-x-3 p-3 border rounded-md hover:bg-muted/20 transition-colors duration-150">
              <Checkbox
                id={`device-${device.id}`}
                checked={selectedDeviceIds.has(device.id)}
                onCheckedChange={() => handleToggleSelection(device.id)}
                aria-label={`Select ${device.name}`}
              />
              <label
                htmlFor={`device-${device.id}`}
                className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {device.name} <span className="text-xs text-muted-foreground">({device.type}, ID: {device.id})</span>
              </label>
              {selectedDeviceIds.has(device.id) ? <CheckSquare className="h-5 w-5 text-accent" /> : <Square className="h-5 w-5 text-muted-foreground" />}
            </div>
          ))
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t">
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
        <Button onClick={handleSaveSelection} disabled={allDevices.length === 0}>
          <Save className="mr-2 h-4 w-4" />
          Save to Dashboard
        </Button>
      </CardFooter>
    </Card>
  );
}
