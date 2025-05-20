
// src/app/(app)/settings/page.tsx
"use client";

import { VoiceSettings } from '@/components/settings/VoiceSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Settings2Icon, ListChecks, HomeIcon, Layers3 } from 'lucide-react'; // Added HomeIcon, Layers3
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
            <HomeIcon className="mr-2 h-5 w-5 text-primary" /> {/* Changed icon */}
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

    </div>
  );
}
