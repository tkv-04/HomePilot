// src/components/settings/RoutineForm.tsx
"use client";

import type { Routine, RoutineAction } from '@/types/preferences';
import type { Device } from '@/types/home-assistant';
import { AutomationActionCommand } from '@/types/automations'; // Assuming commands are the same
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Save, X, Trash2, PlusCircle, AlertTriangle, Workflow } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { v4 as uuidv4 } from 'uuid';

interface RoutineFormProps {
  routine?: Routine | null;
  availableDevices: Device[]; // Only dashboard-selected devices
  onSave: (routine: Omit<Routine, 'id'> | Routine) => Promise<void>;
  onCancel: () => void;
  isEditing: boolean;
}

const defaultAction: RoutineAction = {
  deviceId: '',
  command: 'turn_on',
};

const actionCommands: { value: AutomationActionCommand; label: string }[] = [
  { value: 'turn_on', label: 'Turn On' },
  { value: 'turn_off', label: 'Turn Off' },
  // Add other commands if RoutineAction supports them
];

export function RoutineForm({ routine, availableDevices, onSave, onCancel, isEditing }: RoutineFormProps) {
  const [name, setName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [actions, setActions] = useState<(RoutineAction & { uiKey: string })[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (routine) {
      setName(routine.name || '');
      setPhrase(routine.phrase || '');
      setActions(routine.actions.map(act => ({ ...act, uiKey: uuidv4() })) || []);
    } else {
      setName('');
      setPhrase('');
      setActions([{ ...defaultAction, uiKey: uuidv4() }]); // Start with one default action
    }
  }, [routine]);

  const handleAddAction = () => {
    setActions(prev => [...prev, { ...defaultAction, uiKey: uuidv4() }]);
  };

  const handleRemoveAction = (uiKeyToRemove: string) => {
    setActions(prev => prev.filter(act => act.uiKey !== uiKeyToRemove));
  };

  const handleActionChange = (uiKey: string, field: keyof RoutineAction, value: any) => {
    setActions(prev => prev.map(act =>
      act.uiKey === uiKey ? { ...act, [field]: value } : act
    ));
  };

  const validateActions = (): boolean => {
    if (actions.length === 0) {
        alert("Please add at least one action to the routine.");
        return false;
    }
    for (const action of actions) {
      if (!action.deviceId) {
        alert(`Please select a device for all actions. Action for phrase "${phrase}" is missing a device.`);
        return false;
      }
      if (!action.command) {
        alert(`Please select a command for all actions. Action for device "${availableDevices.find(d => d.id === action.deviceId)?.name || action.deviceId}" is missing a command.`);
        return false;
      }
    }
    return true;
  };


  const handleSave = async () => {
    if (!name.trim()) {
      alert("Please fill in the Routine Name.");
      return;
    }
    if (!phrase.trim()) {
      alert("Please fill in the Trigger Phrase.");
      return;
    }
    if (!validateActions()) {
      return;
    }

    setIsSaving(true);
    const routineDataToSave: Omit<Routine, 'id' | 'actions'> & { actions: RoutineAction[] } = {
      name: name.trim(),
      phrase: phrase.trim().toLowerCase(), // Store phrase in lowercase for easier matching
      actions: actions.map(({ uiKey, ...rest }) => rest), // Remove uiKey before saving
    };

    if (isEditing && routine?.id) {
      await onSave({ ...routineDataToSave, id: routine.id });
    } else {
      await onSave(routineDataToSave);
    }
    setIsSaving(false);
  };

  if (availableDevices.length === 0) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Devices Available for Routines</h3>
        <p className="text-muted-foreground">
          Routines control devices selected for your dashboard. Please select devices for your dashboard first.
        </p>
        <Button onClick={onCancel} variant="outline" className="mt-6">Close</Button>
      </div>
    );
  }

  const isFormValid = name.trim() && phrase.trim() && actions.length > 0 && actions.every(a => a.deviceId && a.command);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center">
            <Workflow className="mr-2 h-6 w-6 text-primary" />
            {isEditing ? 'Edit Routine' : 'Create New Routine'}
        </DialogTitle>
        <DialogDescription>
          Define a custom voice phrase to trigger a sequence of actions on your devices.
          The phrase will be recognized after saying "Jarvis".
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="max-h-[70vh] p-1 -mx-1">
        <div className="space-y-6 p-4 pr-6">
          <div>
            <Label htmlFor="routine-name" className="text-base font-medium">Routine Name</Label>
            <Input
              id="routine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Movie Time, Bedtime"
              disabled={isSaving}
              className="mt-1 bg-input/50"
            />
          </div>
          <div>
            <Label htmlFor="routine-phrase" className="text-base font-medium">Trigger Phrase</Label>
            <Input
              id="routine-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="e.g., movie time, good night"
              disabled={isSaving}
              className="mt-1 bg-input/50"
            />
            <p className="text-xs text-muted-foreground mt-1">This phrase will be recognized after "Jarvis". Keep it simple and unique.</p>
          </div>

          <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
            <legend className="text-lg font-semibold px-2 text-primary flex items-center">Actions ({actions.length})</legend>
            <div className="space-y-4 mt-2">
              {actions.map((action, index) => (
                <div key={action.uiKey} className="p-3 border rounded-md bg-muted/20 relative space-y-3">
                   <div className="flex justify-between items-center">
                     <p className="text-sm font-medium">Action {index + 1}</p>
                     {actions.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveAction(action.uiKey)} disabled={isSaving}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                     )}
                   </div>
                  <div>
                    <Label htmlFor={`action-device-${action.uiKey}`}>Device</Label>
                    <Select value={action.deviceId} onValueChange={(val) => handleActionChange(action.uiKey, 'deviceId', val)} disabled={isSaving}>
                      <SelectTrigger id={`action-device-${action.uiKey}`} className="bg-input/50"><SelectValue placeholder="Select action device" /></SelectTrigger>
                      <SelectContent>
                        {availableDevices.filter(d => ['light', 'switch', 'fan', 'outlet'].includes(d.type)).map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {action.deviceId && (
                    <div>
                      <Label htmlFor={`action-command-${action.uiKey}`}>Command</Label>
                      <Select value={action.command} onValueChange={(val) => handleActionChange(action.uiKey, 'command', val as AutomationActionCommand)} disabled={isSaving}>
                        <SelectTrigger id={`action-command-${action.uiKey}`} className="bg-input/50"><SelectValue placeholder="Select command" /></SelectTrigger>
                        <SelectContent>{actionCommands.map(cmd => <SelectItem key={cmd.value} value={cmd.value}>{cmd.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" onClick={handleAddAction} disabled={isSaving}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Action
              </Button>
            </div>
          </fieldset>
        </div>
      </ScrollArea>
      <DialogFooter className="mt-6 pt-4 border-t">
        <DialogClose asChild><Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}><X className="mr-2 h-4 w-4" /> Cancel</Button></DialogClose>
        <Button type="submit" onClick={handleSave} disabled={isSaving || !isFormValid}>
          {isSaving ? <Save className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isEditing ? 'Save Changes' : 'Create Routine'}
        </Button>
      </DialogFooter>
    </>
  );
}
