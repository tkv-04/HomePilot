
// src/components/dashboard/VoiceControl.tsx
"use client";

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import type { InterpretVoiceCommandOutput, InterpretVoiceCommandInput } from '@/ai/flows/interpret-voice-command';
import { interpretVoiceCommand } from '@/ai/flows/interpret-voice-command';
import { executeDeviceCommandsOnApi, type DeviceCommand } from '@/services/homeAssistantService';
import type { Device } from '@/types/home-assistant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mic, MicOff, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send, Info, Droplets, HelpCircle, Wind, Power, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MockSpeechRecognition {
  start: () => void;
  stop: () => void;
  onresult?: (event: { results: { transcript: string; isFinal: boolean }[][] , resultIndex: number }) => void;
  onerror?: (event: { error: string; message: string }) => void;
  onend?: () => void;
  onstart?: () => void;
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  abort: () => void;
  onaudiostart?: () => void;
  onaudioend?: () => void;
  onsoundstart?: () => void;
  onsoundend?: () => void;
  onspeechstart?: () => void;
  onspeechend?: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => MockSpeechRecognition | undefined;
    webkitSpeechRecognition: new () => MockSpeechRecognition | undefined;
    speechSynthesis: SpeechSynthesis;
  }
}

interface VoiceControlProps {
  selectedDevices: Device[];
  onRefreshDeviceStates?: (deviceIds: string[]) => Promise<void>;
}

const WAKE_WORD = "jarvis";
const COMMAND_WAIT_TIMEOUT = 4000; // 4 seconds

