// src/components/dashboard/VoiceControl.tsx
"use client";

import { useState, useEffect, FormEvent } from 'react';
import { interpretVoiceCommand } from '@/ai/flows/interpret-voice-command';
import type { InterpretVoiceCommandOutput, InterpretVoiceCommandInput } from '@/ai/flows/interpret-voice-command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mic, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Mock browser SpeechRecognition
interface MockSpeechRecognition {
  start: () => void;
  stop: () => void;
  onresult?: (event: { results: { transcript: string; isFinal: boolean }[][] }) => void;
  onerror?: (event: { error: string }) => void;
  onend?: () => void;
}

export function VoiceControl() {
  const [commandText, setCommandText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [interpretedResult, setInterpretedResult] = useState<InterpretVoiceCommandOutput | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null);
  const [isListening, setIsListening] = useState(false);
  const { toast } = useToast();

  const recognitionRef = typeof window !== 'undefined' ? 
    (window.SpeechRecognition || window.webkitSpeechRecognition ? new (window.SpeechRecognition || window.webkitSpeechRecognition)() : null) 
    : null;
    
  useEffect(() => {
    if (!recognitionRef) {
      console.warn("SpeechRecognition API not supported in this browser.");
      return;
    }

    recognitionRef.continuous = false;
    recognitionRef.lang = 'en-US';
    recognitionRef.interimResults = false;
    recognitionRef.maxAlternatives = 1;

    recognitionRef.onresult = (event: any) => { // Using 'any' due to SpeechRecognitionEvent type complexity
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      setCommandText(transcript);
      handleInterpretCommand(transcript);
    };

    recognitionRef.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      toast({
        title: "Voice Recognition Error",
        description: `Error: ${event.error}. Please try typing your command.`,
        variant: "destructive",
      });
      setIsListening(false);
      setIsLoading(false);
    };
    
    recognitionRef.onend = () => {
      setIsListening(false);
    };

    // Cleanup function to stop recognition if component unmounts
    return () => {
      if (recognitionRef && isListening) {
        recognitionRef.stop();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognitionRef, isListening]); // isListening is added to re-setup onend if it changes state

  const handleMicClick = () => {
    if (!recognitionRef) {
      toast({
        title: "Unsupported Feature",
        description: "Voice recognition is not supported in your browser. Please type your command.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognitionRef.stop();
      setIsListening(false);
    } else {
      setCommandText("");
      setInterpretedResult(null);
      setFeedbackMessage(null);
      setFeedbackType(null);
      try {
        recognitionRef.start();
        setIsListening(true);
        toast({ title: "Listening...", description: "Speak your command now." });
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        toast({
          title: "Voice Error",
          description: "Could not start voice recognition. Check microphone permissions.",
          variant: "destructive",
        });
        setIsListening(false);
      }
    }
  };
  
  const handleInterpretCommand = async (commandToInterpret: string) => {
    if (!commandToInterpret.trim()) {
      toast({ title: "Empty Command", description: "Please enter or say a command.", variant: "destructive" });
      setIsListening(false); // Ensure listening stops if command is empty after an attempt
      return;
    }

    setIsLoading(true);
    setInterpretedResult(null);
    setFeedbackMessage(null);
    setFeedbackType(null);

    try {
      const input: InterpretVoiceCommandInput = { voiceCommand: commandToInterpret };
      const response = await interpretVoiceCommand(input);
      setInterpretedResult(response);
      
      // Simulate Home Assistant action
      setFeedbackMessage(`Interpreted: "${response.action} ${response.device}${response.rawValue ? ' to ' + response.rawValue : ''}". Simulating action...`);
      setFeedbackType('success');
      toast({
        title: "Command Interpreted",
        description: `Action: ${response.action}, Device: ${response.device}`,
      });

      // Simulate HA call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      setFeedbackMessage(`Simulated: "${response.action} ${response.device}${response.rawValue ? ' to ' + response.rawValue : ''}" successfully executed.`);
      // Visual cue of success after simulation
      setInterpretedResult(prev => prev ? {...prev, simulatedStatus: 'success'} as any : null);


    } catch (error) {
      console.error("Failed to interpret command:", error);
      setFeedbackMessage("Error: Could not interpret or simulate command.");
      setFeedbackType('error');
      toast({
        title: "Interpretation Error",
        description: "Failed to process your command. Please try again.",
        variant: "destructive",
      });
      setInterpretedResult(prev => prev ? {...prev, simulatedStatus: 'error'} as any : null);
    } finally {
      setIsLoading(false);
      setIsListening(false); // Ensure listening stops after command processing
    }
  };

  const handleSubmitTextCommand = (event: FormEvent) => {
    event.preventDefault();
    handleInterpretCommand(commandText);
  };
  
  const getDeviceIcon = (device?: string) => {
    if (!device) return <Lightbulb className="h-5 w-5" />;
    const lowerDevice = device.toLowerCase();
    if (lowerDevice.includes("light")) return <Lightbulb className="h-5 w-5" />;
    if (lowerDevice.includes("thermostat") || lowerDevice.includes("temp")) return <Thermometer className="h-5 w-5" />;
    if (lowerDevice.includes("tv") || lowerDevice.includes("television")) return <Tv2 className="h-5 w-5" />;
    if (lowerDevice.includes("lock") || lowerDevice.includes("door")) return <Lock className="h-5 w-5" />;
    return <Lightbulb className="h-5 w-5" />; // Default icon
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-8">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">HomePilot Control</CardTitle>
          <CardDescription>Use your voice or type to control your smart home devices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-2">
            <Button 
              onClick={handleMicClick} 
              variant={isListening ? "destructive" : "outline"} 
              size="lg"
              className={`p-4 rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 ${isListening ? 'animate-pulse bg-accent/30 border-accent' : 'border-primary/50'}`}
              aria-label={isListening ? "Stop listening" : "Start listening"}
            >
              <Mic className={`h-8 w-8 ${isListening ? 'text-destructive-foreground' : 'text-primary'}`} />
            </Button>
            <form onSubmit={handleSubmitTextCommand} className="flex-grow flex items-center space-x-2">
              <Input
                type="text"
                placeholder={isListening ? "Listening..." : "Or type command, e.g., 'Turn on living room light'"}
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                disabled={isLoading || isListening}
                className="flex-grow text-lg p-3 bg-input/50 border-border focus:ring-accent"
              />
              <Button type="submit" size="lg" disabled={isLoading || isListening || !commandText.trim()} className="bg-primary hover:bg-primary/80">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              </Button>
            </form>
          </div>

          {isLoading && !isListening && ( // Show loader only when processing text command and not listening
            <div className="flex justify-center items-center p-4">
              <Loader2 className="h-12 w-12 animate-spin text-accent" />
              <p className="ml-3 text-lg text-muted-foreground">Processing command...</p>
            </div>
          )}
          
          {interpretedResult && (
            <Card className="mt-6 bg-card/80 border-border shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  {getDeviceIcon(interpretedResult.device)}
                  <span className="ml-2">Interpreted Command</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-base">
                <p><strong className="text-foreground">Action:</strong> <span className="text-accent">{interpretedResult.action}</span></p>
                <p><strong className="text-foreground">Device:</strong> <span className="text-accent">{interpretedResult.device}</span></p>
                {interpretedResult.rawValue && (
                  <p><strong className="text-foreground">Value:</strong> <span className="text-accent">{interpretedResult.rawValue}</span></p>
                )}
              </CardContent>
            </Card>
          )}

          {feedbackMessage && feedbackType && (
             <Alert variant={feedbackType === 'error' ? 'destructive' : 'default'} className={`mt-6 ${feedbackType === 'success' ? 'border-green-500' : 'border-red-500'}`}>
              {feedbackType === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
              <AlertTitle className={`ml-2 ${feedbackType === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {feedbackType === 'success' ? 'Success' : 'Error'}
              </AlertTitle>
              <AlertDescription className="ml-2">{feedbackMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="text-center">
          <p className="text-xs text-muted-foreground">
            HomePilot uses AI to understand your commands. Actual device control is simulated.
          </p>
        </CardFooter>
      </Card>

      <div className="w-full max-w-2xl p-4 bg-card/50 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2 text-center text-foreground">Example Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>"Turn on the kitchen lights"</li>
          <li>"Set thermostat to 72 degrees"</li>
          <li>"Lock the front door"</li>
          <li>"Play music on the living room speaker"</li>
        </ul>
      </div>
    </div>
  );
}
