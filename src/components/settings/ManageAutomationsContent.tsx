
// src/components/settings/ManageAutomationsContent.tsx
"use client";

import { useState, useEffect } from 'react';
import type { AutomationRule, DeviceAutomationTrigger } from '@/types/automations';
import type { Device } from '@/types/home-assistant';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { fetchDevicesFromApi } from '@/services/homeAssistantService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Edit3, Trash2, Zap, Settings2, Clock, AlertCircle, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AutomationRuleForm } from './AutomationRuleForm';
import Link from 'next/link';

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ManageAutomationsContent() {
  const {
    automations, addAutomation, updateAutomation, deleteAutomation, toggleAutomationEnable,
    preferences, 
    isLoading: isLoadingPreferences, error: preferencesError
  } = useUserPreferences();
  const { toast } = useToast();

  const [allApiDevices, setAllApiDevices] = useState<Device[]>([]);
  const [isLoadingApiDevices, setIsLoadingApiDevices] = useState(true);
  const [apiDevicesError, setApiDevicesError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState<AutomationRule | null>(null);
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
        toast({ title: "Error", description: "Could not load available devices for automations.", variant: "destructive" });
      } finally {
        setIsLoadingApiDevices(false);
      }
    }
    loadAllDevices();
  }, [toast]);

  const handleOpenDialog = (rule?: AutomationRule) => {
    if (dashboardSelectedDevices.length === 0 && !isLoadingApiDevices && !isLoadingPreferences) {
      toast({
        title: "No Dashboard Devices",
        description: "Please select devices for your dashboard first. Automations use dashboard devices.",
        variant: "default"
      });
      return;
    }
    if (rule) {
      setCurrentRule(rule);
      setIsEditing(true);
    } else {
      setCurrentRule(null);
      setIsEditing(false);
    }
    setDialogOpen(true);
  };

  const handleSaveAutomation = async (data: Omit<AutomationRule, 'id'> | AutomationRule) => {
    setIsSaving(true);
    try {
      if ('id' in data) { 
        await updateAutomation(data.id, data);
        toast({ title: "Automation Updated", description: `Rule "${data.name}" has been updated.` });
      } else { 
        await addAutomation(data);
        toast({ title: "Automation Added", description: `New rule "${data.name}" has been created.` });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message || "Could not save automation rule.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAutomation = async (ruleId: string, ruleName: string) => {
    if (!confirm(`Are you sure you want to delete the automation "${ruleName}"?`)) return;
    setIsSaving(true);
    try {
      await deleteAutomation(ruleId);
      toast({ title: "Automation Deleted", description: `Rule "${ruleName}" has been deleted.` });
    } catch (err: any)      {
      toast({ title: "Delete Failed", description: err.message || "Could not delete automation.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnable = async (ruleId: string, currentIsEnabled: boolean) => {
    setIsSaving(true);
    try {
      await toggleAutomationEnable(ruleId, !currentIsEnabled);
      toast({ title: "Automation Status Updated", description: `Rule is now ${!currentIsEnabled ? 'enabled' : 'disabled'}.` });
    } catch (err: any) {
       toast({ title: "Update Failed", description: err.message || "Could not update automation status.", variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  const getDeviceName = (deviceId: string) => {
    return allApiDevices.find(d => d.id === deviceId)?.name || deviceId;
  }
  
  const formatConditionValue = (value: string | number | boolean): string => {
    if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
    return String(value);
  };

  const formatTrigger = (rule: AutomationRule): string => {
    if (rule.trigger.type === 'device') {
      const triggerDeviceName = getDeviceName(rule.trigger.deviceId);
      return `IF ${triggerDeviceName} state ${rule.trigger.condition.replace('_', ' ')} ${formatConditionValue(rule.trigger.value)}`;
    } else if (rule.trigger.type === 'time') {
      const daysString = rule.trigger.days.length === 7 
        ? 'Every day' 
        : rule.trigger.days.map(d => dayLabels[d]).join(', ') || 'No days selected';
      return `AT ${rule.trigger.time} ON ${daysString}`;
    }
    return "Unknown trigger";
  };

  const formatConditions = (conditions?: DeviceAutomationTrigger[]): string | null => {
    if (!conditions || conditions.length === 0) return null;
    return conditions.map(cond => 
      `AND ${getDeviceName(cond.deviceId)} state ${cond.condition.replace('_', ' ')} ${formatConditionValue(cond.value)}`
    ).join(' ');
  };

  const formatAction = (rule: AutomationRule): string => {
    const actionDeviceName = getDeviceName(rule.action.deviceId);
    return `THEN ${rule.action.command.replace('_', ' ')} ${actionDeviceName}`;
  };

  const isLoading = isLoadingPreferences || isLoadingApiDevices;

  if (isLoading) {
    return (
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center"><Zap className="mr-2 h-6 w-6 text-primary" />Manage Automation Rules</CardTitle>
          <CardDescription>Loading automation rules and device data...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-md" />
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
          <CardTitle className="flex items-center"><Zap className="mr-2 h-6 w-6 text-primary" />Automation Rules</CardTitle>
          <CardDescription>
            Define rules to automate device actions. Primary trigger can be a device state or a schedule. 
            Optionally, add device conditions that must also be true.
            A separate backend service is required to execute these rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {noDevicesOnDashboard && (
             <Alert variant="default" className="border-primary/30">
              <Settings2 className="h-5 w-5 text-primary" />
              <AlertTitle className="text-primary">Setup Dashboard Devices First</AlertTitle>
              <AlertDescription>
                To create automations, you first need to select which devices are available on your dashboard.
                Automations can only use devices that are selected for the dashboard.
                <br />
                <Button asChild variant="link" className="p-0 h-auto mt-1 text-base">
                  <Link href="/manage-devices">Go to Manage Dashboard Devices</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {automations.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No automation rules configured yet. Click "Add New Automation" to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {automations.map(rule => (
                <Card key={rule.id} className={`shadow-sm hover:shadow-md transition-shadow ${!rule.isEnabled ? 'opacity-70 bg-muted/20' : 'bg-card'}`}>
                  <CardHeader className="pb-3 pt-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-grow min-w-0">
                        <CardTitle className="text-lg truncate" title={rule.name}>{rule.name}</CardTitle>
                        <CardDescription className="text-xs mt-1 space-y-0.5">
                          <span className={`flex items-center ${rule.trigger.type === 'time' ? 'text-blue-400' : 'text-orange-400'}`}>
                            {rule.trigger.type === 'time' ? <Clock className="mr-1.5 h-3.5 w-3.5" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                            {formatTrigger(rule)}
                          </span>
                          {rule.conditions && rule.conditions.length > 0 && (
                            <span className="flex items-center text-purple-400">
                              <Layers className="mr-1.5 h-3.5 w-3.5" /> {/* Icon for conditions */}
                              {formatConditions(rule.conditions)}
                            </span>
                          )}
                          <span className="flex items-center text-green-400">
                            <Zap className="mr-1.5 h-3.5 w-3.5" /> 
                            {formatAction(rule)}
                          </span>
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <Switch
                          id={`enable-${rule.id}`}
                          checked={rule.isEnabled}
                          onCheckedChange={() => handleToggleEnable(rule.id, rule.isEnabled)}
                          disabled={isSaving}
                          title={rule.isEnabled ? 'Disable Automation' : 'Enable Automation'}
                        />
                        <Button variant="outline" size="sm" onClick={() => handleOpenDialog(rule)} disabled={isSaving || noDevicesOnDashboard}>
                          <Edit3 className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteAutomation(rule.id, rule.name)} disabled={isSaving}>
                          <Trash2 className="mr-1 h-3 w-3" /> Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={() => handleOpenDialog()} disabled={isSaving || (noDevicesOnDashboard && !isLoadingApiDevices && !isLoadingPreferences) }>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Automation
          </Button>
           {noDevicesOnDashboard && <p className="ml-4 text-sm text-muted-foreground">Add devices to dashboard to enable automation creation.</p>}
        </CardFooter>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setCurrentRule(null); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-2xl">
          <AutomationRuleForm
            key={currentRule?.id || 'new-rule-form'} 
            rule={currentRule}
            availableDevices={dashboardSelectedDevices}
            onSave={handleSaveAutomation}
            onCancel={() => setDialogOpen(false)}
            isEditing={isEditing}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
