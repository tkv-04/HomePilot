
// src/components/dashboard/ManageDevicesContent.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import { useEffect, useState, useMemo } from 'react';
import { fetchDevicesFromApi } from '@/services/homeAssistantService';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ListChecks, AlertCircle, CheckSquare, Square, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';

export function ManageDevicesContent() {
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [localSelectedDeviceIds, setLocalSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { 
    preferences, 
    updateSelectedDeviceIds, 
    isLoading: isLoadingPreferences,
    error: preferencesError 
  } = useUserPreferences();

  useEffect(() => {
    const loadAllDevices = async () => {
      setIsLoadingDevices(true);
      setError(null);
      try {
        const fetchedDevices = await fetchDevicesFromApi();
        setAllDevices(fetchedDevices);
      } catch (err: any) {
        console.error("Failed to fetch all devices:", err);
        setError(err.message || "Could not load devices. Please try again.");
        setAllDevices([]);
      } finally {
        setIsLoadingDevices(false);
      }
    };
    loadAllDevices();
  }, []);

  useEffect(() => {
    if (preferences?.selectedDeviceIds) {
      setLocalSelectedDeviceIds(new Set(preferences.selectedDeviceIds));
    } else if (!isLoadingPreferences && !preferencesError) {
        // If preferences are loaded and selectedDeviceIds is undefined/null (e.g. new user), initialize as empty set
        setLocalSelectedDeviceIds(new Set());
    }
  }, [preferences, isLoadingPreferences, preferencesError]);

  const handleToggleSelection = (deviceId: string) => {
    setLocalSelectedDeviceIds(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(deviceId)) {
        newSelected.delete(deviceId);
      } else {
        newSelected.add(deviceId);
      }
      return newSelected;
    });
  };

  const handleSaveSelection = async () => {
    setIsSaving(true);
    try {
      await updateSelectedDeviceIds(Array.from(localSelectedDeviceIds));
      toast({
        title: "Selection Saved",
        description: `${localSelectedDeviceIds.size} devices will now be shown on your dashboard.`,
      });
    } catch (err) {
      toast({
        title: "Save Failed",
        description: "Could not save your device selection. Please try again.",
        variant: "destructive",
      });
      console.error("Failed to save selection to Firestore:", err);
    } finally {
      setIsSaving(false);
    }
  };
  
  const isLoading = isLoadingDevices || isLoadingPreferences;

  if (isLoading) {
    return (
      <Card className="w-full max-w-3xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><ListChecks className="mr-2 h-6 w-6 text-primary" /> Manage Dashboard Devices</CardTitle>
          <CardDescription>Loading available devices and your preferences...</CardDescription>
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

  if (error || preferencesError) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error || preferencesError?.message || "An unexpected error occurred."}</AlertDescription>
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
        {allDevices.length === 0 && !isLoadingDevices ? (
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
                checked={localSelectedDeviceIds.has(device.id)}
                onCheckedChange={() => handleToggleSelection(device.id)}
                aria-label={`Select ${device.name}`}
                disabled={isSaving}
              />
              <label
                htmlFor={`device-${device.id}`}
                className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {device.name} <span className="text-xs text-muted-foreground">({device.type}, ID: {device.id})</span>
              </label>
              {localSelectedDeviceIds.has(device.id) ? <CheckSquare className="h-5 w-5 text-accent" /> : <Square className="h-5 w-5 text-muted-foreground" />}
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
        <Button onClick={handleSaveSelection} disabled={allDevices.length === 0 || isSaving || isLoadingPreferences}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save to Dashboard
        </Button>
      </CardFooter>
    </Card>
  );
}
