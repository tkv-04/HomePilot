
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
import { Save, X, Trash2, AlertTriangle, Clock, Zap, PlusCircle } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { v4 as uuidv4 } from 'uuid'; // For unique keys for conditions

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
  time: '08:00', 
  days: [], 
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
  
  // Conditions state - an array of DeviceAutomationTrigger-like objects, each with a unique UI key
  const [conditions, setConditions] = useState<(DeviceAutomationTrigger & { uiKey: string })[]>([]);

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
        setTimeTrigger({ ...defaultTimeTrigger }); 
      } else if (rule.trigger.type === 'time') {
        setTimeTrigger(rule.trigger);
        setDeviceTrigger({ ...defaultDeviceTrigger }); 
      }
      setConditions(rule.conditions?.map(c => ({ ...c, uiKey: uuidv4() })) || []);
    } else {
      setName('');
      setTriggerType('device');
      setDeviceTrigger({ ...defaultDeviceTrigger });
      setTimeTrigger({ ...defaultTimeTrigger });
      setConditions([]);
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

  const isBooleanInputExpectedForEquals = (deviceId: string, conditionOp: AutomationConditionOperator): boolean => {
     if (conditionOp !== 'equals' && conditionOp !== 'not_equals') return false;
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

  const handleAddCondition = () => {
    setConditions(prev => [...prev, { ...defaultDeviceTrigger, type: 'device', uiKey: uuidv4() }]);
  };

  const handleRemoveCondition = (uiKeyToRemove: string) => {
    setConditions(prev => prev.filter(c => c.uiKey !== uiKeyToRemove));
  };

  const handleConditionChange = (uiKey: string, field: keyof DeviceAutomationTrigger, value: any) => {
    setConditions(prev => prev.map(c => 
      c.uiKey === uiKey ? { ...c, [field]: value, ...(field === 'deviceId' && { value: '' }) } : c // Reset value if deviceId changes
    ));
  };

  const validateCondition = (cond: DeviceAutomationTrigger): string | null => {
    if (!cond.deviceId) return "Condition device not selected.";
    let parsedValue: string | number | boolean = cond.value;
    if (isBooleanInputExpectedForEquals(cond.deviceId, cond.condition)) {
        if (String(cond.value).toLowerCase() === 'on' || String(cond.value) === 'true') parsedValue = true;
        else if (String(cond.value).toLowerCase() === 'off' || String(cond.value) === 'false') parsedValue = false;
        else return "For 'equals/not_equals' on switchable devices, condition value must be 'on', 'off', 'true', or 'false'.";
    } else if (isNumericInputExpected(cond.condition)) {
        const num = parseFloat(String(cond.value));
        if (isNaN(num)) return "Numeric value required for this condition operator.";
    } else if (String(cond.value).trim() === '') {
        return "Condition value cannot be empty."
    }
    return null; // No error
  };


  const handleSave = async () => {
    if (!name.trim()) {
      alert("Please fill in the Automation Name.");
      return;
    }

    let finalTrigger: AutomationTrigger;
    if (triggerType === 'device') {
      const deviceTriggerError = validateCondition(deviceTrigger);
      if (deviceTriggerError) {
          alert(`Primary Trigger Error: ${deviceTriggerError}`);
          return;
      }
      finalTrigger = { ...deviceTrigger, value: parseConditionValue(deviceTrigger.deviceId, deviceTrigger.condition, deviceTrigger.value) };
    } else { 
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

    const finalConditions: DeviceAutomationTrigger[] = [];
    for (const cond of conditions) {
        const condError = validateCondition(cond);
        if (condError) {
            alert(`Error in Additional Condition for device "${availableDevices.find(d=>d.id === cond.deviceId)?.name || cond.deviceId}": ${condError}`);
            return;
        }
        finalConditions.push({
            type: 'device',
            deviceId: cond.deviceId,
            condition: cond.condition,
            value: parseConditionValue(cond.deviceId, cond.condition, cond.value)
        });
    }


    if (!action.deviceId) {
      alert("Please select an action device.");
      return;
    }

    setIsSaving(true);
    const ruleDataToSave: Omit<AutomationRule, 'id'> = {
      name: name.trim(),
      trigger: finalTrigger,
      conditions: finalConditions.length > 0 ? finalConditions : undefined, // Only include if there are conditions
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
  
  const parseConditionValue = (deviceId: string, conditionOp: AutomationConditionOperator, rawValue: string | number | boolean) => {
    if (isBooleanInputExpectedForEquals(deviceId, conditionOp)) {
      return String(rawValue).toLowerCase() === 'on' || String(rawValue).toLowerCase() === 'true';
    } else if (isNumericInputExpected(conditionOp)) {
      return parseFloat(String(rawValue));
    }
    return String(rawValue);
  };


  const renderDeviceConditionValueInput = (
    conditionObj: DeviceAutomationTrigger, 
    onChangeCallback: (field: keyof DeviceAutomationTrigger, value: any) => void
  ) => {
    if (isBooleanInputExpectedForEquals(conditionObj.deviceId, conditionObj.condition)) {
      return (
        <Select
          value={String(conditionObj.value).toLowerCase() === 'true' || String(conditionObj.value).toLowerCase() === 'on' ? 'on' : 'off'}
          onValueChange={(val) => onChangeCallback('value', val === 'on')}
          disabled={isSaving || !conditionObj.deviceId}
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
        placeholder={isNumericInputExpected(conditionObj.condition) ? "e.g., 34 or 22.5" : "e.g., open or on"}
        value={String(conditionObj.value)}
        type={isNumericInputExpected(conditionObj.condition) ? "number" : "text"}
        step={isNumericInputExpected(conditionObj.condition) ? "any" : undefined}
        onChange={(e) => onChangeCallback('value', e.target.value)}
        disabled={isSaving || !conditionObj.deviceId}
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
  
  const primaryTriggerValid = 
    triggerType === 'device' ? deviceTrigger.deviceId && String(deviceTrigger.value).trim() !== '' :
    triggerType === 'time' ? timeTrigger.time && timeTrigger.days.length > 0 : false;

  const allConditionsValid = conditions.every(c => c.deviceId && String(c.value).trim() !== '');
  const actionValid = action.deviceId;


  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Edit Automation Rule' : 'Create New Automation Rule'}</DialogTitle>
        <DialogDescription>
          Define a primary trigger (device state or time). Optionally add device conditions (all must be true). Then define an action.
          A separate backend service is required to execute these rules.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="max-h-[70vh] p-1 -mx-1">
        <div className="space-y-6 p-4 pr-6">
          {/* Automation Name & Enabled Switch */}
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
              <Switch id="automation-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} disabled={isSaving} />
              <Label htmlFor="automation-enabled" className="text-sm">{isEnabled ? 'Automation is ON' : 'Automation is OFF'}</Label>
            </div>
          </div>

          {/* Primary Trigger Selection */}
          <div>
            <Label htmlFor="trigger-type" className="text-base font-medium">Primary Trigger Type</Label>
            <Select value={triggerType} onValueChange={(val: 'device' | 'time') => setTriggerType(val)} disabled={isSaving}>
              <SelectTrigger id="trigger-type" className="mt-1 bg-input/50"><SelectValue placeholder="Select trigger type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="device"><Zap className="mr-2 h-4 w-4 inline-block" /> Device State</SelectItem>
                <SelectItem value="time"><Clock className="mr-2 h-4 w-4 inline-block" /> Scheduled Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Device State Primary Trigger */}
          {triggerType === 'device' && (
            <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
              <legend className="text-lg font-semibold px-2 text-primary flex items-center"><Zap className="mr-2 h-5 w-5"/>Device State Trigger (IF...)</legend>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="trigger-device">Device</Label>
                  <Select value={deviceTrigger.deviceId} onValueChange={(val) => setDeviceTrigger(t => ({ ...t, deviceId: val, value: '' }))} disabled={isSaving}>
                    <SelectTrigger id="trigger-device" className="bg-input/50"><SelectValue placeholder="Select trigger device" /></SelectTrigger>
                    <SelectContent>
                      {availableDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {deviceTrigger.deviceId && (
                  <div>
                    <Label>Condition: <span className="text-muted-foreground text-xs">(Device State...)</span></Label>
                    <div className="grid grid-cols-2 gap-2 items-end">
                      <Select value={deviceTrigger.condition} onValueChange={(val) => setDeviceTrigger(t => ({ ...t, condition: val as AutomationConditionOperator }))} disabled={isSaving}>
                        <SelectTrigger className="bg-input/50"><SelectValue placeholder="Select condition" /></SelectTrigger>
                        <SelectContent>{conditionOperators.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {renderDeviceConditionValueInput(deviceTrigger, (field, val) => setDeviceTrigger(t => ({ ...t, [field]: val })))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">For lights/switches, use 'on'/'off' or 'true'/'false'. For sensors, enter value.</p>
                  </div>
                )}
              </div>
            </fieldset>
          )}

          {/* Time Primary Trigger */}
          {triggerType === 'time' && (
             <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
              <legend className="text-lg font-semibold px-2 text-primary flex items-center"><Clock className="mr-2 h-5 w-5"/>Scheduled Time Trigger (AT...)</legend>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="trigger-time">Time (HH:mm)</Label>
                  <Input id="trigger-time" type="time" value={timeTrigger.time} onChange={(e) => setTimeTrigger(t => ({ ...t, time: e.target.value }))} disabled={isSaving} className="bg-input/50"/>
                </div>
                <div>
                  <Label>Days of the Week</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                    {daysOfWeek.map(day => (
                      <div key={day.id} className="flex items-center space-x-2">
                        <Checkbox id={`day-${day.id}`} checked={timeTrigger.days.includes(day.id)} onCheckedChange={() => handleDayToggle(day.id)} disabled={isSaving}/>
                        <Label htmlFor={`day-${day.id}`} className="text-sm font-normal">{day.label}</Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Select at least one day.</p>
                </div>
              </div>
            </fieldset>
          )}

          {/* Additional Conditions Section */}
           <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
            <legend className="text-lg font-semibold px-2 text-primary flex items-center">Additional Conditions (AND ALL MUST BE TRUE)</legend>
            <div className="space-y-4 mt-2">
              {conditions.map((cond, index) => (
                <div key={cond.uiKey} className="p-3 border rounded-md bg-muted/20 relative">
                  <p className="text-sm font-medium mb-2">Condition {index + 1}</p>
                   <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => handleRemoveCondition(cond.uiKey)} disabled={isSaving}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`condition-device-${cond.uiKey}`}>Device</Label>
                      <Select value={cond.deviceId} onValueChange={(val) => handleConditionChange(cond.uiKey, 'deviceId', val)} disabled={isSaving}>
                        <SelectTrigger id={`condition-device-${cond.uiKey}`} className="bg-input/50"><SelectValue placeholder="Select condition device" /></SelectTrigger>
                        <SelectContent>{availableDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {cond.deviceId && (
                      <div>
                        <Label>State Condition:</Label>
                        <div className="grid grid-cols-2 gap-2 items-end">
                          <Select value={cond.condition} onValueChange={(val) => handleConditionChange(cond.uiKey, 'condition', val as AutomationConditionOperator)} disabled={isSaving}>
                            <SelectTrigger className="bg-input/50"><SelectValue placeholder="Select operator" /></SelectTrigger>
                            <SelectContent>{conditionOperators.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}</SelectContent>
                          </Select>
                          {renderDeviceConditionValueInput(cond, (field, val) => handleConditionChange(cond.uiKey, field, val))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={handleAddCondition} disabled={isSaving}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Condition
              </Button>
            </div>
          </fieldset>

          {/* Action Section */}
          <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
            <legend className="text-lg font-semibold px-2 text-primary">Action (THEN...)</legend>
            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="action-device">Device</Label>
                <Select value={action.deviceId} onValueChange={(val) => setAction(a => ({ ...a, deviceId: val }))} disabled={isSaving}>
                  <SelectTrigger id="action-device" className="bg-input/50"><SelectValue placeholder="Select action device" /></SelectTrigger>
                  <SelectContent>
                    {availableDevices.filter(d => ['light', 'switch', 'fan', 'outlet'].includes(d.type)).map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {action.deviceId && (
                <div>
                  <Label htmlFor="action-command">Command</Label>
                  <Select value={action.command} onValueChange={(val) => setAction(a => ({ ...a, command: val as AutomationActionCommand }))} disabled={isSaving}>
                    <SelectTrigger id="action-command" className="bg-input/50"><SelectValue placeholder="Select command" /></SelectTrigger>
                    <SelectContent>{actionCommands.map(cmd => <SelectItem key={cmd.value} value={cmd.value}>{cmd.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </fieldset>
        </div>
      </ScrollArea>
      <DialogFooter className="mt-6 pt-4 border-t">
        <DialogClose asChild><Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}><X className="mr-2 h-4 w-4" /> Cancel</Button></DialogClose>
        <Button type="submit" onClick={handleSave} disabled={isSaving || !name.trim() || !primaryTriggerValid || !allConditionsValid || !actionValid}>
          {isSaving ? <Save className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isEditing ? 'Save Changes' : 'Create Automation'}
        </Button>
      </DialogFooter>
    </>
  );
}
