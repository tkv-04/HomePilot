// src/app/(app)/dashboard/page.tsx
import { VoiceControl } from '@/components/dashboard/VoiceControl';
import { DeviceDisplay } from '@/components/dashboard/DeviceDisplay';
import { Separator } from '@/components/ui/separator';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <VoiceControl />
      <Separator className="my-10" />
      <DeviceDisplay />
    </div>
  );
}