export function VoiceControl({ selectedDevices, onRefreshDeviceStates }: VoiceControlProps) {
  const [commandText, setCommandText] = useState("");
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [processedCommandDetails, setProcessedCommandDetails] = useState<any>(null); // For displaying multi-action details
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info' | 'speaking' | null>(null);

  const [speechRecognitionApiAvailable, setSpeechRecognitionApiAvailable] = useState(false);
  const [speechSynthesisApiAvailable, setSpeechSynthesisApiAvailable] = useState(false);
  const [userDesiredListening, setUserDesiredListening] = useState(false);
  const [micActuallyActive, setMicActuallyActive] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [isWaitingForCommandAfterWakeWord, setIsWaitingForCommandAfterWakeWord] = useState(false);

  const { toast } = useToast();
  const recognitionRef = useRef<MockSpeechRecognition | null>(null);
  const waitForCommandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isProcessingCommandRef = useRef(isProcessingCommand);
  const isWaitingForCommandAfterWakeWordRef = useRef(isWaitingForCommandAfterWakeWord);

  useEffect(() => {
    isProcessingCommandRef.current = isProcessingCommand;
  }, [isProcessingCommand]);

  useEffect(() => {
    isWaitingForCommandAfterWakeWordRef.current = isWaitingForCommandAfterWakeWord;
  }, [isWaitingForCommandAfterWakeWord]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setSpeechSynthesisApiAvailable(true);
    } else {
      console.warn("SpeechSynthesis API not supported in this browser.");
      setSpeechSynthesisApiAvailable(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!speechSynthesisApiAvailable || typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn("Speech synthesis is not available or not supported.");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.onstart = () => {
        setFeedbackMessage(`Speaking: "${text}"`);
        setFeedbackType('speaking');
      };
      utterance.onerror = (event) => {
        console.error("SpeechSynthesis Error:", event.error);
        toast({ title: "Voice Output Error", description: `Could not speak: ${event.error}`, variant: "destructive" });
        setFeedbackMessage(`Error speaking: ${event.error}`);
        setFeedbackType('error');
      };
      window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.error("Error initiating speech synthesis:", error);
        toast({ title: "Voice Output Error", description: "Failed to initiate speech.", variant: "destructive" });
    }
  }, [speechSynthesisApiAvailable, toast]);

  const handleInterpretAndExecuteCommand = useCallback(async (fullTranscript: string) => {
    if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) return;

    if (waitForCommandTimeoutRef.current) {
      clearTimeout(waitForCommandTimeoutRef.current);
      waitForCommandTimeoutRef.current = null;
    }

    const lowerCaseTranscript = fullTranscript.toLowerCase();
    let commandToInterpret = "";

    if (isWaitingForCommandAfterWakeWordRef.current) {
      setIsWaitingForCommandAfterWakeWord(false);
      if (!fullTranscript.trim()) {
        const msg = `No command given after "${WAKE_WORD}". Try again.`;
        setFeedbackMessage(msg); setFeedbackType('info');
        setCommandText(""); setIsProcessingCommand(false); return;
      }
      commandToInterpret = fullTranscript.trim();
      setCommandText(commandToInterpret);
    } else if (lowerCaseTranscript.startsWith(WAKE_WORD.toLowerCase())) {
      const commandPartAfterWakeWord = fullTranscript.substring(WAKE_WORD.length).trim();
      if (!commandPartAfterWakeWord) {
        const msg = `"${WAKE_WORD}" detected. Waiting for your command...`;
        setFeedbackMessage(msg); setFeedbackType('info');
        setCommandText("");
        setIsWaitingForCommandAfterWakeWord(true);
        setIsProcessingCommand(false);
        waitForCommandTimeoutRef.current = setTimeout(() => {
          if (isWaitingForCommandAfterWakeWordRef.current) {
            const timeoutMsg = `Timed out waiting for command after "${WAKE_WORD}". Please try again.`;
            setFeedbackMessage(timeoutMsg); setFeedbackType('info');
            setIsWaitingForCommandAfterWakeWord(false);
            setCommandText("");
          }
        }, COMMAND_WAIT_TIMEOUT);
        return;
      }
      commandToInterpret = commandPartAfterWakeWord;
      setCommandText(commandToInterpret);
    } else {
      const msg = `Please start your command with "${WAKE_WORD}". You said: "${fullTranscript}"`;
      setFeedbackMessage(msg); setFeedbackType('info');
      setCommandText(fullTranscript);
      setIsProcessingCommand(false); return;
    }

    if (!commandToInterpret.trim()) {
        const msg = "No command to process. Please try again.";
        setFeedbackMessage(msg); setFeedbackType('info');
        setCommandText("");
        setIsProcessingCommand(false); return;
    }

    setIsProcessingCommand(true);
    setProcessedCommandDetails(null);
    setFeedbackMessage(`Interpreting: "${commandToInterpret}"`); setFeedbackType('info');

    let genkitResponse: InterpretVoiceCommandOutput;
    try {
      genkitResponse = await interpretVoiceCommand({ voiceCommand: commandToInterpret });
      setProcessedCommandDetails(genkitResponse); // Store for display
    } catch (error) {
      const msg = "Error: Could not interpret your command.";
      setFeedbackMessage(msg); setFeedbackType('error');
      toast({ title: "Interpretation Error", description: `Failed to process. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
      setIsProcessingCommand(false); return;
    }

    if (genkitResponse.intentType === 'query') {
      const queryTargetName = genkitResponse.queryTarget;
      const queryType = genkitResponse.queryType;

      if (!queryTargetName || !queryType) {
        setFeedbackMessage("Sorry, I couldn't understand what you're asking about."); setFeedbackType('error');
        setIsProcessingCommand(false); return;
      }
      setFeedbackMessage(`Looking up: ${queryType} for ${queryTargetName}...`); setFeedbackType('info');

      const targetDevice = selectedDevices.find(
        d => d.name.toLowerCase().includes(queryTargetName.toLowerCase()) ||
             queryTargetName.toLowerCase().includes(d.name.toLowerCase()) ||
             d.id.toLowerCase() === queryTargetName.toLowerCase()
      );
      
      if (!targetDevice) {
        const msg = `Device "${queryTargetName}" not found on your dashboard for query.`;
        setFeedbackMessage(msg); setFeedbackType('error');
        speak(`I couldn't find ${queryTargetName} on your dashboard.`);
        setIsProcessingCommand(false); return;
      }
      
      setProcessedCommandDetails({ intentType: 'query', queryTarget: targetDevice.name, queryType });


      if (onRefreshDeviceStates) {
        try {
          await onRefreshDeviceStates([targetDevice.id]);
        } catch (refreshError) {
          console.error("Error refreshing device state for query:", refreshError);
        }
      }
      
      setTimeout(() => {
        const potentiallyUpdatedTargetDevice = selectedDevices.find(d => d.id === targetDevice.id) || targetDevice;
        let spokenResponse = "";

        if (potentiallyUpdatedTargetDevice) {
            const actionLower = queryType.toLowerCase();
            if (potentiallyUpdatedTargetDevice.type === 'sensor') {
                const unit = potentiallyUpdatedTargetDevice.attributes?.unit_of_measurement || '';
                const state = (potentiallyUpdatedTargetDevice.state === 'unknown' || potentiallyUpdatedTargetDevice.state === null || potentiallyUpdatedTargetDevice.state === undefined)
                               ? 'unavailable'
                               : String(potentiallyUpdatedTargetDevice.state);
                const sensorName = potentiallyUpdatedTargetDevice.name;

                if (actionLower.includes("get temperature") || actionLower.includes("what is the temperature")) {
                    spokenResponse = `${sensorName} is currently ${state}${unit}.`;
                } else if (actionLower.includes("get humidity") || actionLower.includes("what is the humidity")) {
                    spokenResponse = `${sensorName} is currently ${state}${unit}.`;
                } else if (actionLower.includes("get status") || actionLower.includes("is") || actionLower.includes("what is")) {
                    spokenResponse = `The ${sensorName} reading is ${state}${unit}.`;
                } else {
                    spokenResponse = `The ${sensorName} is ${state}${unit}.`;
                }
            } else { 
                if (actionLower.includes("get status") || actionLower.includes("is") || actionLower.includes("what is")) {
                   spokenResponse = `The ${potentiallyUpdatedTargetDevice.name} is currently ${potentiallyUpdatedTargetDevice.state}.`;
                } else {
                   spokenResponse = `The status of ${potentiallyUpdatedTargetDevice.name} is ${potentiallyUpdatedTargetDevice.state}.`;
                }
            }
        } else {
            spokenResponse = `I couldn't find information for ${queryTargetName} on your dashboard.`;
        }

        setFeedbackMessage(spokenResponse); setFeedbackType('success');
        speak(spokenResponse);
        setIsProcessingCommand(false);
      }, targetDevice ? 500 : 0);
      return;
    }


    if (genkitResponse.intentType === 'action' && genkitResponse.actions && genkitResponse.actions.length > 0) {
        if (selectedDevices.length === 0) {
          const msg = "No devices selected on your dashboard to control.";
          setFeedbackMessage(msg); setFeedbackType('info');
          toast({ title: "No Devices", description: "Please select devices on your dashboard first." });
          setIsProcessingCommand(false); return;
        }

        setFeedbackMessage(`Preparing to execute ${genkitResponse.actions.length} action(s)...`); setFeedbackType('info');
        
        const commandsToExecute: DeviceCommand[] = [];
        let allDevicesFoundAndOnline = true;
        let actionSummary = "";

        for (const actionDetail of genkitResponse.actions) {
          const targetDeviceNameLower = actionDetail.device.toLowerCase();
          const targetDevice = selectedDevices.find(
            d => d.name.toLowerCase().includes(targetDeviceNameLower) ||
                 targetDeviceNameLower.includes(d.name.toLowerCase()) ||
                 d.id.toLowerCase() === targetDeviceNameLower
          );

          if (!targetDevice) {
            allDevicesFoundAndOnline = false;
            toast({ title: "Device Not Found", description: `Could not find "${actionDetail.device}".`, variant: "destructive"});
            actionSummary += `Device "${actionDetail.device}" not found. `;
            continue; 
          }
          if (!targetDevice.online) {
            allDevicesFoundAndOnline = false;
            toast({ title: "Device Offline", description: `${targetDevice.name} is offline.`, variant: "destructive" });
            actionSummary += `${targetDevice.name} is offline. `;
            continue;
          }
           if (!['light', 'switch', 'fan', 'outlet'].includes(targetDevice.type)) {
            allDevicesFoundAndOnline = false;
            toast({ title: "Unsupported Device Type", description: `Cannot control ${targetDevice.name} (${targetDevice.type}) with On/Off.`, variant: "destructive"});
            actionSummary += `Cannot control ${targetDevice.name} (${targetDevice.type}). `;
            continue;
          }

          const actionCmdLower = actionDetail.action.toLowerCase();
          let apiCommand = '', apiParams: Record<string, any> = {};

          if (actionCmdLower.includes("turn on") || actionCmdLower.includes("activate")) {
            apiCommand = 'action.devices.commands.OnOff'; apiParams = { on: true };
          } else if (actionCmdLower.includes("turn off") || actionCmdLower.includes("deactivate")) {
            apiCommand = 'action.devices.commands.OnOff'; apiParams = { on: false };
          } else {
            allDevicesFoundAndOnline = false; // Treat unsupported action as an issue for this device
            toast({ title: "Unsupported Action", description: `Action "${actionDetail.action}" on ${targetDevice.name} is not supported.`, variant: "destructive"});
            actionSummary += `Action "${actionDetail.action}" on ${targetDevice.name} not supported. `;
            continue;
          }
          commandsToExecute.push({ deviceId: targetDevice.id, command: apiCommand, params: apiParams });
          actionSummary += `${actionDetail.action} ${targetDevice.name}. `;
        }
        
        setProcessedCommandDetails({ intentType: 'action', actions: genkitResponse.actions, summary: actionSummary.trim() });


        if (commandsToExecute.length === 0) {
          setFeedbackMessage(actionSummary || "No valid actions to execute.");
          setFeedbackType(allDevicesFoundAndOnline ? 'info' : 'error');
          setIsProcessingCommand(false);
          return;
        }
        
        setFeedbackMessage(`Sending ${commandsToExecute.length} command(s)...`); setFeedbackType('info');

        try {
          const execResults = await executeDeviceCommandsOnApi(commandsToExecute);
          let successCount = 0;
          let failCount = 0;
          let resultSummary = "";
          const deviceIdsToRefresh: string[] = [];

          execResults.commands.forEach(result => {
            const deviceId = result.ids[0];
            const device = selectedDevices.find(d => d.id === deviceId);
            const deviceName = device ? device.name : deviceId;
            if (result.status === 'SUCCESS') {
              successCount++;
              resultSummary += `${deviceName} command succeeded. `;
              deviceIdsToRefresh.push(deviceId);
            } else {
              failCount++;
              resultSummary += `${deviceName} command failed (${result.errorCode || 'unknown'}). `;
            }
          });

          if (successCount > 0) {
            toast({ title: "Commands Sent", description: `${successCount} action(s) successful, ${failCount} failed.`});
          } else {
            toast({ title: "Commands Failed", description: `All ${failCount} action(s) failed.`, variant: "destructive"});
          }
          setFeedbackMessage(resultSummary.trim());
          setFeedbackType(failCount === 0 ? 'success' : 'error');
          
          if (deviceIdsToRefresh.length > 0 && onRefreshDeviceStates) {
            setTimeout(() => onRefreshDeviceStates(deviceIdsToRefresh), 1000); // Refresh after a short delay
          }

        } catch (execError: any) {
          const msg = `API Error executing commands: ${execError.message}`;
          setFeedbackMessage(msg); setFeedbackType('error');
          toast({ title: "API Error", description: `Error: ${execError.message}.`, variant: "destructive" });
        } finally {
          setIsProcessingCommand(false);
        }
    } else {
        setFeedbackMessage(`Unknown intent or no actions found in command.`); setFeedbackType('error');
        setIsProcessingCommand(false);
    }
  }, [toast, selectedDevices, speak, onRefreshDeviceStates, COMMAND_WAIT_TIMEOUT]);


  useEffect(() => {
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        try {
          recognitionRef.current = new SpeechRecognitionAPI();
          recognitionRef.current.continuous = false; 
          recognitionRef.current.lang = 'en-US';
          recognitionRef.current.interimResults = false; 
          recognitionRef.current.maxAlternatives = 1;
          setSpeechRecognitionApiAvailable(true);
          setUserDesiredListening(true); 
        } catch (e: any) {
            console.error("Error initializing SpeechRecognition:", e.name, e.message);
            setSpeechRecognitionApiAvailable(false);
            if (e.name === 'SecurityError' || e.name === 'NotAllowedError'){
                 setMicPermissionError("Mic permission likely denied or required for HTTPS. Check settings.");
            } else {
                setMicPermissionError("Could not initialize voice recognition. Your browser might not fully support it or there's an issue.");
            }
        }
      }
    } else {
      console.warn("SpeechRecognition API not supported in this browser.");
      setSpeechRecognitionApiAvailable(false);
      setMicPermissionError("Voice recognition is not supported by your browser.");
    }
    return () => { 
      if (recognitionRef.current && micActuallyActive) {
        try { recognitionRef.current.stop(); recognitionRef.current.abort(); } catch (e) {}
      }
      if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);


  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) {
      return;
    }

    if (isProcessingCommand && !isWaitingForCommandAfterWakeWord) {
      if (micActuallyActive) {
        try { currentRecognition.stop(); } catch (e) {}
      }
      return; 
    }

    if (userDesiredListening && !micActuallyActive && !micPermissionError) {
      try {
        currentRecognition.start();
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') { 
          console.error("Error starting recognition in main effect:", e);
          setMicPermissionError("Could not start microphone. Try refreshing or check permissions.");
          setUserDesiredListening(false); 
        }
      }
    } else if (!userDesiredListening && micActuallyActive) { 
      try {
        currentRecognition.stop();
        if (isWaitingForCommandAfterWakeWord) { 
            setIsWaitingForCommandAfterWakeWord(false);
            if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        }
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') {}
      }
    }
  }, [
    userDesiredListening,
    isProcessingCommand,
    isWaitingForCommandAfterWakeWord,
    micActuallyActive,
    speechRecognitionApiAvailable,
    micPermissionError,
  ]);

  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;

    currentRecognition.onresult = (event: any) => {
      if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) {
        return;
      }
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      handleInterpretAndExecuteCommand(transcript);
    };

    currentRecognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error, event.message);
      setMicActuallyActive(false); 
      let newMicPermissionError = micPermissionError; 

      if (isWaitingForCommandAfterWakeWordRef.current) {
        setIsWaitingForCommandAfterWakeWord(false);
        if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        newMicPermissionError = "Microphone access denied. Please enable it in your browser settings.";
        setUserDesiredListening(false); 
      } else if (event.error === 'audio-capture') {
        newMicPermissionError = "Audio capture failed. Please check your microphone.";
        setUserDesiredListening(false); 
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        if (!newMicPermissionError || (newMicPermissionError && !['Microphone access denied', 'Audio capture failed'].some(e => newMicPermissionError.includes(e)))) {
            newMicPermissionError = `Voice recognition error: ${event.error}. Try refreshing.`;
        }
      }
      setMicPermissionError(newMicPermissionError);

      if (newMicPermissionError && (micPermissionError !== newMicPermissionError || event.error === 'network') && (event.error !== 'no-speech' && event.error !== 'aborted') ) {
        toast({ title: "Voice Error", description: newMicPermissionError || event.message || event.error, variant: "destructive" });
      }
    };

    currentRecognition.onstart = () => {
      setMicActuallyActive(true);
      setMicPermissionError(null); 
    };

    currentRecognition.onend = () => {
      setMicActuallyActive(false);
    };
  }, [speechRecognitionApiAvailable, handleInterpretAndExecuteCommand, toast, micPermissionError]);

  const handleMicButtonClick = () => {
    if (!speechRecognitionApiAvailable) {
      toast({ title: "Voice Not Supported", description:"Your browser doesn't support speech recognition.", variant: "destructive" });
      return;
    }
    if (micPermissionError && !micActuallyActive) {
        setMicPermissionError(null);
    }
    if (isWaitingForCommandAfterWakeWord) {
        setIsWaitingForCommandAfterWakeWord(false);
        if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        const msg = "Command cancelled.";
        setFeedbackMessage(msg); setFeedbackType("info");
    }
    setUserDesiredListening(prev => !prev);
  };

  const handleSubmitTextCommand = (event: FormEvent) => {
    event.preventDefault();
    if (isProcessingCommand || !commandText.trim()) return;
    if (isWaitingForCommandAfterWakeWord) { 
        setIsWaitingForCommandAfterWakeWord(false);
        if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
    }
    handleInterpretAndExecuteCommand(`${WAKE_WORD} ${commandText}`);
  };

  const getDeviceIcon = (device?: Device) => {
    if (device?.icon) return <device.icon className="h-5 w-5" />;
    if (!device?.type) return <HelpCircle className="h-5 w-5" />;
    const typeLower = device.type.toLowerCase();
    if (typeLower.includes("light")) return <Lightbulb className="h-5 w-5" />;
    if (typeLower.includes("thermostat") || (typeLower.includes("temp") && typeLower.includes("sensor"))) return <Thermometer className="h-5 w-5" />;
    if (typeLower.includes("humidity") && typeLower.includes("sensor")) return <Droplets className="h-5 w-5" />;
    if (typeLower.includes("tv")) return <Tv2 className="h-5 w-5" />;
    if (typeLower.includes("lock")) return <Lock className="h-5 w-5" />;
    if (typeLower.includes("fan")) return <Wind className="h-5 w-5" />;
    if (typeLower.includes("switch") || typeLower.includes("outlet")) return <Power className="h-5 w-5" />;
    if (typeLower.includes("sensor")) return <Info className="h-5 w-5" />; 
    return <HelpCircle className="h-5 w-5" />;
  };

  const currentUiFeedback =
    isWaitingForCommandAfterWakeWord ? `"${WAKE_WORD}" detected. Waiting for command...`
    : micPermissionError ? `Mic Error: ${micPermissionError}`
    : !speechRecognitionApiAvailable ? "Voice recognition not available in this browser."
    : userDesiredListening ? (micActuallyActive ? `Listening... Say "${WAKE_WORD}" then your command.` : "Microphone starting...")
    : "Voice control idle. Click mic to start or type command.";

  const feedbackIcon = () => {
    switch(feedbackType) {
      case 'success': return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-400" />;
      case 'info': return <Info className="h-5 w-5 text-blue-400" />;
      case 'speaking': return <Volume2 className="h-5 w-5 text-purple-400" />;
      default: return <Info className="h-5 w-5 text-blue-400" />;
    }
  };
  const feedbackTitle = () => {
     switch(feedbackType) {
      case 'success': return 'Success';
      case 'error': return 'Error';
      case 'info': return 'Information';
      case 'speaking': return 'Speaking';
      default: return 'Status';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-8">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">HomePilot Control</CardTitle>
          <CardDescription>
            {currentUiFeedback}
            {!speechSynthesisApiAvailable && speechRecognitionApiAvailable && " (Voice output not available.)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-2">
            <Button onClick={handleMicButtonClick} variant={userDesiredListening && micActuallyActive ? "destructive" : "outline"} size="lg"
              className={`p-4 rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 ${userDesiredListening && micActuallyActive ? 'animate-pulse bg-accent/30 border-accent' : 'border-primary/50'}`}
              aria-label={userDesiredListening ? "Stop listening" : "Start listening"}
              disabled={!speechRecognitionApiAvailable || (isProcessingCommand && !isWaitingForCommandAfterWakeWord)}
              title={!speechRecognitionApiAvailable ? "Voice recognition not available" : (userDesiredListening ? "Stop listening" : "Start listening")}>
              {userDesiredListening && micActuallyActive ? <MicOff className="h-8 w-8 text-destructive-foreground" /> : <Mic className={`h-8 w-8 ${micPermissionError ? 'text-destructive' : 'text-primary'}`} />}
            </Button>
            <form onSubmit={handleSubmitTextCommand} className="flex-grow flex items-center space-x-2">
              <Input type="text"
                placeholder={micActuallyActive ? `Say "${WAKE_WORD}" or type command` : (speechRecognitionApiAvailable ? `Type command (e.g. turn on light)` : "Type command (voice N/A)")}
                value={commandText} onChange={(e) => setCommandText(e.target.value)}
                disabled={isProcessingCommand && !isWaitingForCommandAfterWakeWord}
                className="flex-grow text-lg p-3 bg-input/50 border-border focus:ring-accent" />
              <Button type="submit" size="lg" disabled={isProcessingCommand || !commandText.trim()} className="bg-primary hover:bg-primary/80">
                {(isProcessingCommand && !isWaitingForCommandAfterWakeWord) ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              </Button>
            </form>
          </div>

          {(isProcessingCommand && !isWaitingForCommandAfterWakeWord && !feedbackMessage && !processedCommandDetails) && (
            <div className="flex justify-center items-center p-4"><Loader2 className="h-12 w-12 animate-spin text-accent" /><p className="ml-3 text-lg text-muted-foreground">Processing...</p></div>
          )}
          
          {processedCommandDetails && processedCommandDetails.intentType === 'action' && processedCommandDetails.actions && (
            <Card className="mt-6 bg-card/80 border-border shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  <Power className="h-5 w-5 mr-2" /> {/* Generic action icon */}
                  Multi-Action Command
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-base">
                <p><strong className="text-foreground">Summary:</strong> <span className="text-accent">{processedCommandDetails.summary || 'Executing actions...'}</span></p>
                <ul className="list-disc pl-5 space-y-1">
                  {processedCommandDetails.actions.map((act: any, index: number) => (
                    <li key={index}><span className="text-muted-foreground">{act.action}</span> <strong className="text-foreground">{act.device}</strong></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {processedCommandDetails && processedCommandDetails.intentType === 'query' && (
             <Card className="mt-6 bg-card/80 border-border shadow-md">
              <CardHeader><CardTitle className="flex items-center text-xl">
                {getDeviceIcon(selectedDevices.find(d => d.name === processedCommandDetails.queryTarget))}
                  <span className="ml-2">Query for: {processedCommandDetails.queryTarget}</span>
              </CardTitle></CardHeader>
              <CardContent className="space-y-2 text-base">
                <p><strong className="text-foreground">Type:</strong> <span className="text-accent capitalize">{processedCommandDetails.queryType}</span></p>
              </CardContent>
            </Card>
          )}


          {feedbackMessage && feedbackType && (
             <Alert variant={feedbackType === 'error' ? 'destructive' : 'default'}
                className={`mt-6 ${
                  feedbackType === 'success' ? 'border-green-500/50 bg-green-900/20 text-green-300'
                  : feedbackType === 'error' ? 'border-destructive/50 text-destructive-foreground'
                  : feedbackType === 'speaking' ? 'border-purple-500/50 bg-purple-900/20 text-purple-300'
                  : 'border-blue-500/50 bg-blue-900/20 text-blue-300'
                }`}>
              {feedbackIcon()}
              <AlertTitle className={`ml-2 ${
                  feedbackType === 'success' ? 'text-green-200'
                  : feedbackType === 'error' ? 'text-red-200' 
                  : feedbackType === 'speaking' ? 'text-purple-200'
                  : 'text-blue-200'
                }`}>
                {feedbackTitle()}
              </AlertTitle>
              <AlertDescription className="ml-2 text-sm">
                {feedbackMessage}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="text-center">
          <p className="text-xs text-muted-foreground">
            {currentUiFeedback}
            Dashboard devices update based on API responses.
          </p>
        </CardFooter>
      </Card>

      <div className="w-full max-w-2xl p-4 bg-card/50 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2 text-center text-foreground">Example Voice Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>`"{WAKE_WORD}"` (pause briefly) `"turn on the kitchen lights"`</li>
          <li>`"{WAKE_WORD} turn on main light and turn off table light"`</li>
          <li>`"{WAKE_WORD} what is the temperature?"`</li>
          <li>`"{WAKE_WORD} is the main light on?"`</li>
        </ul>
         <h3 className="text-lg font-semibold mt-4 mb-2 text-center text-foreground">Example Typed Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>`"Turn on kitchen lights"`</li>
          <li>`"Turn on main light and turn off fan"`</li>
          <li>`"What is the temperature?"`</li>
        </ul>
      </div>
    </div>
  );
}
