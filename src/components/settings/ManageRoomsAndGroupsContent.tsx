
// src/components/settings/ManageRoomsAndGroupsContent.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { Device } from '@/types/home-assistant';
import type { Room, DeviceGroup } from '@/types/preferences';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { fetchDevicesFromApi } from '@/services/homeAssistantService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit3, Trash2, HomeIcon, Layers3, Save, X, Loader2, AlertCircle, Settings2 } from 'lucide-react'; // Added Settings2
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import Link from 'next/link'; // Added Link for prompt

type ManageableItem = Room | DeviceGroup;
type ItemType = 'room' | 'group';

export function ManageRoomsAndGroupsContent() {
  const {
    preferences, // Added preferences to get selectedDeviceIds
    rooms, addRoom, updateRoom, deleteRoom,
    deviceGroups, addDeviceGroup, updateDeviceGroup, deleteDeviceGroup,
    isLoading: isLoadingPreferences, error: preferencesError
  } = useUserPreferences();
  const { toast } = useToast();

  const [allApiDevices, setAllApiDevices] = useState<Device[]>([]);
  const [isLoadingApiDevices, setIsLoadingApiDevices] = useState(true);
  const [apiDevicesError, setApiDevicesError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentDialogItem, setCurrentDialogItem] = useState<Partial<ManageableItem> & { name: string, deviceIds: string[] } | null>(null);
  const [currentItemType, setCurrentItemType] = useState<ItemType | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    async function loadAllDevices() {
      setIsLoadingApiDevices(true);
      setApiDevicesError(null);
      try {
        const fetched = await fetchDevicesFromApi();
        setAllApiDevices(fetched);
      } catch (err: any) {
        setApiDevicesError(err.message || "Failed to fetch devices from bridge.");
        toast({ title: "Error", description: "Could not load available devices.", variant: "destructive" });
      } finally {
        setIsLoadingApiDevices(false);
      }
    }
    loadAllDevices();
  }, [toast]);

  const selectableDevicesForRoomsAndGroups = useMemo(() => {
    if (!preferences?.selectedDeviceIds || isLoadingPreferences || isLoadingApiDevices || !allApiDevices) {
      return [];
    }
    return allApiDevices.filter(device => preferences.selectedDeviceIds!.includes(device.id));
  }, [allApiDevices, preferences, isLoadingPreferences, isLoadingApiDevices]);

  const openDialog = (type: ItemType, item?: ManageableItem) => {
    setCurrentItemType(type);
    if (item) {
      setIsEditing(true);
      // Ensure deviceIds in the item are only those present in selectableDevicesForRoomsAndGroups
      const validDeviceIds = item.deviceIds.filter(id => selectableDevicesForRoomsAndGroups.some(d => d.id === id));
      setCurrentDialogItem({ ...item, deviceIds: validDeviceIds });
    } else {
      setIsEditing(false);
      setCurrentDialogItem({ name: '', deviceIds: [] });
    }
    setDialogOpen(true);
  };

  const handleDialogInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentDialogItem) {
      setCurrentDialogItem({ ...currentDialogItem, name: e.target.value });
    }
  };

  const handleDialogDeviceToggle = (deviceId: string) => {
    if (currentDialogItem) {
      const newDeviceIds = currentDialogItem.deviceIds.includes(deviceId)
        ? currentDialogItem.deviceIds.filter(id => id !== deviceId)
        : [...currentDialogItem.deviceIds, deviceId];
      setCurrentDialogItem({ ...currentDialogItem, deviceIds: newDeviceIds });
    }
  };

  const handleDialogSave = async () => {
    if (!currentDialogItem || !currentDialogItem.name.trim() || !currentItemType) return;
    setIsSaving(true);
    try {
      const dataToSave = { name: currentDialogItem.name.trim(), deviceIds: currentDialogItem.deviceIds };
      if (currentItemType === 'room') {
        if (isEditing && currentDialogItem.id) {
          await updateRoom(currentDialogItem.id, dataToSave);
          toast({ title: "Room Updated", description: `Room "${dataToSave.name}" has been updated.` });
        } else {
          await addRoom(dataToSave);
          toast({ title: "Room Added", description: `New room "${dataToSave.name}" has been created.` });
        }
      } else if (currentItemType === 'group') {
        if (isEditing && currentDialogItem.id) {
          await updateDeviceGroup(currentDialogItem.id, dataToSave);
          toast({ title: "Group Updated", description: `Group "${dataToSave.name}" has been updated.` });
        } else {
          await addDeviceGroup(dataToSave);
          toast({ title: "Group Added", description: `New group "${dataToSave.name}" has been created.` });
        }
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message || "Could not save the item.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (type: ItemType, id: string, name: string) => {
    setIsSaving(true); 
    try {
      if (type === 'room') {
        await deleteRoom(id);
        toast({ title: "Room Deleted", description: `Room "${name}" has been deleted.` });
      } else if (type === 'group') {
        await deleteDeviceGroup(id);
        toast({ title: "Group Deleted", description: `Group "${name}" has been deleted.` });
      }
    } catch (err: any) {
      toast({ title: "Delete Failed", description: err.message || "Could not delete the item.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isLoadingPreferences || isLoadingApiDevices;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Loading Data...</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-1/4" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (preferencesError || apiDevicesError) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center">
            <AlertCircle className="mr-2" /> Error Loading
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>{preferencesError?.message || apiDevicesError || "An unexpected error occurred."}</p>
        </CardContent>
      </Card>
    );
  }
  
  const renderItemList = (items: ManageableItem[], type: ItemType, IconComponent: React.ElementType) => (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-muted-foreground">No {type}s configured yet.</p>
      ) : (
        items.map(item => (
          <Card key={item.id} className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4">
              <CardTitle className="text-lg flex items-center">
                <IconComponent className="mr-2 h-5 w-5 text-primary" />
                {item.name}
              </CardTitle>
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={() => openDialog(type, item)} disabled={isSaving}>
                  <Edit3 className="mr-1 h-4 w-4" /> Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDeleteItem(type, item.id, item.name)} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="mr-1 h-4 w-4" />} Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <p className="text-sm text-muted-foreground">
                Devices: {item.deviceIds.length > 0 
                  ? item.deviceIds
                      .map(id => allApiDevices.find(d => d.id === id)?.name || id)
                      .join(', ') 
                  : 'None'}
              </p>
            </CardContent>
          </Card>
        ))
      )}
      <Button onClick={() => openDialog(type)} className="mt-4" disabled={isSaving}>
        <PlusCircle className="mr-2 h-5 w-5" /> Add New {type.charAt(0).toUpperCase() + type.slice(1)}
      </Button>
    </div>
  );

  return (
    <>
      <Tabs defaultValue="rooms" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rooms"><HomeIcon className="mr-2 h-4 w-4" />Rooms</TabsTrigger>
          <TabsTrigger value="groups"><Layers3 className="mr-2 h-4 w-4" />Groups</TabsTrigger>
        </TabsList>
        <TabsContent value="rooms" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><HomeIcon className="mr-2 h-6 w-6 text-primary" />Manage Rooms</CardTitle>
              <CardDescription>Define rooms and assign devices to them from your dashboard selection.</CardDescription>
            </CardHeader>
            <CardContent>
              {renderItemList(rooms, 'room', HomeIcon)}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="groups" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><Layers3 className="mr-2 h-6 w-6 text-primary" />Manage Device Groups</CardTitle>
              <CardDescription>Create custom groups of devices from your dashboard selection.</CardDescription>
            </CardHeader>
            <CardContent>
              {renderItemList(deviceGroups, 'group', Layers3)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit' : 'Add New'} {currentItemType?.charAt(0).toUpperCase() + currentItemType?.slice(1)}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Modify the details for this' : 'Create a new'} {currentItemType}. Select devices to include from your dashboard-selected devices.
            </DialogDescription>
          </DialogHeader>
          {currentDialogItem && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input id="name" value={currentDialogItem.name} onChange={handleDialogInputChange} className="col-span-3" disabled={isSaving} />
              </div>
              <Label>Select Devices ({currentDialogItem.deviceIds.length} selected)</Label>
              <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                {isLoadingApiDevices && <p>Loading available devices...</p>}
                {!isLoadingApiDevices && selectableDevicesForRoomsAndGroups.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    <p>No devices available to add.</p>
                    <p className="text-sm">Ensure you have selected devices on your main dashboard first.</p>
                    <Button variant="link" asChild className="mt-2">
                      <Link href="/manage-devices"><Settings2 className="mr-2 h-4 w-4" />Go to Manage Dashboard Devices</Link>
                    </Button>
                  </div>
                )}
                {selectableDevicesForRoomsAndGroups.map(device => (
                  <div key={device.id} className="flex items-center space-x-2 mb-2">
                    <Checkbox
                      id={`dialog-device-${device.id}`}
                      checked={currentDialogItem.deviceIds.includes(device.id)}
                      onCheckedChange={() => handleDialogDeviceToggle(device.id)}
                      disabled={isSaving}
                    />
                    <label htmlFor={`dialog-device-${device.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {device.name} <span className="text-xs text-muted-foreground">({device.type})</span>
                    </label>
                  </div>
                ))}
              </ScrollArea>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
            </DialogClose>
            <Button 
              type="submit" 
              onClick={handleDialogSave} 
              disabled={isSaving || !currentDialogItem?.name.trim() || selectableDevicesForRoomsAndGroups.length === 0 && !isEditing}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
