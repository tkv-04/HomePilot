// src/app/(app)/dashboard/page.tsx
"use client";

import { VoiceControl } from '@/components/dashboard/VoiceControl';
import { DeviceDisplay } from '@/components/dashboard/DeviceDisplay';
import { Separator } from '@/components/ui/separator';
import type { Device } from '@/types/home-assistant';
import { useState } from 'react';

export default function DashboardPage() {
  const [dashboardDevices, setDashboardDevices] = useState<Device[]>([]);

  return (
    <div className="space-y-8">
      <VoiceControl
        selectedDevices={dashboardDevices}
        // If VoiceControl needs to trigger a refresh of devices in DeviceDisplay after a command,
        // we might need to pass a refresh function down. For now, DeviceDisplay handles its own state.
      />
      <Separator className="my-10" />
      <DeviceDisplay onDevicesLoaded={setDashboardDevices} />
    </div>
  );
}
