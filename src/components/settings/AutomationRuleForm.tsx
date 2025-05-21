
// src/components/settings/AutomationRuleForm.tsx
"use client";

import type { AutomationRule, AutomationTrigger, AutomationAction, AutomationConditionOperator, AutomationActionCommand, DeviceAutomationTrigger, TimeAutomationTrigger, RecurringTimeAutomationTrigger, SpecificDateAutomationTrigger } from '@/types/automations';
import type { Device } from '@/types/home-assistant';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Save, X, Trash2, AlertTriangle, Clock, Zap, PlusCircle, CalendarDays } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { v4 as uuidv4 } from 'uuid';

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

const defaultRecurringTimeTrigger: RecurringTimeAutomationTrigger = {
  type: 'time',
  scheduleType: 'recurring',
  time: '08:00', 
  days: [], 
};

const defaultSpecificDateTrigger: SpecificDateAutomationTrigger = {
    type: 'time',
    scheduleType: 'specific_date',
    time: '08:00',
    specificDate: new Date().toISOString().split('T')[0], // Default to today
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
  const [primaryTriggerType, setPrimaryTriggerType] = useState<'device' | 'time'>('device');
  
  // Device Trigger State
  const [deviceTrigger, setDeviceTrigger] = useState<DeviceAutomationTrigger>({ ...defaultDeviceTrigger });
  
  // Time Trigger State (now more complex)
  const [timeScheduleType, setTimeScheduleType] = useState<'recurring' | 'specific_date'>('recurring');
  const [timeTriggerTime, setTimeTriggerTime] = useState('08:00');
  const [timeTriggerDays, setTimeTriggerDays] = useState<number[]>([]);
  const [timeTriggerSpecificDate, setTimeTriggerSpecificDate] = useState(new Date().toISOString().split('T')[0]);

  const [conditions, setConditions] = useState<(DeviceAutomationTrigger & { uiKey: string })[]>([]);
  const [action, setAction] = useState<AutomationAction>({ ...defaultAction });
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name || '');
      setIsEnabled(rule.isEnabled !== undefined ? rule.isEnabled : true);
      setAction(rule.action || { ...defaultAction });
      setPrimaryTriggerType(rule.trigger.type);

      if (rule.trigger.type === 'device') {
        setDeviceTrigger(rule.trigger);
        // Reset time trigger states
        setTimeScheduleType('recurring');
        setTimeTriggerTime(defaultRecurringTimeTrigger.time);
        setTimeTriggerDays(defaultRecurringTimeTrigger.days);
        setTimeTriggerSpecificDate(defaultSpecificDateTrigger.specificDate);
      } else if (rule.trigger.type === 'time') {
        const tt = rule.trigger as TimeAutomationTrigger; // Cast to base TimeAutomationTrigger first
        setTimeTriggerTime(tt.time);
        setTimeScheduleType(tt.scheduleType);
        if (tt.scheduleType === 'recurring') {
          setTimeTriggerDays(tt.days);
          setTimeTriggerSpecificDate(defaultSpecificDateTrigger.specificDate);
        } else if (tt.scheduleType === 'specific_date') {
          setTimeTriggerSpecificDate(tt.specificDate);
          setTimeTriggerDays(defaultRecurringTimeTrigger.days);
        }
        // Reset device trigger state
        setDeviceTrigger({ ...defaultDeviceTrigger });
      }
      setConditions(rule.conditions?.map(c => ({ ...c, uiKey: uuidv4() })) || []);
    } else {
      // Reset all to defaults for new rule
      setName('');
      setPrimaryTriggerType('device');
      setDeviceTrigger({ ...defaultDeviceTrigger });
      setTimeScheduleType('recurring');
      setTimeTriggerTime(defaultRecurringTimeTrigger.time);
      setTimeTriggerDays(defaultRecurringTimeTrigger.days);
      setTimeTriggerSpecificDate(defaultSpecificDateTrigger.specificDate);
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
    setTimeTriggerDays(prev => {
      const newDays = prev.includes(dayId)
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId].sort((a, b) => a - b);
      return newDays;
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
      c.uiKey === uiKey ? { ...c, [field]: value, ...(field === 'deviceId' && { value: '' }) } : c
    ));
  };
  
  const parseConditionValue = (deviceId: string, conditionOp: AutomationConditionOperator, rawValue: string | number | boolean) => {
    if (isBooleanInputExpectedForEquals(deviceId, conditionOp)) {
      return String(rawValue).toLowerCase() === 'on' || String(rawValue).toLowerCase() === 'true';
    } else if (isNumericInputExpected(conditionOp)) {
      const num = parseFloat(String(rawValue));
      return isNaN(num) ? String(rawValue) : num; // Return string if not a number, otherwise the number
    }
    return String(rawValue);
  };

  const validateCondition = (cond: DeviceAutomationTrigger): string | null => {
    if (!cond.deviceId) return "Condition device not selected.";
    const parsedValue = parseConditionValue(cond.deviceId, cond.condition, cond.value);
    if (isNumericInputExpected(cond.condition) && typeof parsedValue !== 'number') {
        return "Numeric value required for this condition operator.";
    }
    if (String(cond.value).trim() === '') { // Check raw value for emptiness
        return "Condition value cannot be empty."
    }
    return null;
  };


  const handleSave = async () => {
    if (!name.trim()) {
      alert("Please fill in the Automation Name.");
      return;
    }

    let finalTrigger: AutomationTrigger;
    if (primaryTriggerType === 'device') {
      const deviceTriggerError = validateCondition(deviceTrigger);
      if (deviceTriggerError) {
          alert(`Primary Trigger Error: ${deviceTriggerError}`);
          return;
      }
      finalTrigger = { ...deviceTrigger, value: parseConditionValue(deviceTrigger.deviceId, deviceTrigger.condition, deviceTrigger.value) };
    } else { // Time trigger
      if (!timeTriggerTime) {
        alert("Please set a time for the schedule.");
        return;
      }
      if (timeScheduleType === 'recurring' && timeTriggerDays.length === 0) {
        alert("Please select at least one day for a recurring schedule.");
        return;
      }
      if (timeScheduleType === 'specific_date' && !timeTriggerSpecificDate) {
        alert("Please select a specific date for the schedule.");
        return;
      }
      if (timeScheduleType === 'specific_date' && new Date(timeTriggerSpecificDate + 'T' + timeTriggerTime) <= new Date()) {
        alert("The specific date and time must be in the future.");
        return;
      }

      if (timeScheduleType === 'recurring') {
        finalTrigger = { type: 'time', scheduleType: 'recurring', time: timeTriggerTime, days: timeTriggerDays };
      } else { // specific_date
        finalTrigger = { type: 'time', scheduleType: 'specific_date', time: timeTriggerTime, specificDate: timeTriggerSpecificDate };
      }
    }

    const finalConditions: DeviceAutomationTrigger[] = [];
    for (const cond of conditions) {
        const condError = validateCondition(cond);
        if (condError) {
            alert(`Error in Additional Condition for device "${availableDevices.find(d=>d.id === cond.deviceId)?.name || cond.deviceId}": ${condError}`);
            return;
        }
        finalConditions.push({
            type: 'device', // All additional conditions are device conditions
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
      conditions: finalConditions.length > 0 ? finalConditions : undefined,
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
    primaryTriggerType === 'device' ? (deviceTrigger.deviceId && String(deviceTrigger.value).trim() !== '') :
    primaryTriggerType === 'time' ? 
      (timeTriggerTime && 
        ( (timeScheduleType === 'recurring' && timeTriggerDays.length > 0) || 
          (timeScheduleType === 'specific_date' && timeTriggerSpecificDate && (new Date(timeTriggerSpecificDate + 'T' + timeTriggerTime) > new Date()) )
        )
      ) 
    : false;

  const allConditionsValid = conditions.every(c => c.deviceId && String(c.value).trim() !== '');
  const actionValid = action.deviceId;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Edit Automation Rule' : 'Create New Automation Rule'}</DialogTitle>
        <DialogDescription>
          Define a primary trigger (device state or time/date). Optionally add device conditions (all must be true). Then define an action.
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
              <Switch id="automation-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} disabled={isSaving} />
              <Label htmlFor="automation-enabled" className="text-sm">{isEnabled ? 'Automation is ON' : 'Automation is OFF'}</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="trigger-type" className="text-base font-medium">Primary Trigger Type</Label>
            <Select value={primaryTriggerType} onValueChange={(val: 'device' | 'time') => setPrimaryTriggerType(val)} disabled={isSaving}>
              <SelectTrigger id="trigger-type" className="mt-1 bg-input/50"><SelectValue placeholder="Select trigger type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="device"><Zap className="mr-2 h-4 w-4 inline-block" /> Device State Change</SelectItem>
                <SelectItem value="time"><Clock className="mr-2 h-4 w-4 inline-block" /> Scheduled Time/Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {primaryTriggerType === 'device' && (
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

          {primaryTriggerType === 'time' && (
             <fieldset className="border p-4 rounded-md shadow-sm bg-card/30">
              <legend className="text-lg font-semibold px-2 text-primary flex items-center"><Clock className="mr-2 h-5 w-5"/>Scheduled Trigger (AT...)</legend>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Schedule Type</Label>
                  <RadioGroup value={timeScheduleType} onValueChange={(val: 'recurring' | 'specific_date') => setTimeScheduleType(val)} className="flex space-x-4 mt-1">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="recurring" id="time-recurring" />
                      <Label htmlFor="time-recurring">Recurring (Days of Week)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="specific_date" id="time-specific" />
                      <Label htmlFor="time-specific">Specific Date</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="trigger-time">Time (HH:mm)</Label>
                  <Input id="trigger-time" type="time" value={timeTriggerTime} onChange={(e) => setTimeTriggerTime(e.target.value)} disabled={isSaving} className="bg-input/50"/>
                </div>

                {timeScheduleType === 'recurring' && (
                  <div>
                    <Label>Days of the Week</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                      {daysOfWeek.map(day => (
                        <div key={day.id} className="flex items-center space-x-2">
                          <Checkbox id={`day-${day.id}`} checked={timeTriggerDays.includes(day.id)} onCheckedChange={() => handleDayToggle(day.id)} disabled={isSaving}/>
                          <Label htmlFor={`day-${day.id}`} className="text-sm font-normal">{day.label}</Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Select at least one day for recurring.</p>
                  </div>
                )}

                {timeScheduleType === 'specific_date' && (
                  <div>
                    <Label htmlFor="trigger-specific-date">Specific Date</Label>
                    <Input id="trigger-specific-date" type="date" value={timeTriggerSpecificDate} onChange={(e) => setTimeTriggerSpecificDate(e.target.value)} disabled={isSaving} className="bg-input/50"/>
                     <p className="text-xs text-muted-foreground mt-1">Date must be in the future.</p>
                  </div>
                )}
              </div>
            </fieldset>
          )}

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
