// src/app/(app)/settings/page.tsx
"use client";

import { VoiceSettings } from '@/components/settings/VoiceSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Settings2Icon, ListChecks, HomeIcon, Layers3, Zap, Workflow } from 'lucide-react'; // Added Workflow
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground flex items-center">
          <Settings2Icon className="mr-3 h-10 w-10 text-primary" />
          Application Settings
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Customize your HomePilot experience.
        </p>
      </header>

      <Separator />

      <VoiceSettings />

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <ListChecks className="mr-2 h-5 w-5 text-primary" />
            Dashboard Device Management
          </CardTitle>
          <CardDescription>
            Choose which devices appear on your main dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Click the button below to go to the device management page where you can select or deselect devices for your dashboard.
          </p>
          <Button asChild size="lg">
            <Link href="/manage-devices">
              <Settings2Icon className="mr-2 h-5 w-5" /> Manage Dashboard Devices
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <HomeIcon className="mr-2 h-5 w-5 text-primary" /> 
            Room & Group Management
          </CardTitle>
          <CardDescription>
            Define rooms and create custom device groups for easier control.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Organize your smart home devices by creating rooms (e.g., "Living Room", "Bedroom") and custom groups (e.g., "All Downstairs Lights").
          </p>
          <Button asChild size="lg">
            <Link href="/settings/manage-rooms-groups">
              <Layers3 className="mr-2 h-5 w-5" /> Manage Rooms & Groups
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Separator />
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Workflow className="mr-2 h-5 w-5 text-primary" />
            Custom Routines
          </CardTitle>
          <CardDescription>
            Create custom voice commands to trigger multiple actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Define routines like "Jarvis, movie time" to dim lights, turn on TV, etc.
          </p>
          <Button asChild size="lg">
            <Link href="/settings/routines">
              <Workflow className="mr-2 h-5 w-5" /> Manage Routines
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Zap className="mr-2 h-5 w-5 text-primary" />
            Automation Rules
          </CardTitle>
          <CardDescription>
            Create rules to automate your smart home based on device triggers or schedules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Define automations like "If Living Room Temperature is above 25°C, then turn on Living Room Fan" or "Every weekday at 7 AM, turn on Kitchen Lights".
            (Note: A separate backend service is required to execute these rules).
          </p>
          <Button asChild size="lg">
            <Link href="/settings/automations">
              <Zap className="mr-2 h-5 w-5" /> Manage Automations
            </Link>
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}
