
// src/components/dashboard/VoiceControl.tsx
"use client";

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import type { InterpretVoiceCommandOutput, InterpretVoiceCommandInput } from '@/ai/flows/interpret-voice-command';
import { interpretVoiceCommand } from '@/ai/flows/interpret-voice-command';
import { executeDeviceCommandOnApi } from '@/services/homeAssistantService';
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
  const [interpretedResult, setInterpretedResult] = useState<(InterpretVoiceCommandOutput & { targetDevice?: Device }) | null>(null);
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

  // Refs for state values needed in callbacks that might have stale closures
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
    // Use refs for checks to ensure current values are used
    if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) return;

    if (waitForCommandTimeoutRef.current) {
      clearTimeout(waitForCommandTimeoutRef.current);
      waitForCommandTimeoutRef.current = null;
    }

    const lowerCaseTranscript = fullTranscript.toLowerCase();
    let commandToInterpret = "";

    if (isWaitingForCommandAfterWakeWordRef.current) {
      setIsWaitingForCommandAfterWakeWord(false); // Exiting waiting state
      if (!fullTranscript.trim()) {
        const msg = `No command given after "${WAKE_WORD}". Try again.`;
        setFeedbackMessage(msg); setFeedbackType('info');
        // speak(`No command given after ${WAKE_WORD}.`); // SILENCED
        setCommandText(""); setIsProcessingCommand(false); return;
      }
      commandToInterpret = fullTranscript.trim();
      setCommandText(commandToInterpret);
    } else if (lowerCaseTranscript.startsWith(WAKE_WORD.toLowerCase())) {
      const commandPartAfterWakeWord = fullTranscript.substring(WAKE_WORD.length).trim();
      if (!commandPartAfterWakeWord) {
        const msg = `"${WAKE_WORD}" detected. Waiting for your command...`;
        setFeedbackMessage(msg); setFeedbackType('info');
        // speak(`${WAKE_WORD}.`); // SILENCED
        setCommandText("");
        setIsWaitingForCommandAfterWakeWord(true);
        setIsProcessingCommand(false); // Not "processing" Genkit yet
        waitForCommandTimeoutRef.current = setTimeout(() => {
          if (isWaitingForCommandAfterWakeWordRef.current) {
            const timeoutMsg = `Timed out waiting for command after "${WAKE_WORD}". Please try again.`;
            setFeedbackMessage(timeoutMsg); setFeedbackType('info');
            // speak(`Timed out waiting for command after ${WAKE_WORD}.`); // SILENCED
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
      // speak(msg); // SILENCED
      setCommandText(fullTranscript); // Show what was said
      setIsProcessingCommand(false); return;
    }

    if (!commandToInterpret.trim()) {
        const msg = "No command to process. Please try again.";
        setFeedbackMessage(msg); setFeedbackType('info');
        // speak(msg); // SILENCED
        setCommandText("");
        setIsProcessingCommand(false); return;
    }

    setIsProcessingCommand(true);
    setInterpretedResult(null);
    setFeedbackMessage(`Interpreting: "${commandToInterpret}"`); setFeedbackType('info');

    let genkitResponse: InterpretVoiceCommandOutput;
    try {
      genkitResponse = await interpretVoiceCommand({ voiceCommand: commandToInterpret });
      setInterpretedResult({ ...genkitResponse });
    } catch (error) {
      const msg = "Error: Could not interpret your command.";
      setFeedbackMessage(msg); setFeedbackType('error');
      // speak("Sorry, I couldn't understand that."); // SILENCED
      toast({ title: "Interpretation Error", description: `Failed to process. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
      setIsProcessingCommand(false); return;
    }

    if (selectedDevices.length === 0 && genkitResponse.intentType !== 'query') { // Allow queries even if no devices selected for control
      const msg = "No devices selected on your dashboard to control.";
      setFeedbackMessage(msg); setFeedbackType('info');
      // speak("You don't have any devices on your dashboard to control."); // SILENCED
      toast({ title: "No Devices", description: "Please select devices on your dashboard first." });
      setIsProcessingCommand(false); return;
    }
    
    const targetDeviceNameLower = genkitResponse.device.toLowerCase();
    const targetDevice = selectedDevices.find(
      d => d.name.toLowerCase().includes(targetDeviceNameLower) ||
           targetDeviceNameLower.includes(d.name.toLowerCase()) ||
           d.id.toLowerCase() === targetDeviceNameLower
    );

    if (!targetDevice && genkitResponse.intentType !== 'query') { // For actions, device must exist
      const msg = `Device "${genkitResponse.device}" not found on your dashboard.`;
      setFeedbackMessage(msg); setFeedbackType('error');
      // speak(`I couldn't find ${genkitResponse.device} on your dashboard.`); // SILENCED
      toast({ title: "Device Not Found", description: `Could not find "${genkitResponse.device}".` , variant: "destructive"});
      setIsProcessingCommand(false); return;
    }
    // If targetDevice is found or it's a generic query, update interpretedResult
    if (targetDevice) {
        setInterpretedResult({ ...genkitResponse, targetDevice });
    }


    if (genkitResponse.intentType === 'query') {
      setFeedbackMessage(`Looking up information for ${targetDevice ? targetDevice.name : genkitResponse.device}...`); setFeedbackType('info');

      if (targetDevice && onRefreshDeviceStates) {
        try {
          await onRefreshDeviceStates([targetDevice.id]);
          // The actual update of selectedDevices for speaking will happen through props
        } catch (refreshError) {
          console.error("Error refreshing device state for query:", refreshError);
        }
      }
      
      // We need to get the potentially updated device state from props
      // This requires a slight delay or a more complex state update mechanism if onRefreshDeviceStates is async and selectedDevices prop updates
      // For now, let's assume selectedDevices prop will update or use a brief timeout.
      // A more robust solution would involve waiting for selectedDevices prop to reflect the change.
      setTimeout(() => {
        const potentiallyUpdatedTargetDevice = targetDevice ? selectedDevices.find(d => d.id === targetDevice.id) || targetDevice : null;
        let spokenResponse = "";

        if (potentiallyUpdatedTargetDevice) {
            const actionLower = genkitResponse.action.toLowerCase();
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
            } else { // For non-sensor devices
                if (actionLower.includes("get status") || actionLower.includes("is") || actionLower.includes("what is")) {
                   spokenResponse = `The ${potentiallyUpdatedTargetDevice.name} is currently ${potentiallyUpdatedTargetDevice.state}.`;
                } else {
                   spokenResponse = `The status of ${potentiallyUpdatedTargetDevice.name} is ${potentiallyUpdatedTargetDevice.state}.`;
                }
            }
        } else {
            // Handle case where targetDevice might not be on dashboard but query is generic enough (e.g. "what's the weather")
            // This part would require Genkit to handle queries not tied to a specific dashboard device.
            // For now, if no targetDevice, it means the query was for a device not found.
            spokenResponse = `I couldn't find information for ${genkitResponse.device} on your dashboard.`;
        }

        setFeedbackMessage(spokenResponse); setFeedbackType('success');
        speak(spokenResponse);
        setIsProcessingCommand(false);
      }, targetDevice ? 500 : 0); // Add small delay if refreshing device state to allow prop update
      return;
    }


    if (genkitResponse.intentType === 'action') {
        if (!targetDevice) { // Should have been caught earlier, but as a safeguard
            const msg = `Device "${genkitResponse.device}" not found for action.`;
            setFeedbackMessage(msg); setFeedbackType('error');
            setIsProcessingCommand(false); return;
        }
        setFeedbackMessage(`Sending command to ${targetDevice.name}...`); setFeedbackType('info');
        const actionLower = genkitResponse.action.toLowerCase();
        let apiCommand = '', apiParams: Record<string, any> = {};

        if (actionLower.includes("turn on") || actionLower.includes("activate")) {
          apiCommand = 'action.devices.commands.OnOff'; apiParams = { on: true };
        } else if (actionLower.includes("turn off") || actionLower.includes("deactivate")) {
          apiCommand = 'action.devices.commands.OnOff'; apiParams = { on: false };
        } else {
          const msg = `Action "${genkitResponse.action}" on ${targetDevice.name} is not supported.`;
          setFeedbackMessage(msg); setFeedbackType('info');
          // speak(`I can't ${genkitResponse.action} ${targetDevice.name}.`); // SILENCED
          toast({ title: "Unsupported Action", description: msg });
          setIsProcessingCommand(false); return;
        }

        if (!['light', 'switch', 'fan', 'outlet'].includes(targetDevice.type)) {
            const msg = `Device type "${targetDevice.type}" doesn't support On/Off actions.`;
            setFeedbackMessage(msg); setFeedbackType('info');
            // speak(`I can't control a ${targetDevice.type} that way.`); // SILENCED
            toast({ title: "Unsupported Device Type", description: `Cannot turn ${targetDevice.name} on/off.`, variant: "destructive"});
            setIsProcessingCommand(false); return;
        }
        if (!targetDevice.online) {
          const msg = `${targetDevice.name} is offline. Command not sent.`;
          setFeedbackMessage(msg); setFeedbackType('error');
          // speak(`${targetDevice.name} appears offline.`); // SILENCED
          toast({ title: "Device Offline", description: msg, variant: "destructive" });
          setIsProcessingCommand(false); return;
        }

        try {
          const execResult = await executeDeviceCommandOnApi(targetDevice.id, apiCommand, apiParams);
          if (execResult.success) {
            const msg = `Successfully executed: ${genkitResponse.action.toLowerCase()} ${targetDevice.name}.`;
            setFeedbackMessage(msg); setFeedbackType('success');
            // speak(`Okay, ${genkitResponse.action.toLowerCase().replace("turn ", "")} ${targetDevice.name}.`); // SILENCED
            toast({ title: "Command Successful", description: `${targetDevice.name} was ${genkitResponse.action.toLowerCase()}.`});
            if (onRefreshDeviceStates) {
              setTimeout(() => onRefreshDeviceStates([targetDevice.id]), 1000);
            }
          } else {
            const msg = `Failed to execute: ${genkitResponse.action.toLowerCase()} ${targetDevice.name}. Bridge reported an issue.`;
            setFeedbackMessage(msg); setFeedbackType('error');
            // speak(`Sorry, I couldn't ${genkitResponse.action.toLowerCase().replace("turn ", "")} ${targetDevice.name}.`); // SILENCED
            toast({ title: "Command Failed", description: `Could not control ${targetDevice.name}.`, variant: "destructive" });
          }
        } catch (execError: any) {
          const msg = `API Error executing command for ${targetDevice.name}: ${execError.message}`;
          setFeedbackMessage(msg); setFeedbackType('error');
          // speak(`Error controlling ${targetDevice.name}.`); // SILENCED
          toast({ title: "API Error", description: `Error: ${execError.message}.`, variant: "destructive" });
        } finally {
          setIsProcessingCommand(false);
        }
    } else {
        setFeedbackMessage(`Unknown intent type: ${genkitResponse.intentType}`); setFeedbackType('error');
        // speak("I'm not sure what to do with that command."); // SILENCED
        setIsProcessingCommand(false);
    }
  }, [toast, selectedDevices, speak, onRefreshDeviceStates, COMMAND_WAIT_TIMEOUT]);


  // Effect to initialize SpeechRecognition API and set availability
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
          setUserDesiredListening(true); // Attempt to start listening on load
        } catch (e: any) {
            console.error("Error initializing SpeechRecognition:", e.name, e.message);
            setSpeechRecognitionApiAvailable(false);
            setMicPermissionError(e.name === 'SecurityError' ? "Voice recognition security error (HTTPS?)" : "Could not initialize voice recognition.");
        }
      }
    } else {
      console.warn("SpeechRecognition API not supported in this browser.");
      setSpeechRecognitionApiAvailable(false);
      setMicPermissionError("Voice recognition is not supported by your browser.");
    }
    return () => { // Cleanup
      if (recognitionRef.current && micActuallyActive) {
        try { recognitionRef.current.stop(); recognitionRef.current.abort(); } catch (e) {}
      }
      if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty: Initialize once


  // Main effect for controlling speech recognition start/stop based on state
  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) {
      return;
    }

    // If processing a full command (not just waiting for command after wake word)
    if (isProcessingCommand && !isWaitingForCommandAfterWakeWord) {
      if (micActuallyActive) {
        try {
          currentRecognition.stop();
        } catch (e) {
          // console.warn("Error stopping recognition during processing:", e);
        }
      }
      return; // When processing, we don't want to start, so return early
    }

    // If user wants to listen, mic isn't active, and no permission error
    if (userDesiredListening && !micActuallyActive && !micPermissionError) {
      try {
        currentRecognition.start();
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') { // Ignore if already started or in a state that can't start
          console.error("Error starting recognition in main effect:", e);
          setMicPermissionError("Could not start microphone. Try refreshing or check permissions.");
          setUserDesiredListening(false); // Stop trying if it fails badly
        }
      }
    } else if (!userDesiredListening && micActuallyActive) { // User wants to stop listening, and mic is active
      try {
        currentRecognition.stop();
        if (isWaitingForCommandAfterWakeWord) { // Clear wake word state if user manually stops
            setIsWaitingForCommandAfterWakeWord(false);
            if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        }
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') { // Ignore if already stopped
          // console.error("Error stopping recognition in main effect:", e);
        }
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

  // Effect for setting up recognition event handlers
  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;

    currentRecognition.onresult = (event: any) => {
      if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) {
        return;
      }
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      // Update commandText only after wake word processing, inside handleInterpretAndExecuteCommand
      handleInterpretAndExecuteCommand(transcript);
    };

    currentRecognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error, event.message);
      setMicActuallyActive(false); // Mic stopped due to error
      let newMicPermissionError = micPermissionError; // Preserve existing critical errors

      if (isWaitingForCommandAfterWakeWordRef.current) {
        setIsWaitingForCommandAfterWakeWord(false);
        if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        newMicPermissionError = "Microphone access denied. Please enable it in your browser settings.";
        setUserDesiredListening(false); // Stop trying if permission is denied
      } else if (event.error === 'audio-capture') {
        newMicPermissionError = "Audio capture failed. Please check your microphone.";
        setUserDesiredListening(false); // Stop trying
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        // Only set as a new error if it's not 'no-speech' or 'aborted' and there isn't a more critical one already
        if (!newMicPermissionError || (newMicPermissionError && !['Microphone access denied', 'Audio capture failed'].some(e => newMicPermissionError.includes(e)))) {
            newMicPermissionError = `Voice recognition error: ${event.error}. Try refreshing.`;
        }
      }
      setMicPermissionError(newMicPermissionError);

      // Toast for new, significant errors
      if (newMicPermissionError && (micPermissionError !== newMicPermissionError || event.error === 'network') && (event.error !== 'no-speech' && event.error !== 'aborted') ) {
        toast({ title: "Voice Error", description: newMicPermissionError || event.message || event.error, variant: "destructive" });
      }
    };

    currentRecognition.onstart = () => {
      setMicActuallyActive(true);
      setMicPermissionError(null); // Clear non-critical errors on successful start
    };

    currentRecognition.onend = () => {
      setMicActuallyActive(false);
      // The main useEffect will handle restarting if conditions (userDesiredListening, !isProcessingCommand, etc.) are met,
      // because micActuallyActive has changed to false.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechRecognitionApiAvailable, handleInterpretAndExecuteCommand, toast]); // Removed userDesiredListening, micPermissionError to simplify

  const handleMicButtonClick = () => {
    if (!speechRecognitionApiAvailable) {
      toast({ title: "Voice Not Supported", description:"Your browser doesn't support speech recognition.", variant: "destructive" });
      return;
    }
    // If there was a permission error, clicking the button attempts to clear it and retry
    if (micPermissionError && !micActuallyActive) {
        setMicPermissionError(null);
    }
    // If waiting for command after wake word, cancel it
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
    if (isWaitingForCommandAfterWakeWord) { // If waiting for voice, but user types and submits
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
    if (typeLower.includes("sensor")) return <Info className="h-5 w-5" />; // Generic sensor
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

          {(isProcessingCommand && !isWaitingForCommandAfterWakeWord && !feedbackMessage && !interpretedResult) && (
            <div className="flex justify-center items-center p-4"><Loader2 className="h-12 w-12 animate-spin text-accent" /><p className="ml-3 text-lg text-muted-foreground">Processing...</p></div>
          )}

          {interpretedResult && interpretedResult.targetDevice && (
            <Card className="mt-6 bg-card/80 border-border shadow-md">
              <CardHeader><CardTitle className="flex items-center text-xl">{getDeviceIcon(interpretedResult.targetDevice)}
                  <span className="ml-2">{interpretedResult.intentType === 'query' ? 'Query for: ' : 'Command for: '} {interpretedResult.targetDevice.name}</span>
              </CardTitle></CardHeader>
              <CardContent className="space-y-2 text-base">
                <p><strong className="text-foreground">Intent:</strong> <span className="text-accent capitalize">{interpretedResult.intentType}</span></p>
                <p><strong className="text-foreground">Interpreted:</strong> <span className="text-accent">{interpretedResult.action}</span></p>
                {interpretedResult.rawValue && (<p><strong className="text-foreground">Value:</strong> <span className="text-accent">{interpretedResult.rawValue}</span></p>)}
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
          <li>`"{WAKE_WORD} what is the temperature?"`</li>
          <li>`"{WAKE_WORD} is the main light on?"`</li>
        </ul>
         <h3 className="text-lg font-semibold mt-4 mb-2 text-center text-foreground">Example Typed Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>`"Turn on kitchen lights"`</li>
          <li>`"What is the temperature?"`</li>
        </ul>
      </div>
    </div>
  );
}
