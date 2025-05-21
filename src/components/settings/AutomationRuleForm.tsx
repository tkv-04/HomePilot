
// src/components/settings/AutomationRuleForm.tsx
"use client";

import type { AutomationRule, AutomationTrigger, AutomationAction, AutomationConditionOperator, AutomationActionCommand } from '@/types/automations';
import type { Device } from '@/types/home-assistant';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Save, X, Trash2, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

interface AutomationRuleFormProps {
  rule?: AutomationRule | null;
  availableDevices: Device[]; // Devices selected for dashboard
  onSave: (rule: Omit<AutomationRule, 'id'> | AutomationRule) => Promise<void>;
  onCancel: () => void;
  isEditing: boolean;
}

const defaultTrigger: AutomationTrigger = {
  deviceId: '',
  condition: 'equals',
  value: '',
};

const defaultAction: AutomationAction = {
  deviceId: '',
  command: 'turn_on',
};

const conditionOperators: { value: AutomationConditionOperator; label: string }[] = [
  { value: 'equals', label: 'Equals (==)' },
  { value: 'not_equals', label: 'Not Equals (!=)' },
  { value: 'greater_than', label: 'Greater Than (>)' },
  { value: 'less_than', label: 'Less Than (<)' },
  { value: 'greater_than_or_equals', label: 'Greater Than or Equals (>=)' },
  { value: 'less_than_or_equals', label: 'Less Than or Equals (<=)' },
];

const actionCommands: { value: AutomationActionCommand; label: string }[] = [
  { value: 'turn_on', label: 'Turn On' },
  { value: 'turn_off', label: 'Turn Off' },
];


