
// src/components/settings/VoiceSettings.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2, Loader2 } from 'lucide-react';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useToast } from '@/hooks/use-toast';

export function VoiceSettings() {
  const [speechSynthesisApiAvailable, setSpeechSynthesisApiAvailable] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [localSelectedVoiceURI, setLocalSelectedVoiceURI] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { 
    preferences, 
    updateSelectedVoiceURI, 
    isLoading: isLoadingPreferences,
    error: preferencesError 
  } = useUserPreferences();
  const { toast } = useToast();

  const populateVoices = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0 && !isLoadingPreferences && preferences) {
        const currentPrefVoice = preferences.selectedVoiceURI;
        if (currentPrefVoice && voices.find(v => v.voiceURI === currentPrefVoice)) {
          setLocalSelectedVoiceURI(currentPrefVoice);
        } else {
          const defaultUsVoice = voices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('google')) || voices.find(voice => voice.lang === 'en-US');
          setLocalSelectedVoiceURI(defaultUsVoice ? defaultUsVoice.voiceURI : voices[0]?.voiceURI || null);
        }
      } else if (voices.length > 0 && !isLoadingPreferences && !preferences && !preferencesError) {
        // No preferences loaded (e.g. new user), set a default
        const defaultUsVoice = voices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('google')) || voices.find(voice => voice.lang === 'en-US');
        setLocalSelectedVoiceURI(defaultUsVoice ? defaultUsVoice.voiceURI : voices[0]?.voiceURI || null);
      }
    }
  }, [preferences, isLoadingPreferences, preferencesError]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setSpeechSynthesisApiAvailable(true);
      populateVoices(); // Initial population
      // Voices might load asynchronously
      window.speechSynthesis.onvoiceschanged = populateVoices;
    } else {
      console.warn("SpeechSynthesis API not supported in this browser.");
      setSpeechSynthesisApiAvailable(false);
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [populateVoices]);
  
  useEffect(() => {
    // This effect runs once preferences are loaded to set the initial localSelectedVoiceURI
    if (!isLoadingPreferences && preferences) {
        const currentPrefVoice = preferences.selectedVoiceURI;
        if (currentPrefVoice && availableVoices.find(v => v.voiceURI === currentPrefVoice)) {
            setLocalSelectedVoiceURI(currentPrefVoice);
        } else if (availableVoices.length > 0) {
             // If preference is not set or invalid, pick a default from available voices
            const defaultUsVoice = availableVoices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('google')) || availableVoices.find(voice => voice.lang === 'en-US');
            setLocalSelectedVoiceURI(defaultUsVoice ? defaultUsVoice.voiceURI : availableVoices[0]?.voiceURI || null);
        }
    } else if (!isLoadingPreferences && !preferences && availableVoices.length > 0 && !preferencesError) {
        // Case for new user with no preferences, set a default if voices are available
        const defaultUsVoice = availableVoices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('google')) || availableVoices.find(voice => voice.lang === 'en-US');
        setLocalSelectedVoiceURI(defaultUsVoice ? defaultUsVoice.voiceURI : availableVoices[0]?.voiceURI || null);
    }
  }, [preferences, isLoadingPreferences, availableVoices, preferencesError]);


  const handleVoiceChange = async (voiceURI: string) => {
    setLocalSelectedVoiceURI(voiceURI);
    setIsSaving(true);
    try {
      await updateSelectedVoiceURI(voiceURI);
      toast({
        title: "Voice Updated",
        description: "Your preferred voice has been saved.",
      });
    } catch (err) {
      toast({
        title: "Update Failed",
        description: "Could not save your voice preference.",
        variant: "destructive",
      });
      // Optionally revert localSelectedVoiceURI to preferences.selectedVoiceURI if save fails
      if (preferences) setLocalSelectedVoiceURI(preferences.selectedVoiceURI || null);
    } finally {
      setIsSaving(false);
    }
  };
  
  if (!speechSynthesisApiAvailable) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Volume2 className="mr-2 h-5 w-5 text-primary" />
            Voice Output Settings
          </CardTitle>
          <CardDescription>Configure the voice used for spoken responses.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Speech synthesis is not available or not supported by your browser.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Volume2 className="mr-2 h-5 w-5 text-primary" />
          Voice Output Settings
        </CardTitle>
        <CardDescription>Choose the voice for HomePilot's spoken responses.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingPreferences && (
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading voice preferences...</span>
          </div>
        )}
        {preferencesError && (
            <p className="text-destructive">Error loading preferences: {preferencesError.message}</p>
        )}
        {!isLoadingPreferences && availableVoices.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="voice-select" className="text-base">Select Voice</Label>
            <Select 
              value={localSelectedVoiceURI || ''} 
              onValueChange={handleVoiceChange}
              disabled={isSaving || isLoadingPreferences}
            >
              <SelectTrigger id="voice-select" className="w-full bg-input/50 border-border">
                <SelectValue placeholder="Select a voice..." />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto bg-popover border-border">
                {availableVoices.map((voice) => (
                  <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang}) {voice.default && "(Default)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSaving && <p className="text-sm text-muted-foreground flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</p>}
          </div>
        ) : !isLoadingPreferences && (
          <p className="text-muted-foreground">No voices available in your browser, or they are still loading.</p>
        )}
      </CardContent>
    </Card>
  );
}
