// src/components/settings/ManageRoutinesContent.tsx
"use client";

import { useState, useEffect } from 'react';
import type { Routine, RoutineAction } from '@/types/preferences';
import type { Device } from '@/types/home-assistant';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { fetchDevicesFromApi } from '@/services/homeAssistantService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Edit3, Trash2, Workflow, Settings2, AlertCircle, Sparkles, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RoutineForm } from './RoutineForm';
import Link from 'next/link';

export function ManageRoutinesContent() {
  const {
    routines, addRoutine, updateRoutine, deleteRoutine,
    preferences, 
    isLoading: isLoadingPreferences, error: preferencesError
  } = useUserPreferences();
  const { toast } = useToast();

  const [allApiDevices, setAllApiDevices] = useState<Device[]>([]);
  const [isLoadingApiDevices, setIsLoadingApiDevices] = useState(true);
  const [apiDevicesError, setApiDevicesError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false); // Used by parent for dialog save, etc.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentRoutine, setCurrentRoutine] = useState<Routine | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const dashboardSelectedDevices = allApiDevices.filter(
    d => preferences?.selectedDeviceIds?.includes(d.id)
  );

  useEffect(() => {
    async function loadAllDevices() {
      setIsLoadingApiDevices(true);
      setApiDevicesError(null);
      try {
        const fetched = await fetchDevicesFromApi();
        setAllApiDevices(fetched);
      } catch (err: any) {
        setApiDevicesError(err.message || "Failed to fetch devices from bridge.");
        toast({ title: "Error", description: "Could not load available devices for routines.", variant: "destructive" });
      } finally {
        setIsLoadingApiDevices(false);
      }
    }
    loadAllDevices();
  }, [toast]);

  const handleOpenDialog = (routine?: Routine) => {
    if (dashboardSelectedDevices.length === 0 && !isLoadingApiDevices && !isLoadingPreferences) {
      toast({
        title: "No Dashboard Devices",
        description: "Please select devices for your dashboard first. Routines use dashboard devices.",
        variant: "default"
      });
      return;
    }
    if (routine) {
      setCurrentRoutine(routine);
      setIsEditing(true);
    } else {
      setCurrentRoutine(null);
      setIsEditing(false);
    }
    setDialogOpen(true);
  };

  const handleSaveRoutine = async (data: Omit<Routine, 'id'> | Routine) => {
    setIsSaving(true);
    try {
      if ('id' in data) { 
        await updateRoutine(data.id, data);
        toast({ title: "Routine Updated", description: `Routine "${data.name}" has been updated.` });
      } else { 
        await addRoutine(data);
        toast({ title: "Routine Added", description: `New routine "${data.name}" has been created.` });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message || "Could not save routine.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRoutine = async (routineId: string, routineName: string) => {
    if (!confirm(`Are you sure you want to delete the routine "${routineName}"?`)) return;
    setIsSaving(true); // Consider a specific isDeleting state if needed
    try {
      await deleteRoutine(routineId);
      toast({ title: "Routine Deleted", description: `Routine "${routineName}" has been deleted.` });
    } catch (err: any)      {
      toast({ title: "Delete Failed", description: err.message || "Could not delete routine.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const getDeviceName = (deviceId: string) => {
    return allApiDevices.find(d => d.id === deviceId)?.name || deviceId;
  };
  
  const formatAction = (action: RoutineAction): string => {
    const deviceName = getDeviceName(action.deviceId);
    const commandText = action.command.replace('_', ' ');
    return `${commandText} ${deviceName}`;
  };

  const isLoading = isLoadingPreferences || isLoadingApiDevices;

  if (isLoading) {
    return (
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center"><Workflow className="mr-2 h-6 w-6 text-primary" />Manage Routines</CardTitle>
          <CardDescription>Loading routines and device data...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (preferencesError || apiDevicesError) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle>Error Loading Data</AlertTitle>
        <AlertDescription>{preferencesError?.message || apiDevicesError || "An unexpected error occurred."}</AlertDescription>
      </Alert>
    );
  }
  
  const noDevicesOnDashboard = !preferences?.selectedDeviceIds || preferences.selectedDeviceIds.length === 0;

  return (
    <>
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center"><Sparkles className="mr-2 h-6 w-6 text-primary" />Custom Voice Routines</CardTitle>
          <CardDescription>
            Define custom voice phrases (e.g., "movie time") to trigger a sequence of actions.
            These phrases are recognized after you say "Jarvis".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {noDevicesOnDashboard && (
             <Alert variant="default" className="border-primary/30">
              <Settings2 className="h-5 w-5 text-primary" />
              <AlertTitle className="text-primary">Setup Dashboard Devices First</AlertTitle>
              <AlertDescription>
                To create routines, you first need to select which devices are available on your dashboard, as routines can only control these selected devices.
                <br />
                <Button asChild variant="link" className="p-0 h-auto mt-1 text-base">
                  <Link href="/manage-devices">Go to Manage Dashboard Devices</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {routines.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No routines configured yet. Click "Add New Routine" to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {routines.map(routine => (
                <Card key={routine.id} className="shadow-sm hover:shadow-md transition-shadow bg-card">
                  <CardHeader className="pb-3 pt-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-grow min-w-0">
                        <CardTitle className="text-lg truncate flex items-center" title={routine.name}>
                          <Workflow className="mr-2 h-5 w-5 text-muted-foreground" />
                          {routine.name}
                        </CardTitle>
                        <CardDescription className="text-sm mt-1">
                          Trigger phrase: <span className="font-semibold text-accent">"{routine.phrase}"</span>
                        </CardDescription>
                      </div>
                      <div className="space-x-2 flex-shrink-0">
                        <Button variant="outline" size="sm" onClick={() => handleOpenDialog(routine)} disabled={isSaving || noDevicesOnDashboard}>
                          <Edit3 className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteRoutine(routine.id, routine.name)} disabled={isSaving}>
                          <Trash2 className="mr-1 h-3 w-3" /> Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Actions:</p>
                    <ul className="list-none space-y-1 pl-1">
                      {routine.actions.map((action, index) => (
                        <li key={index} className="text-xs text-foreground flex items-center">
                          <ChevronRight className="h-3 w-3 mr-1 text-primary"/> {formatAction(action)}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={() => handleOpenDialog()} disabled={isSaving || (noDevicesOnDashboard && !isLoadingApiDevices && !isLoadingPreferences) }>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Routine
          </Button>
           {noDevicesOnDashboard && <p className="ml-4 text-sm text-muted-foreground">Add devices to dashboard to enable routine creation.</p>}
        </CardFooter>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setCurrentRoutine(null); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-2xl">
          <RoutineForm
            key={currentRoutine?.id || 'new-routine-form'} 
            routine={currentRoutine}
            availableDevices={dashboardSelectedDevices} // Pass only dashboard-selected devices
            onSave={handleSaveRoutine}
            onCancel={() => setDialogOpen(false)}
            isEditing={isEditing}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
