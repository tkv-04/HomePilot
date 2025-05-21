
// src/app/(app)/settings/automations/page.tsx
import { ManageAutomationsContent } from '@/components/settings/ManageAutomationsContent';
import { Separator } from '@/components/ui/separator';
import { Zap } from 'lucide-react';

export default function AutomationsPage() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground flex items-center">
          <Zap className="mr-3 h-10 w-10 text-primary" /> 
          Manage Automations
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Create and manage rules to automate your smart home devices.
        </p>
      </header>
      <Separator />
      <ManageAutomationsContent />
    </div>
  );
}
