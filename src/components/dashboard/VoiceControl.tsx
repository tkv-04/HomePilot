// src/components/dashboard/VoiceControl.tsx
"use client";

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import { interpretVoiceCommand } from '@/ai/flows/interpret-voice-command';
import type { InterpretVoiceCommandOutput, InterpretVoiceCommandInput } from '@/ai/flows/interpret-voice-command';
import { executeDeviceCommandOnApi } from '@/services/homeAssistantService';
import type { Device } from '@/types/home-assistant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mic, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MockSpeechRecognition {
  start: () => void;
  stop: () => void;
  onresult?: (event: { results: { transcript: string; isFinal: boolean }[][] }) => void;
  onerror?: (event: { error: string }) => void;
  onend?: () => void;
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
}

interface VoiceControlProps {
  selectedDevices: Device[];
}

export function VoiceControl({ selectedDevices }: VoiceControlProps) {
  const [commandText, setCommandText] = useState("");
  const [isProcessingCommand, setIsProcessingCommand] = useState(false); // Renamed from isLoading for clarity
  const [interpretedResult, setInterpretedResult] = useState<InterpretVoiceCommandOutput & { targetDevice?: Device } | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info' | null>(null);
  const [isListening, setIsListening] = useState(false);
  const { toast } = useToast();

  const recognitionRef = useRef<MockSpeechRecognition | null>(null);
  const [speechApiAvailable, setSpeechApiAvailable] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionAPI();
      if (recognitionRef.current) {
        recognitionRef.current.continuous = false;
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.interimResults = false;
        recognitionRef.current.maxAlternatives = 1;
      }
      setSpeechApiAvailable(true);
    } else {
      console.warn("SpeechRecognition API not supported in this browser.");
      setSpeechApiAvailable(false);
    }
  }, []);

  const handleInterpretAndExecuteCommand = useCallback(async (commandToInterpret: string) => {
    if (!commandToInterpret.trim()) {
      toast({ title: "Empty Command", description: "Please enter or say a command.", variant: "destructive" });
      setIsListening(false);
      return;
    }

    setIsProcessingCommand(true);
    setInterpretedResult(null);
    setFeedbackMessage("Interpreting your command...");
    setFeedbackType('info');

    let genkitResponse: InterpretVoiceCommandOutput;
    try {
      const input: InterpretVoiceCommandInput = { voiceCommand: commandToInterpret };
      genkitResponse = await interpretVoiceCommand(input);
      setInterpretedResult({ ...genkitResponse }); // Store initial interpretation
    } catch (error) {
      console.error("Failed to interpret command:", error);
      setFeedbackMessage("Error: Could not interpret your command.");
      setFeedbackType('error');
      toast({
        title: "Interpretation Error",
        description: "Failed to process your command. Please try again.",
        variant: "destructive",
      });
      setIsProcessingCommand(false);
      setIsListening(false);
      return;
    }

    // Now try to match and execute
    if (selectedDevices.length === 0) {
      setFeedbackMessage("No devices selected on your dashboard to control.");
      setFeedbackType('info');
      toast({ title: "No Devices", description: "Please select devices on your dashboard first." });
      setIsProcessingCommand(false);
      setIsListening(false);
      return;
    }

    const targetDeviceNameLower = genkitResponse.device.toLowerCase();
    const targetDevice = selectedDevices.find(
      d => d.name.toLowerCase() === targetDeviceNameLower || d.id.toLowerCase() === targetDeviceNameLower
    );

    if (!targetDevice) {
      setFeedbackMessage(`Device "${genkitResponse.device}" not found on your dashboard or is not recognized.`);
      setFeedbackType('error');
      toast({ title: "Device Not Found", description: `Could not find "${genkitResponse.device}" on your dashboard.` , variant: "destructive"});
      setIsProcessingCommand(false);
      setIsListening(false);
      return;
    }
    
    setInterpretedResult({ ...genkitResponse, targetDevice });


    const actionLower = genkitResponse.action.toLowerCase();
    let apiCommand = '';
    let apiParams: Record<string, any> = {};

    if (actionLower.includes("turn on") || actionLower.includes("activate")) {
      apiCommand = 'action.devices.commands.OnOff';
      apiParams = { on: true };
    } else if (actionLower.includes("turn off") || actionLower.includes("deactivate")) {
      apiCommand = 'action.devices.commands.OnOff';
      apiParams = { on: false };
    } else {
      setFeedbackMessage(`Action "${genkitResponse.action}" on ${targetDevice.name} is not currently supported by voice.`);
      setFeedbackType('info');
      toast({ title: "Unsupported Action", description: `Voice command action "${genkitResponse.action}" is not supported yet.` });
      setIsProcessingCommand(false);
      setIsListening(false);
      return;
    }

    // Check if device type supports OnOff (basic check)
    if (targetDevice.type !== 'light' && targetDevice.type !== 'switch' && targetDevice.type !== 'fan' && targetDevice.type !== 'outlet') {
        setFeedbackMessage(`Device type "${targetDevice.type}" does not support On/Off commands through voice control currently.`);
        setFeedbackType('info');
        toast({ title: "Unsupported Device Type", description: `Cannot turn ${targetDevice.name} on/off.`, variant: "destructive"});
        setIsProcessingCommand(false);
        setIsListening(false);
        return;
    }
     if (!targetDevice.online) {
      setFeedbackMessage(`${targetDevice.name} is offline and cannot be controlled.`);
      setFeedbackType('error');
      toast({ title: "Device Offline", description: `${targetDevice.name} is currently offline.`, variant: "destructive" });
      setIsProcessingCommand(false);
      setIsListening(false);
      return;
    }


    setFeedbackMessage(`Attempting to ${genkitResponse.action.toLowerCase()} ${targetDevice.name}...`);
    setFeedbackType('info');

    try {
      const execResult = await executeDeviceCommandOnApi(targetDevice.id, apiCommand, apiParams);
      if (execResult.success) {
        setFeedbackMessage(`Successfully ${genkitResponse.action.toLowerCase()} ${targetDevice.name}.`);
        setFeedbackType('success');
        toast({
          title: "Command Successful",
          description: `${targetDevice.name} was ${genkitResponse.action.toLowerCase()}. The dashboard will update shortly.`,
        });
        // Note: DeviceDisplay will update its state based on its own logic (polling/manual interaction).
        // For immediate UI update, DashboardPage would need to manage device state and pass update callbacks.
      } else {
        setFeedbackMessage(`Failed to ${genkitResponse.action.toLowerCase()} ${targetDevice.name}. The bridge reported an issue.`);
        setFeedbackType('error');
        toast({ title: "Command Failed", description: `Could not ${genkitResponse.action.toLowerCase()} ${targetDevice.name}.`, variant: "destructive" });
      }
    } catch (execError: any) {
      console.error(`Error executing command for ${targetDevice.id}:`, execError);
      setFeedbackMessage(`API Error: Could not ${genkitResponse.action.toLowerCase()} ${targetDevice.name}. ${execError.message}`);
      setFeedbackType('error');
      toast({ title: "API Error", description: `Error controlling ${targetDevice.name}.`, variant: "destructive" });
    } finally {
      setIsProcessingCommand(false);
      setIsListening(false);
    }
  }, [toast, selectedDevices]);

  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechApiAvailable) return;

    const handleResult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      setCommandText(transcript);
      handleInterpretAndExecuteCommand(transcript); 
    };
    const handleError = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (event.error !== 'no-speech') { // Avoid toast for no speech if user just clicks mic and stays silent
        toast({
          title: "Voice Error",
          description: `Error: ${event.error}. Try typing.`,
          variant: "destructive",
        });
      }
      setIsListening(false);
    };
    const handleEnd = () => setIsListening(false);

    currentRecognition.onresult = handleResult;
    currentRecognition.onerror = handleError;
    currentRecognition.onend = handleEnd;

    return () => {
      if (currentRecognition) {
        currentRecognition.onresult = null;
        currentRecognition.onerror = null;
        currentRecognition.onend = null;
        if (isListening) { try { currentRecognition.stop(); } catch (e) {} }
      }
    };
  }, [speechApiAvailable, isListening, handleInterpretAndExecuteCommand, toast]);

  const handleMicClick = () => {
    if (!recognitionRef.current || !speechApiAvailable) {
      toast({ title: "Voice Not Supported", description: "Please type your command.", variant: "destructive" });
      return;
    }
    const currentRecognition = recognitionRef.current;
    if (isListening) {
      try { currentRecognition.stop(); } catch (e) {}
      setIsListening(false);
    } else {
      setCommandText("");
      setInterpretedResult(null);
      setFeedbackMessage(null);
      setFeedbackType(null);
      try {
        currentRecognition.start();
        setIsListening(true);
        toast({ title: "Listening...", description: "Speak your command." });
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        toast({ title: "Mic Error", description: "Could not start voice recognition. Check permissions.", variant: "destructive" });
        setIsListening(false);
      }
    }
  };
  
  const handleSubmitTextCommand = (event: FormEvent) => {
    event.preventDefault();
    handleInterpretAndExecuteCommand(commandText);
  };
  
  const getDeviceIcon = (device?: Device) => {
    if (device && device.icon) {
      const IconComponent = device.icon;
      return <IconComponent className="h-5 w-5" />;
    }
    if (!device || !device.type) return <Lightbulb className="h-5 w-5" />; // Default if no device type
    
    const typeLower = device.type.toLowerCase();
    if (typeLower.includes("light")) return <Lightbulb className="h-5 w-5" />;
    if (typeLower.includes("thermostat") || typeLower.includes("temp") || typeLower.includes("sensor")) return <Thermometer className="h-5 w-5" />; // Group sensors with thermo for now
    if (typeLower.includes("tv")) return <Tv2 className="h-5 w-5" />;
    if (typeLower.includes("lock")) return <Lock className="h-5 w-5" />;
    if (typeLower.includes("fan")) return <Lock className="h-5 w-5" />; // Fan icon
    if (typeLower.includes("switch") || typeLower.includes("outlet")) return <Lock className="h-5 w-5" />; // Power/Outlet icon
    return <Lightbulb className="h-5 w-5" />;
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
              disabled={!speechApiAvailable || isProcessingCommand}
            >
              <Mic className={`h-8 w-8 ${isListening ? 'text-destructive-foreground' : 'text-primary'}`} />
            </Button>
            <form onSubmit={handleSubmitTextCommand} className="flex-grow flex items-center space-x-2">
              <Input
                type="text"
                placeholder={isListening ? "Listening..." : speechApiAvailable ? "Or type, e.g., 'Turn on living room light'" : "Type command (voice not available)"}
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                disabled={isProcessingCommand || isListening}
                className="flex-grow text-lg p-3 bg-input/50 border-border focus:ring-accent"
              />
              <Button type="submit" size="lg" disabled={isProcessingCommand || isListening || !commandText.trim()} className="bg-primary hover:bg-primary/80">
                {isProcessingCommand && !isListening ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              </Button>
            </form>
          </div>

          {isProcessingCommand && !isListening && !feedbackMessage && ( // Show generic processing only if no specific feedback
            <div className="flex justify-center items-center p-4">
              <Loader2 className="h-12 w-12 animate-spin text-accent" />
              <p className="ml-3 text-lg text-muted-foreground">Processing command...</p>
            </div>
          )}
          
          {interpretedResult && interpretedResult.targetDevice && (
            <Card className="mt-6 bg-card/80 border-border shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  {getDeviceIcon(interpretedResult.targetDevice)}
                  <span className="ml-2">Command for: {interpretedResult.targetDevice.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-base">
                <p><strong className="text-foreground">Interpreted Action:</strong> <span className="text-accent">{interpretedResult.action}</span></p>
                {interpretedResult.rawValue && (
                  <p><strong className="text-foreground">Value:</strong> <span className="text-accent">{interpretedResult.rawValue}</span></p>
                )}
              </CardContent>
            </Card>
          )}

          {feedbackMessage && feedbackType && (
             <Alert 
                variant={feedbackType === 'error' ? 'destructive' : (feedbackType === 'info' ? 'default' : 'default')} 
                className={`mt-6 ${feedbackType === 'success' ? 'border-green-500' : (feedbackType === 'error' ? 'border-red-500' : 'border-blue-500')}`}
             >
              {feedbackType === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
               (feedbackType === 'error' ? <XCircle className="h-5 w-5 text-red-500" /> : 
               <AlertTriangle className="h-5 w-5 text-blue-500" />) // Using AlertTriangle for info
              }
              <AlertTitle className={`ml-2 ${feedbackType === 'success' ? 'text-green-400' : (feedbackType === 'error' ? 'text-red-400' : 'text-blue-400')}`}>
                {feedbackType === 'success' ? 'Success' : (feedbackType === 'error' ? 'Error' : 'Information')}
              </AlertTitle>
              <AlertDescription className="ml-2">{feedbackMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="text-center">
          <p className="text-xs text-muted-foreground">
            Voice commands will attempt to control devices on your dashboard. Dashboard display updates separately.
          </p>
        </CardFooter>
      </Card>

      <div className="w-full max-w-2xl p-4 bg-card/50 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2 text-center text-foreground">Example Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>"Turn on the kitchen lights"</li>
          <li>"Turn off the fan"</li>
          <li>"Activate the main light"</li>
        </ul>
      </div>
    </div>
  );
}
