
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
import { Mic, MicOff, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send, AlertTriangle, Wind, Power } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MockSpeechRecognition {
  start: () => void;
  stop: () => void;
  onresult?: (event: { results: { transcript: string; isFinal: boolean }[][] }) => void;
  onerror?: (event: { error: string; message: string }) => void;
  onend?: () => void;
  onstart?: () => void;
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
}

declare global {
  interface Window {
    SpeechRecognition: typeof MockSpeechRecognition | undefined;
    webkitSpeechRecognition: typeof MockSpeechRecognition | undefined;
  }
}

interface VoiceControlProps {
  selectedDevices: Device[];
}

const WAKE_WORD = "jarvis";

export function VoiceControl({ selectedDevices }: VoiceControlProps) {
  const [commandText, setCommandText] = useState("");
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [interpretedResult, setInterpretedResult] = useState<InterpretVoiceCommandOutput & { targetDevice?: Device } | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info' | null>(null);
  
  const [speechApiAvailable, setSpeechApiAvailable] = useState(false);
  const [userDesiredListening, setUserDesiredListening] = useState(false);
  const [micActuallyActive, setMicActuallyActive] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  const { toast } = useToast();
  const recognitionRef = useRef<MockSpeechRecognition | null>(null);
  const isProcessingCommandRef = useRef(isProcessingCommand);

  useEffect(() => {
    isProcessingCommandRef.current = isProcessingCommand;
  }, [isProcessingCommand]);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!recognitionRef.current) {
        recognitionRef.current = new SpeechRecognitionAPI();
        recognitionRef.current.continuous = false; // Set to false, onend will handle restart for "continuous" feel
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.interimResults = false;
        recognitionRef.current.maxAlternatives = 1;
      }
      setSpeechApiAvailable(true);
      if (!micPermissionError) {
         setUserDesiredListening(true);
      }
    } else {
      console.warn("SpeechRecognition API not supported in this browser.");
      setSpeechApiAvailable(false);
      setMicPermissionError("Voice recognition is not supported by your browser.");
    }

    return () => {
      if (recognitionRef.current && micActuallyActive) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // console.warn("Error stopping recognition on unmount:", e);
        }
      }
      setUserDesiredListening(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const handleInterpretAndExecuteCommand = useCallback(async (fullTranscript: string) => {
    if (isProcessingCommandRef.current) {
      return;
    }
    if (!fullTranscript.trim()) {
      return;
    }

    setIsProcessingCommand(true);
    setInterpretedResult(null);
    setFeedbackMessage("Processing...");
    setFeedbackType('info');

    const lowerCaseTranscript = fullTranscript.toLowerCase();
    let commandToInterpret = "";

    if (lowerCaseTranscript.startsWith(WAKE_WORD.toLowerCase())) {
      commandToInterpret = fullTranscript.substring(WAKE_WORD.length).trim();
       if (lowerCaseTranscript === WAKE_WORD.toLowerCase()) {
         setFeedbackMessage(`Yes? Please state your command after "${WAKE_WORD}".`);
         setFeedbackType('info');
         setIsProcessingCommand(false);
         setCommandText(""); // Clear input if only wake word
         return;
       }
    } else {
      setIsProcessingCommand(false);
      setCommandText(fullTranscript); // Show what was heard, even if no wake word for manual input
      // Optionally provide feedback that wake word was missed for voice input
      // setFeedbackMessage(`Please start with "${WAKE_WORD}". You said: "${fullTranscript}"`);
      // setFeedbackType('info');
      return;
    }
    
    setCommandText(commandToInterpret); 
    setFeedbackMessage(`Interpreting: "${commandToInterpret}"`);

    let genkitResponse: InterpretVoiceCommandOutput;
    try {
      const input: InterpretVoiceCommandInput = { voiceCommand: commandToInterpret };
      genkitResponse = await interpretVoiceCommand(input);
      setInterpretedResult({ ...genkitResponse });
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
      return;
    }

    if (selectedDevices.length === 0) {
      setFeedbackMessage("No devices selected on your dashboard to control.");
      setFeedbackType('info');
      toast({ title: "No Devices", description: "Please select devices on your dashboard first." });
      setIsProcessingCommand(false);
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
      return;
    }

    if (targetDevice.type !== 'light' && targetDevice.type !== 'switch' && targetDevice.type !== 'fan' && targetDevice.type !== 'outlet') {
        setFeedbackMessage(`Device type "${targetDevice.type}" does not support On/Off commands through voice control currently.`);
        setFeedbackType('info');
        toast({ title: "Unsupported Device Type", description: `Cannot turn ${targetDevice.name} on/off.`, variant: "destructive"});
        setIsProcessingCommand(false);
        return;
    }
     if (!targetDevice.online) {
      setFeedbackMessage(`${targetDevice.name} is offline and cannot be controlled.`);
      setFeedbackType('error');
      toast({ title: "Device Offline", description: `${targetDevice.name} is currently offline.`, variant: "destructive" });
      setIsProcessingCommand(false);
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, selectedDevices]); 

  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechApiAvailable) return;

    currentRecognition.onresult = (event: any) => {
      if (isProcessingCommandRef.current) {
         console.log("Still processing previous command, new speech result ignored.");
         return;
      }
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      // No setCommandText(transcript) here; handleInterpretAndExecuteCommand will set it after processing wake word.
      handleInterpretAndExecuteCommand(transcript); 
    };

    currentRecognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error, event.message);
      setMicActuallyActive(false);
      let showToast = true;
      let newMicPermissionError = micPermissionError;

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        newMicPermissionError = "Microphone access denied. Please enable it in your browser settings. You may need to refresh after enabling.";
        setUserDesiredListening(false); 
      } else if (event.error === 'no-speech') {
        showToast = false; 
      } else if (event.error === 'aborted') {
        showToast = false;
      } else if (event.error === 'audio-capture') {
         newMicPermissionError = "Audio capture failed. Check microphone hardware/permissions.";
      } else {
        newMicPermissionError = `Voice error: ${event.error}. Try typing.`;
      }
      
      setMicPermissionError(newMicPermissionError);

      if (showToast && newMicPermissionError && (micPermissionError !== newMicPermissionError)) { 
        toast({ title: "Voice Error", description: newMicPermissionError || event.message || event.error, variant: "destructive" });
      }
    };

    currentRecognition.onstart = () => {
      setMicActuallyActive(true);
      setMicPermissionError(null); 
    };

    currentRecognition.onend = () => {
      setMicActuallyActive(false);
      if (userDesiredListening && speechApiAvailable && !micPermissionError && !isProcessingCommandRef.current) { 
        try {
          setTimeout(() => {
            if (userDesiredListening && recognitionRef.current && !micActuallyActive && !isProcessingCommandRef.current) {
               recognitionRef.current.start();
            }
          }, 250); 
        } catch (e: any) {
          console.error("Error restarting recognition in onend:", e.name, e.message);
          if (e.name !== 'InvalidStateError') { 
            setMicPermissionError("Failed to restart voice recognition. Please try toggling the mic button.");
            setUserDesiredListening(false); 
          }
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechApiAvailable, userDesiredListening, handleInterpretAndExecuteCommand, toast, micPermissionError]); 

  useEffect(() => {
    if (!speechApiAvailable || !recognitionRef.current || isProcessingCommandRef.current) return;

    if (userDesiredListening && !micActuallyActive && !micPermissionError) {
      try {
        recognitionRef.current.start();
      } catch (e: any) {
        console.error("Error starting recognition:", e.name, e.message);
        if (e.name !== 'InvalidStateError') {
           setMicPermissionError("Could not start microphone. Check permissions or if another app is using it.");
           setUserDesiredListening(false); 
        }
      }
    } else if (!userDesiredListening && micActuallyActive) {
      try {
        recognitionRef.current.stop();
      } catch (e:any) {
        console.error("Error stopping recognition:", e.name, e.message);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDesiredListening, micActuallyActive, speechApiAvailable, micPermissionError]);


  const handleMicButtonClick = () => {
    if (!speechApiAvailable) {
      toast({ title: "Voice Not Supported", description: "Your browser doesn't support voice input.", variant: "destructive" });
      return;
    }
    if (micPermissionError && !micActuallyActive) { 
        setMicPermissionError(null); 
    }
    setUserDesiredListening(prev => !prev);
  };
  
  const handleSubmitTextCommand = (event: FormEvent) => {
    event.preventDefault();
    if (isProcessingCommandRef.current || !commandText.trim()) return;
    handleInterpretAndExecuteCommand(`${WAKE_WORD} ${commandText}`);
  };
  
  const getDeviceIcon = (device?: Device) => {
    if (device && device.icon) {
      const IconComponent = device.icon;
      return <IconComponent className="h-5 w-5" />;
    }
    if (!device || !device.type) return <Lightbulb className="h-5 w-5" />;
    
    const typeLower = device.type.toLowerCase();
    if (typeLower.includes("light")) return <Lightbulb className="h-5 w-5" />;
    if (typeLower.includes("thermostat") || typeLower.includes("temp") || typeLower.includes("sensor")) return <Thermometer className="h-5 w-5" />;
    if (typeLower.includes("tv")) return <Tv2 className="h-5 w-5" />;
    if (typeLower.includes("lock")) return <Lock className="h-5 w-5" />;
    if (typeLower.includes("fan")) return <Wind className="h-5 w-5" />;
    if (typeLower.includes("switch") || typeLower.includes("outlet")) return <Power className="h-5 w-5" />;
    return <Lightbulb className="h-5 w-5" />;
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-8">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">HomePilot Control</CardTitle>
          <CardDescription>
            {speechApiAvailable ? 
                (micPermissionError ? `Mic Error: ${micPermissionError}` : 
                    (userDesiredListening ? `Listening... Say "${WAKE_WORD}" then your command.` : "Voice control is idle. Click mic to start.")
                ) 
                : "Voice control not available in your browser."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-2">
            <Button 
              onClick={handleMicButtonClick} 
              variant={userDesiredListening && micActuallyActive ? "destructive" : "outline"} 
              size="lg"
              className={`p-4 rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 ${userDesiredListening && micActuallyActive ? 'animate-pulse bg-accent/30 border-accent' : 'border-primary/50'}`}
              aria-label={userDesiredListening ? "Stop listening" : "Start listening"}
              disabled={!speechApiAvailable || isProcessingCommand}
              title={!speechApiAvailable ? "Voice recognition not available" : (userDesiredListening ? "Stop automatic listening" : "Start automatic listening")}
            >
              {userDesiredListening && micActuallyActive ? <MicOff className={`h-8 w-8 text-destructive-foreground`} /> : <Mic className={`h-8 w-8 ${micPermissionError ? 'text-destructive' : 'text-primary'}`} />}
            </Button>
            <form onSubmit={handleSubmitTextCommand} className="flex-grow flex items-center space-x-2">
              <Input
                type="text"
                placeholder={micActuallyActive ? `Say "${WAKE_WORD}" or type command` : (speechApiAvailable ? `Type command, e.g., 'Turn on light'` : "Type command (voice not available)")}
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                disabled={isProcessingCommand}
                className="flex-grow text-lg p-3 bg-input/50 border-border focus:ring-accent"
              />
              <Button type="submit" size="lg" disabled={isProcessingCommand || !commandText.trim()} className="bg-primary hover:bg-primary/80">
                {isProcessingCommand ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              </Button>
            </form>
          </div>

          {isProcessingCommand && !feedbackMessage && (
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
                className={`mt-6 ${feedbackType === 'success' ? 'border-green-500 bg-green-900/30' : (feedbackType === 'error' ? 'border-red-500 bg-red-900/30' : 'border-blue-500 bg-blue-900/30')}`}
             >
              {feedbackType === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : 
               (feedbackType === 'error' ? <XCircle className="h-5 w-5 text-red-400" /> : 
               <AlertTriangle className="h-5 w-5 text-blue-400" />)
              }
              <AlertTitle className={`ml-2 ${feedbackType === 'success' ? 'text-green-300' : (feedbackType === 'error' ? 'text-red-300' : 'text-blue-300')}`}>
                {feedbackType === 'success' ? 'Success' : (feedbackType === 'error' ? 'Error' : 'Information')}
              </AlertTitle>
              <AlertDescription className="ml-2 text-sm">{feedbackMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="text-center">
          <p className="text-xs text-muted-foreground">
            {userDesiredListening ? `Listening for "${WAKE_WORD}"... ` : "Automatic listening is off. "}
            Dashboard display updates separately.
          </p>
        </CardFooter>
      </Card>

      <div className="w-full max-w-2xl p-4 bg-card/50 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2 text-center text-foreground">Example Voice Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>"{WAKE_WORD} turn on the kitchen lights"</li>
          <li>"{WAKE_WORD} turn off the fan"</li>
          <li>"{WAKE_WORD} activate the main light"</li>
        </ul>
         <h3 className="text-lg font-semibold mt-4 mb-2 text-center text-foreground">Example Typed Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>"Turn on the kitchen lights" (type this, "{WAKE_WORD}" will be prepended automatically)</li>
          <li>"Turn off the fan"</li>
        </ul>
      </div>
    </div>
  );
}