export function AutomationRuleForm({ rule, availableDevices, onSave, onCancel, isEditing }: AutomationRuleFormProps) {
  const [name, setName] = useState(rule?.name || '');
  const [trigger, setTrigger] = useState<AutomationTrigger>(rule?.trigger || { ...defaultTrigger });
  const [action, setAction] = useState<AutomationAction>(rule?.action || { ...defaultAction });
  const [isEnabled, setIsEnabled] = useState(rule?.isEnabled !== undefined ? rule.isEnabled : true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name || '');
      setTrigger(rule.trigger || { ...defaultTrigger });
      setAction(rule.action || { ...defaultAction });
      setIsEnabled(rule.isEnabled !== undefined ? rule.isEnabled : true);
    } else {
      // Reset for new rule
      setName('');
      setTrigger({ ...defaultTrigger });
      setAction({ ...defaultAction });
      setIsEnabled(true);
    }
  }, [rule]);

  const getDeviceType = (deviceId: string): Device['type'] | 'unknown' => {
    const device = availableDevices.find(d => d.id === deviceId);
    return device?.type || 'unknown';
  };

  const isNumericInputExpected = (condition: AutomationConditionOperator): boolean => {
    return ['greater_than', 'less_than', 'greater_than_or_equals', 'less_than_or_equals'].includes(condition);
  };
  
  const isBooleanInputExpectedForEquals = (deviceId: string, condition: AutomationConditionOperator): boolean => {
     if (condition !== 'equals' && condition !== 'not_equals') return false;
     const deviceType = getDeviceType(deviceId);
     return ['light', 'switch', 'fan', 'outlet'].includes(deviceType); // These typically have 'on'/'off' states
  };


  const handleSave = async () => {
    if (!name.trim() || !trigger.deviceId || !action.deviceId) {
      // Basic validation, can be enhanced with react-hook-form
      alert("Please fill in all required fields: Name, Trigger Device, and Action Device.");
      return;
    }

    let parsedValue: string | number | boolean = trigger.value;
    if (isBooleanInputExpectedForEquals(trigger.deviceId, trigger.condition)) {
        if (String(trigger.value).toLowerCase() === 'on' || String(trigger.value) === 'true') parsedValue = true;
        else if (String(trigger.value).toLowerCase() === 'off' || String(trigger.value) === 'false') parsedValue = false;
        else {
            alert("For 'equals' or 'not_equals' on switchable devices, please use 'on', 'off', 'true', or 'false' for the trigger value.");
            return;
        }
    } else if (isNumericInputExpected(trigger.condition)) {
        const num = parseFloat(String(trigger.value));
        if (isNaN(num)) {
            alert("Please enter a numeric value for this condition.");
            return;
        }
        parsedValue = num;
    }


    setIsSaving(true);
    const ruleDataToSave = {
      name: name.trim(),
      trigger: { ...trigger, value: parsedValue },
      action,
      isEnabled,
    };

    if (isEditing && rule?.id) {
      await onSave({ ...ruleDataToSave, id: rule.id });
    } else {
      await onSave(ruleDataToSave);
    }
    setIsSaving(false);
  };

  const renderTriggerValueInput = () => {
    if (isBooleanInputExpectedForEquals(trigger.deviceId, trigger.condition)) {
      return (
        <Select
          value={String(trigger.value).toLowerCase() === 'true' || String(trigger.value).toLowerCase() === 'on' ? 'on' : 'off'}
          onValueChange={(val) => setTrigger(t => ({ ...t, value: val === 'on' }))}
          disabled={isSaving || !trigger.deviceId}
        >
          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="on">On</SelectItem>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        placeholder={isNumericInputExpected(trigger.condition) ? "e.g., 34 or 22.5" : "e.g., open or on"}
        value={String(trigger.value)}
        type={isNumericInputExpected(trigger.condition) ? "number" : "text"}
        step={isNumericInputExpected(trigger.condition) ? "any" : undefined}
        onChange={(e) => setTrigger(t => ({ ...t, value: e.target.value }))}
        disabled={isSaving || !trigger.deviceId}
        className="bg-input/50"
      />
    );
  };

  if (availableDevices.length === 0) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Devices Available</h3>
        <p className="text-muted-foreground">
          You need to select devices for your dashboard before you can create automations.
        </p>
        <Button onClick={onCancel} variant="outline" className="mt-6">Close</Button>
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Edit Automation Rule' : 'Create New Automation Rule'}</DialogTitle>
        <DialogDescription>
          Define a trigger and an action for your smart home automation.
          Automations will be processed by a separate backend service (not yet implemented).
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="max-h-[70vh] p-1 -mx-1">
        <div className="space-y-6 p-4 pr-6">
          <div>
            <Label htmlFor="automation-name" className="text-base font-medium">Automation Name</Label>
            <Input
              id="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Turn on fan when hot"
              disabled={isSaving}
              className="mt-1 bg-input/50"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-base font-medium">Enabled</Label>
            <div className="flex items-center space-x-2 mt-1">
              <Switch
                id="automation-enabled"
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
                disabled={isSaving}
              />
              <Label htmlFor="automation-enabled" className="text-sm">
                {isEnabled ? 'Automation is ON' : 'Automation is OFF'}
              </Label>
            </div>
          </div>
          
          <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
            <legend className="text-lg font-semibold px-2 text-primary">Trigger (IF...)</legend>
            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="trigger-device">Device</Label>
                <Select
                  value={trigger.deviceId}
                  onValueChange={(val) => setTrigger(t => ({ ...t, deviceId: val, value: '' }))} // Reset value on device change
                  disabled={isSaving}
                >
                  <SelectTrigger id="trigger-device" className="bg-input/50"><SelectValue placeholder="Select trigger device" /></SelectTrigger>
                  <SelectContent>
                    {availableDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {trigger.deviceId && (
                <>
                  <div>
                    <Label>Condition: <span className="text-muted-foreground text-xs">(Device State...)</span></Label>
                    <div className="grid grid-cols-2 gap-2 items-end">
                      <Select
                        value={trigger.condition}
                        onValueChange={(val) => setTrigger(t => ({ ...t, condition: val as AutomationConditionOperator }))}
                        disabled={isSaving}
                      >
                        <SelectTrigger className="bg-input/50"><SelectValue placeholder="Select condition" /></SelectTrigger>
                        <SelectContent>
                          {conditionOperators.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {renderTriggerValueInput()}
                    </div>
                     <p className="text-xs text-muted-foreground mt-1">
                        For lights/switches, 'true' or 'on' means on, 'false' or 'off' means off.
                        For sensors, enter the numeric value.
                     </p>
                  </div>
                </>
              )}
            </div>
          </fieldset>

          <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
            <legend className="text-lg font-semibold px-2 text-primary">Action (THEN...)</legend>
            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="action-device">Device</Label>
                <Select
                  value={action.deviceId}
                  onValueChange={(val) => setAction(a => ({ ...a, deviceId: val }))}
                  disabled={isSaving}
                >
                  <SelectTrigger id="action-device" className="bg-input/50"><SelectValue placeholder="Select action device" /></SelectTrigger>
                  <SelectContent>
                    {availableDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {action.deviceId && (
                <div>
                  <Label htmlFor="action-command">Command</Label>
                  <Select
                    value={action.command}
                    onValueChange={(val) => setAction(a => ({ ...a, command: val as AutomationActionCommand }))}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="action-command" className="bg-input/50"><SelectValue placeholder="Select command" /></SelectTrigger>
                    <SelectContent>
                      {actionCommands.map(cmd => <SelectItem key={cmd.value} value={cmd.value}>{cmd.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </fieldset>
        </div>
      </ScrollArea>
      <DialogFooter className="mt-6 pt-4 border-t">
        <DialogClose asChild>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
        </DialogClose>
        <Button type="submit" onClick={handleSave} disabled={isSaving || !name.trim() || !trigger.deviceId || !action.deviceId}>
          {isSaving ? <Save className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isEditing ? 'Save Changes' : 'Create Automation'}
        </Button>
      </DialogFooter>
    </>
  );
}
