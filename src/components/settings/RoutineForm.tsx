// src/components/settings/RoutineForm.tsx
"use client";

import type { Routine, RoutineAction } from '@/types/preferences';
import type { Device } from '@/types/home-assistant';
import { AutomationActionCommand } from '@/types/automations';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea'; // Added Textarea for custom response
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Save, X, Trash2, PlusCircle, AlertTriangle, Workflow, MessageSquare } from 'lucide-react'; // Added MessageSquare
import { ScrollArea } from '../ui/scroll-area';
import { v4 as uuidv4 } from 'uuid';

interface RoutineFormProps {
  routine?: Routine | null;
  availableDevices: Device[];
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
];

interface PhraseInput {
  id: string;
  value: string;
}

export function RoutineForm({ routine, availableDevices, onSave, onCancel, isEditing }: RoutineFormProps) {
  const [name, setName] = useState('');
  const [phrases, setPhrases] = useState<PhraseInput[]>([{ id: uuidv4(), value: '' }]);
  const [actions, setActions] = useState<(RoutineAction & { uiKey: string })[]>([]);
  const [customVoiceResponse, setCustomVoiceResponse] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (routine) {
      setName(routine.name || '');
      setPhrases(routine.phrases?.map(p => ({ id: uuidv4(), value: p })) || [{ id: uuidv4(), value: '' }]);
      setActions(routine.actions.map(act => ({ ...act, uiKey: uuidv4() })) || []);
      setCustomVoiceResponse(routine.customVoiceResponse || '');
    } else {
      setName('');
      setPhrases([{ id: uuidv4(), value: '' }]);
      setActions([{ ...defaultAction, uiKey: uuidv4() }]);
      setCustomVoiceResponse('');
    }
  }, [routine]);

  const handleAddPhrase = () => {
    setPhrases(prev => [...prev, { id: uuidv4(), value: '' }]);
  };

  const handleRemovePhrase = (idToRemove: string) => {
    setPhrases(prev => prev.filter(p => p.id !== idToRemove));
  };

  const handlePhraseChange = (id: string, value: string) => {
    setPhrases(prev => prev.map(p =>
      p.id === id ? { ...p, value } : p
    ));
  };

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

  const validateForm = (): boolean => {
    if (!name.trim()) {
      alert("Please fill in the Routine Name.");
      return false;
    }
    const activePhrases = phrases.filter(p => p.value.trim() !== '');
    if (activePhrases.length === 0) {
      alert("Please add at least one Trigger Phrase.");
      return false;
    }
    if (actions.length === 0) {
      alert("Please add at least one action to the routine.");
      return false;
    }
    for (const action of actions) {
      if (!action.deviceId) {
        alert("Please select a device for all actions.");
        return false;
      }
      if (!action.command) {
        alert("Please select a command for all actions.");
        return false;
      }
    }
    return true;
  };


  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    const finalPhrases = phrases.map(p => p.value.trim().toLowerCase()).filter(p => p !== '');
    const routineDataToSave: Omit<Routine, 'id' | 'actions'> & { actions: RoutineAction[] } = {
      name: name.trim(),
      phrases: finalPhrases,
      actions: actions.map(({ uiKey, ...rest }) => rest),
      customVoiceResponse: customVoiceResponse.trim() || undefined, // Store as undefined if empty
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

  const isFormValid = name.trim() && 
                      phrases.some(p => p.value.trim() !== '') && 
                      actions.length > 0 && 
                      actions.every(a => a.deviceId && a.command);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center">
          <Workflow className="mr-2 h-6 w-6 text-primary" />
          {isEditing ? 'Edit Routine' : 'Create New Routine'}
        </DialogTitle>
        <DialogDescription>
          Define custom voice phrases to trigger actions. Add an optional voice response.
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
          
          <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
            <legend className="text-lg font-semibold px-2 text-primary flex items-center">Trigger Phrases ({phrases.filter(p=>p.value.trim()).length})</legend>
            <div className="space-y-3 mt-2">
              {phrases.map((phraseItem, index) => (
                <div key={phraseItem.id} className="flex items-center space-x-2">
                  <Input
                    value={phraseItem.value}
                    onChange={(e) => handlePhraseChange(phraseItem.id, e.target.value)}
                    placeholder={`e.g., movie time, good night ${index + 1}`}
                    disabled={isSaving}
                    className="flex-grow bg-input/50"
                  />
                  {phrases.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => handleRemovePhrase(phraseItem.id)} disabled={isSaving}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" onClick={handleAddPhrase} disabled={isSaving}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Phrase
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">These phrases will be recognized after "Jarvis". Keep them simple and unique. At least one is required.</p>
          </fieldset>


          <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
            <legend className="text-lg font-semibold px-2 text-primary flex items-center">Actions ({actions.length})</legend>
            <div className="space-y-4 mt-2">
              {actions.map((action, index) => (
                <div key={action.uiKey} className="p-3 border rounded-md bg-muted/20 relative space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Action {index + 1}</p>
                    {actions.length > 0 && ( // Show remove if any actions exist, even if it's the last one to allow removing all. Validation handles min 1.
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
               <p className="text-xs text-muted-foreground mt-1">At least one action is required.</p>
            </div>
          </fieldset>

          <div>
            <Label htmlFor="custom-voice-response" className="text-base font-medium flex items-center">
              <MessageSquare className="mr-2 h-5 w-5 text-primary" />
              Custom Voice Response (Optional)
            </Label>
            <Textarea
              id="custom-voice-response"
              value={customVoiceResponse}
              onChange={(e) => setCustomVoiceResponse(e.target.value)}
              placeholder="e.g., Movie mode activated. Enjoy the show!"
              disabled={isSaving}
              className="mt-1 bg-input/50 min-h-[60px]"
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">HomePilot will say this after completing the routine actions. Leave blank for no custom response.</p>
          </div>
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
