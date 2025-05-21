
// src/components/settings/AutomationRuleForm.tsx
"use client";

import type { AutomationRule, AutomationTrigger, AutomationAction, AutomationConditionOperator, AutomationActionCommand, DeviceAutomationTrigger, TimeAutomationTrigger } from '@/types/automations';
import type { Device } from '@/types/home-assistant';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Save, X, Trash2, AlertTriangle, Clock, Zap } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

interface AutomationRuleFormProps {
  rule?: AutomationRule | null;
  availableDevices: Device[];
  onSave: (rule: Omit<AutomationRule, 'id'> | AutomationRule) => Promise<void>;
  onCancel: () => void;
  isEditing: boolean;
}

const defaultDeviceTrigger: DeviceAutomationTrigger = {
  type: 'device',
  deviceId: '',
  condition: 'equals',
  value: '',
};

const defaultTimeTrigger: TimeAutomationTrigger = {
  type: 'time',
  time: '08:00', // Default to 8 AM
  days: [], // Default to no days selected
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

const daysOfWeek = [
  { id: 0, label: 'Sun' }, { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' }, { id: 4, label: 'Thu' }, { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];


export function AutomationRuleForm({ rule, availableDevices, onSave, onCancel, isEditing }: AutomationRuleFormProps) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<'device' | 'time'>('device');
  const [deviceTrigger, setDeviceTrigger] = useState<DeviceAutomationTrigger>({ ...defaultDeviceTrigger });
  const [timeTrigger, setTimeTrigger] = useState<TimeAutomationTrigger>({ ...defaultTimeTrigger });
  const [action, setAction] = useState<AutomationAction>({ ...defaultAction });
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name || '');
      setIsEnabled(rule.isEnabled !== undefined ? rule.isEnabled : true);
      setAction(rule.action || { ...defaultAction });
      setTriggerType(rule.trigger.type);
      if (rule.trigger.type === 'device') {
        setDeviceTrigger(rule.trigger);
        setTimeTrigger({ ...defaultTimeTrigger }); // Reset other type
      } else if (rule.trigger.type === 'time') {
        setTimeTrigger(rule.trigger);
        setDeviceTrigger({ ...defaultDeviceTrigger }); // Reset other type
      }
    } else {
      // Reset for new rule
      setName('');
      setTriggerType('device');
      setDeviceTrigger({ ...defaultDeviceTrigger });
      setTimeTrigger({ ...defaultTimeTrigger });
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
     return ['light', 'switch', 'fan', 'outlet'].includes(deviceType);
  };

  const handleDayToggle = (dayId: number) => {
    setTimeTrigger(prev => {
      const newDays = prev.days.includes(dayId)
        ? prev.days.filter(d => d !== dayId)
        : [...prev.days, dayId].sort((a, b) => a - b);
      return { ...prev, days: newDays };
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Please fill in the Automation Name.");
      return;
    }

    let finalTrigger: AutomationTrigger;

    if (triggerType === 'device') {
      if (!deviceTrigger.deviceId) {
        alert("Please select a trigger device.");
        return;
      }
      let parsedValue: string | number | boolean = deviceTrigger.value;
      if (isBooleanInputExpectedForEquals(deviceTrigger.deviceId, deviceTrigger.condition)) {
        if (String(deviceTrigger.value).toLowerCase() === 'on' || String(deviceTrigger.value) === 'true') parsedValue = true;
        else if (String(deviceTrigger.value).toLowerCase() === 'off' || String(deviceTrigger.value) === 'false') parsedValue = false;
        else {
            alert("For 'equals' or 'not_equals' on switchable devices, please use 'on', 'off', 'true', or 'false' for the trigger value.");
            return;
        }
      } else if (isNumericInputExpected(deviceTrigger.condition)) {
        const num = parseFloat(String(deviceTrigger.value));
        if (isNaN(num)) {
            alert("Please enter a numeric value for this condition.");
            return;
        }
        parsedValue = num;
      }
      finalTrigger = { ...deviceTrigger, value: parsedValue };
    } else { // triggerType === 'time'
      if (!timeTrigger.time) {
        alert("Please set a time for the schedule.");
        return;
      }
      if (timeTrigger.days.length === 0) {
        alert("Please select at least one day for the schedule.");
        return;
      }
      finalTrigger = { ...timeTrigger };
    }

    if (!action.deviceId) {
      alert("Please select an action device.");
      return;
    }

    setIsSaving(true);
    const ruleDataToSave = {
      name: name.trim(),
      trigger: finalTrigger,
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

  const renderDeviceTriggerValueInput = () => {
    if (isBooleanInputExpectedForEquals(deviceTrigger.deviceId, deviceTrigger.condition)) {
      return (
        <Select
          value={String(deviceTrigger.value).toLowerCase() === 'true' || String(deviceTrigger.value).toLowerCase() === 'on' ? 'on' : 'off'}
          onValueChange={(val) => setDeviceTrigger(t => ({ ...t, value: val === 'on' }))}
          disabled={isSaving || !deviceTrigger.deviceId}
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
        placeholder={isNumericInputExpected(deviceTrigger.condition) ? "e.g., 34 or 22.5" : "e.g., open or on"}
        value={String(deviceTrigger.value)}
        type={isNumericInputExpected(deviceTrigger.condition) ? "number" : "text"}
        step={isNumericInputExpected(deviceTrigger.condition) ? "any" : undefined}
        onChange={(e) => setDeviceTrigger(t => ({ ...t, value: e.target.value }))}
        disabled={isSaving || !deviceTrigger.deviceId}
        className="bg-input/50"
      />
    );
  };

  if (availableDevices.length === 0) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Devices Available for Automation</h3>
        <p className="text-muted-foreground">
          You need to select devices for your dashboard before you can create automations,
          as automations can only use dashboard-selected devices.
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
          Define a trigger (either device state or scheduled time) and an action for your smart home automation.
          A separate backend service is required to execute these rules.
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

          <div>
            <Label htmlFor="trigger-type" className="text-base font-medium">Trigger Type</Label>
            <Select
              value={triggerType}
              onValueChange={(val: 'device' | 'time') => setTriggerType(val)}
              disabled={isSaving}
            >
              <SelectTrigger id="trigger-type" className="mt-1 bg-input/50">
                <SelectValue placeholder="Select trigger type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="device"><Zap className="mr-2 h-4 w-4 inline-block" /> Device State</SelectItem>
                <SelectItem value="time"><Clock className="mr-2 h-4 w-4 inline-block" /> Scheduled Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {triggerType === 'device' && (
            <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
              <legend className="text-lg font-semibold px-2 text-primary flex items-center"><Zap className="mr-2 h-5 w-5"/>Device State Trigger (IF...)</legend>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="trigger-device">Device</Label>
                  <Select
                    value={deviceTrigger.deviceId}
                    onValueChange={(val) => setDeviceTrigger(t => ({ ...t, deviceId: val, value: '' }))}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="trigger-device" className="bg-input/50"><SelectValue placeholder="Select trigger device" /></SelectTrigger>
                    <SelectContent>
                      {availableDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {deviceTrigger.deviceId && (
                  <>
                    <div>
                      <Label>Condition: <span className="text-muted-foreground text-xs">(Device State...)</span></Label>
                      <div className="grid grid-cols-2 gap-2 items-end">
                        <Select
                          value={deviceTrigger.condition}
                          onValueChange={(val) => setDeviceTrigger(t => ({ ...t, condition: val as AutomationConditionOperator }))}
                          disabled={isSaving}
                        >
                          <SelectTrigger className="bg-input/50"><SelectValue placeholder="Select condition" /></SelectTrigger>
                          <SelectContent>
                            {conditionOperators.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {renderDeviceTriggerValueInput()}
                      </div>
                       <p className="text-xs text-muted-foreground mt-1">
                          For lights/switches, use 'on'/'off' or 'true'/'false'. For sensors, enter the numeric value.
                       </p>
                    </div>
                  </>
                )}
              </div>
            </fieldset>
          )}

          {triggerType === 'time' && (
             <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
              <legend className="text-lg font-semibold px-2 text-primary flex items-center"><Clock className="mr-2 h-5 w-5"/>Scheduled Time Trigger (AT...)</legend>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="trigger-time">Time (HH:mm)</Label>
                  <Input
                    id="trigger-time"
                    type="time"
                    value={timeTrigger.time}
                    onChange={(e) => setTimeTrigger(t => ({ ...t, time: e.target.value }))}
                    disabled={isSaving}
                    className="bg-input/50"
                  />
                </div>
                <div>
                  <Label>Days of the Week</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                    {daysOfWeek.map(day => (
                      <div key={day.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`day-${day.id}`}
                          checked={timeTrigger.days.includes(day.id)}
                          onCheckedChange={() => handleDayToggle(day.id)}
                          disabled={isSaving}
                        />
                        <Label htmlFor={`day-${day.id}`} className="text-sm font-normal">{day.label}</Label>
                      </div>
                    ))}
                  </div>
                   <p className="text-xs text-muted-foreground mt-1">
                      Select at least one day.
                   </p>
                </div>
              </div>
            </fieldset>
          )}

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
                    {availableDevices.map(d => {
                       // Only allow controllable devices for actions
                       if (['light', 'switch', 'fan', 'outlet'].includes(d.type)) {
                         return <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>;
                       }
                       return null;
                    })}
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
        <Button 
            type="submit" 
            onClick={handleSave} 
            disabled={isSaving || !name.trim() || (triggerType === 'device' && !deviceTrigger.deviceId) || (triggerType === 'time' && (!timeTrigger.time || timeTrigger.days.length === 0)) || !action.deviceId }
        >
          {isSaving ? <Save className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isEditing ? 'Save Changes' : 'Create Automation'}
        </Button>
      </DialogFooter>
    </>
  );
}
