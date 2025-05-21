
// src/components/settings/ManageAutomationsContent.tsx
"use client";

import { useState, useEffect } from 'react';
import type { AutomationRule } from '@/types/automations';
import type { Device } from '@/types/home-assistant';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { fetchDevicesFromApi } from '@/services/homeAssistantService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Edit3, Trash2, Zap, Play, Pause, AlertCircle, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AutomationRuleForm } from './AutomationRuleForm';
import Link from 'next/link';


export function ManageAutomationsContent() {
  const {
    automations, addAutomation, updateAutomation, deleteAutomation, toggleAutomationEnable,
    preferences, // To get selectedDeviceIds
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
  
  // Filter available devices based on dashboard selection
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
      if ('id' in data) { // Existing rule
        await updateAutomation(data.id, data);
        toast({ title: "Automation Updated", description: `Rule "${data.name}" has been updated.` });
      } else { // New rule
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
    } catch (err: any) {
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
            <Skeleton key={index} className="h-20 w-full rounded-md" />
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
            Define rules to automate device actions based on triggers.
            These rules will be processed by a separate backend service (to be implemented by you).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {noDevicesOnDashboard && (
             <Alert variant="default" className="border-primary/30">
              <Settings2 className="h-5 w-5 text-primary" />
              <AlertTitle className="text-primary">Setup Dashboard Devices First</AlertTitle>
              <AlertDescription>
                To create automations, you first need to select which devices are available on your dashboard.
                This allows you to pick trigger and action devices for your rules.
                <br />
                <Button asChild variant="link" className="p-0 h-auto mt-1">
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
                <Card key={rule.id} className={`shadow-sm hover:shadow-md transition-shadow ${!rule.isEnabled ? 'opacity-60 bg-muted/30' : ''}`}>
                  <CardHeader className="pb-3 pt-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{rule.name}</CardTitle>
                        <CardDescription className="text-xs">
                          IF <span className="font-semibold text-accent">{getDeviceName(rule.trigger.deviceId)}</span> state {rule.trigger.condition.replace('_', ' ')} <span className="font-semibold text-accent">{String(rule.trigger.value)}</span>
                          <br />
                          THEN <span className="font-semibold text-accent">{rule.action.command.replace('_', ' ')}</span> <span className="font-semibold text-accent">{getDeviceName(rule.action.deviceId)}</span>
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
          <Button onClick={() => handleOpenDialog()} disabled={isSaving || noDevicesOnDashboard}>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Automation
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setCurrentRule(null); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-2xl">
          <AutomationRuleForm
            key={currentRule?.id || 'new'} // Force re-render if rule changes
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
