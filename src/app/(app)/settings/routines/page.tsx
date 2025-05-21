// src/app/(app)/settings/routines/page.tsx
import { ManageRoutinesContent } from '@/components/settings/ManageRoutinesContent';
import { Separator } from '@/components/ui/separator';
import { Workflow } from 'lucide-react';

export default function RoutinesPage() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground flex items-center">
          <Workflow className="mr-3 h-10 w-10 text-primary" /> 
          Manage Routines
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Create custom voice commands (phrases) to trigger a sequence of actions on your devices.
        </p>
      </header>
      <Separator />
      <ManageRoutinesContent />
    </div>
  );
}
