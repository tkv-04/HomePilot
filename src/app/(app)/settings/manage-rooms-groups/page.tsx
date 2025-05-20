
// src/app/(app)/settings/manage-rooms-groups/page.tsx
import { ManageRoomsAndGroupsContent } from '@/components/settings/ManageRoomsAndGroupsContent';
import { Separator } from '@/components/ui/separator';
import { HomeIcon, Layers3, Settings2Icon } from 'lucide-react'; // Added Layers3 for groups

export default function ManageRoomsAndGroupsPage() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground flex items-center">
          <HomeIcon className="mr-3 h-10 w-10 text-primary" /> 
          Manage Rooms & Groups
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Organize your devices into rooms and create custom groups for easier control.
        </p>
      </header>
      <Separator />
      <ManageRoomsAndGroupsContent />
    </div>
  );
}
