// src/components/settings/WakeWordSettings.tsx
"use client";

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Radio, Loader2, Save } from 'lucide-react'; // Using Radio as a generic "voice" icon
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useToast } from '@/hooks/use-toast';

export function WakeWordSettings() {
  const [localWakeWord, setLocalWakeWord] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { 
    preferences, 
    updateCustomWakeWord, 
    isLoading: isLoadingPreferences,
    error: preferencesError 
  } = useUserPreferences();
  const { toast } = useToast();

  useEffect(() => {
    if (preferences) {
      setLocalWakeWord(preferences.customWakeWord || "jarvis");
    }
  }, [preferences]);

  const handleSaveWakeWord = async () => {
    if (!localWakeWord.trim()) {
      toast({
        title: "Invalid Wake Word",
        description: "Wake word cannot be empty. It will default to 'jarvis'.",
        variant: "destructive",
      });
      setLocalWakeWord("jarvis"); // Reset to default if user tries to save empty
      await updateCustomWakeWord("jarvis");
      return;
    }
    setIsSaving(true);
    try {
      await updateCustomWakeWord(localWakeWord.trim().toLowerCase());
      toast({
        title: "Wake Word Updated",
        description: `Your wake word is now "${localWakeWord.trim().toLowerCase()}".`,
      });
    } catch (err) {
      toast({
        title: "Update Failed",
        description: "Could not save your wake word preference.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoadingPreferences) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Radio className="mr-2 h-5 w-5 text-primary" />
            Wake Word Settings
          </CardTitle>
          <CardDescription>Define the wake word for voice commands.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading wake word preferences...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (preferencesError) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center text-xl text-destructive">
            <Radio className="mr-2 h-5 w-5" />
            Wake Word Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-destructive">Error loading preferences: {preferencesError.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Radio className="mr-2 h-5 w-5 text-primary" />
          Wake Word Settings
        </CardTitle>
        <CardDescription>
          Set your preferred wake word for activating voice commands.
          The wake word is case-insensitive and will be stored in lowercase. Defaults to "jarvis".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wake-word-input" className="text-base">Custom Wake Word</Label>
          <div className="flex items-center space-x-2">
            <Input 
              id="wake-word-input"
              type="text"
              value={localWakeWord}
              onChange={(e) => setLocalWakeWord(e.target.value)}
              placeholder="e.g., home, computer, pilot"
              className="flex-grow bg-input/50 border-border"
              disabled={isSaving}
            />
            <Button onClick={handleSaveWakeWord} disabled={isSaving || !localWakeWord.trim() || localWakeWord.trim().toLowerCase() === (preferences?.customWakeWord || "jarvis")}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            After changing, you'll say "{localWakeWord || 'jarvis'}" then your command.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
