
// src/components/settings/VoiceSettings.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2 } from 'lucide-react';

const SELECTED_VOICE_URI_LS_KEY = 'homepilot_selected_voice_uri';

export function VoiceSettings() {
  const [speechSynthesisApiAvailable, setSpeechSynthesisApiAvailable] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);

  const populateVoices = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0) {
        const storedVoiceURI = localStorage.getItem(SELECTED_VOICE_URI_LS_KEY);
        if (storedVoiceURI && voices.find(v => v.voiceURI === storedVoiceURI)) {
          setSelectedVoiceURI(storedVoiceURI);
        } else {
          const defaultVoice = voices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('google')) || voices.find(voice => voice.lang === 'en-US');
          setSelectedVoiceURI(defaultVoice ? defaultVoice.voiceURI : voices[0]?.voiceURI || null);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setSpeechSynthesisApiAvailable(true);
      populateVoices();
      // Voices might load asynchronously, so listen for changes
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

  const handleVoiceChange = (voiceURI: string) => {
    setSelectedVoiceURI(voiceURI);
    localStorage.setItem(SELECTED_VOICE_URI_LS_KEY, voiceURI);
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
        {availableVoices.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="voice-select" className="text-base">Select Voice</Label>
            <Select value={selectedVoiceURI || ''} onValueChange={handleVoiceChange}>
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
          </div>
        ) : (
          <p className="text-muted-foreground">No voices available in your browser, or they are still loading.</p>
        )}
      </CardContent>
    </Card>
  );
}
