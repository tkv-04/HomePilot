
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
import { Mic, MicOff, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send, AlertTriangle, Wind, Power, Volume2, Info, Droplets, HelpCircle } from 'lucide-react';
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
const COMMAND_WAIT_TIMEOUT = 4000;

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
  const isProcessingCommandRef = useRef(isProcessingCommand);
  const waitForCommandTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isWaitingForCommandAfterWakeWordRef = useRef(isWaitingForCommandAfterWakeWord);

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
      toast({ title: "Voice Output Error", description: "Speech synthesis is not available.", variant: "destructive" });
      return;
    }
    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;

      utterance.onstart = () => {
        setFeedbackMessage(`Speaking: "${text}"`);
        setFeedbackType('speaking');
      };
      utterance.onend = () => {
        // Optionally reset feedback after speaking, or let it persist
        // setFeedbackMessage(null);
        // setFeedbackType(null);
      };
      utterance.onerror = (event) => {
        console.error("SpeechSynthesis Error:", event.error);
        toast({ title: "Voice Output Error", description: `Could not speak: ${event.error}`, variant: "destructive" });
        setFeedbackMessage(`Error speaking: ${event.error}`); // Update UI feedback
        setFeedbackType('error');
      };
      window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.error("Error initiating speech synthesis:", error);
        toast({ title: "Voice Output Error", description: "Failed to initiate speech.", variant: "destructive" });
    }
  }, [speechSynthesisApiAvailable, toast]);

  useEffect(() => {
    isProcessingCommandRef.current = isProcessingCommand;
  }, [isProcessingCommand]);

  useEffect(() => {
    isWaitingForCommandAfterWakeWordRef.current = isWaitingForCommandAfterWakeWord;
  }, [isWaitingForCommandAfterWakeWord]);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI && !recognitionRef.current) {
        try {
          recognitionRef.current = new SpeechRecognitionAPI();
          recognitionRef.current.continuous = false;
          recognitionRef.current.lang = 'en-US';
          recognitionRef.current.interimResults = false;
          recognitionRef.current.maxAlternatives = 1;
          setSpeechRecognitionApiAvailable(true);
          if (!micPermissionError) {
            setUserDesiredListening(true);
          }
        } catch (e) {
            console.error("Error initializing SpeechRecognition:", e);
            setSpeechRecognitionApiAvailable(false);
            setMicPermissionError("Could not initialize voice recognition.");
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
      setUserDesiredListening(false); // Ensure listening stops on unmount
      if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Ensure micPermissionError is not in deps to avoid re-init loop on error

  const handleInterpretAndExecuteCommand = useCallback(async (fullTranscript: string) => {
    if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) return; // Prevent re-entry if already processing (unless waiting for command part)

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
      // Set commandText only with the actual command part
      setCommandText(commandToInterpret);
    } else if (lowerCaseTranscript.startsWith(WAKE_WORD.toLowerCase())) {
      const commandPartAfterWakeWord = fullTranscript.substring(WAKE_WORD.length).trim();
      if (!commandPartAfterWakeWord) {
        const msg = `"${WAKE_WORD}" detected. Waiting for your command...`;
        setFeedbackMessage(msg); setFeedbackType('info');
        // speak(`${WAKE_WORD}.`); // SILENCED
        setCommandText(""); // Clear text while waiting
        setIsWaitingForCommandAfterWakeWord(true);
        setIsProcessingCommand(false); // Not "processing" Genkit yet
        waitForCommandTimeoutRef.current = setTimeout(() => {
          if (isWaitingForCommandAfterWakeWordRef.current) { // Check if still waiting
            const timeoutMsg = `Timed out waiting for command after "${WAKE_WORD}". Please try again.`;
            setFeedbackMessage(timeoutMsg); setFeedbackType('info');
            // speak(`Timed out waiting for command after ${WAKE_WORD}.`); // SILENCED
            setIsWaitingForCommandAfterWakeWord(false);
            setCommandText("");
          }
        }, COMMAND_WAIT_TIMEOUT);
        return; // Wait for next speech input or timeout
      }
      commandToInterpret = commandPartAfterWakeWord;
      // Set commandText only with the actual command part
      setCommandText(commandToInterpret);
    } else {
      // Not starting with wake word, and not in "waiting for command" state
      const msg = `Please start your command with "${WAKE_WORD}". You said: "${fullTranscript}"`;
      setFeedbackMessage(msg); setFeedbackType('info');
      // speak(msg); // SILENCED
      setCommandText(fullTranscript); // Show what was said
      setIsProcessingCommand(false); return;
    }

    // From here, we have a commandToInterpret (or it's empty and we'll handle that)
    if (!commandToInterpret.trim()) {
        const msg = "No command to process. Please try again.";
        setFeedbackMessage(msg); setFeedbackType('info');
        // speak(msg); // SILENCED
        setCommandText(""); // Ensure text input is cleared
        setIsProcessingCommand(false); return;
    }

    setIsProcessingCommand(true);
    setInterpretedResult(null); // Clear previous results
    setFeedbackMessage(`Interpreting: "${commandToInterpret}"`); setFeedbackType('info');

    let genkitResponse: InterpretVoiceCommandOutput;
    try {
      genkitResponse = await interpretVoiceCommand({ voiceCommand: commandToInterpret });
      setInterpretedResult({ ...genkitResponse }); // Store interpreted result
    } catch (error) {
      const msg = "Error: Could not interpret your command.";
      setFeedbackMessage(msg); setFeedbackType('error');
      // speak("Sorry, I couldn't understand that."); // SILENCED
      toast({ title: "Interpretation Error", description: `Failed to process. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
      setIsProcessingCommand(false); return;
    }

    if (selectedDevices.length === 0) {
      const msg = "No devices selected on your dashboard.";
      setFeedbackMessage(msg); setFeedbackType('info');
      // speak("You don't have any devices on your dashboard."); // SILENCED
      toast({ title: "No Devices", description: "Please select devices on your dashboard first." });
      setIsProcessingCommand(false); return;
    }

    const targetDeviceNameLower = genkitResponse.device.toLowerCase();
    const targetDevice = selectedDevices.find(
      d => d.name.toLowerCase().includes(targetDeviceNameLower) ||
           targetDeviceNameLower.includes(d.name.toLowerCase()) ||
           d.id.toLowerCase() === targetDeviceNameLower
    );

    if (!targetDevice) {
      const msg = `Device "${genkitResponse.device}" not found on your dashboard.`;
      setFeedbackMessage(msg); setFeedbackType('error');
      // speak(`I couldn't find ${genkitResponse.device} on your dashboard.`); // SILENCED
      toast({ title: "Device Not Found", description: `Could not find "${genkitResponse.device}".` , variant: "destructive"});
      setIsProcessingCommand(false); return;
    }
    // Update interpretedResult with the found targetDevice for UI display
    setInterpretedResult({ ...genkitResponse, targetDevice });

    if (genkitResponse.intentType === 'query') {
      setFeedbackMessage(`Looking up information for ${targetDevice.name}...`); setFeedbackType('info');

      // Refresh device state before speaking (optional, but good for freshness)
      if (onRefreshDeviceStates) {
        await onRefreshDeviceStates([targetDevice.id]);
        // Note: selectedDevices prop might not update instantly.
        // For most accurate state, re-find targetDevice from a potentially updated list
        // or rely on DeviceDisplay to update its own state, and VoiceControl just triggers refresh.
        // For simplicity here, we'll assume onRefreshDeviceStates updates a shared source or
        // the `selectedDevices` prop will be updated soon enough.
      }
      // Re-find the device from the prop in case it was updated by onRefreshDeviceStates
      const potentiallyUpdatedTargetDevice = selectedDevices.find(d => d.id === targetDevice.id) || targetDevice;


      let spokenResponse = "";
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
        } else if (actionLower.includes("get status") || actionLower.includes("is") || actionLower.includes("what is")) { // Generic status query for a sensor
            spokenResponse = `The ${sensorName} reading is ${state}${unit}.`;
        } else {
            spokenResponse = `The ${sensorName} is ${state}${unit}.`;
        }

      } else { // Non-sensor devices (lights, switches, etc.)
        if (actionLower.includes("get status") || actionLower.includes("is") || actionLower.includes("what is")) {
           spokenResponse = `The ${potentiallyUpdatedTargetDevice.name} is currently ${potentiallyUpdatedTargetDevice.state}.`;
        } else {
           // Fallback for other query types on non-sensors, if any were defined.
           // For now, assumes "get status" is the main query for non-sensors.
           spokenResponse = `The status of ${potentiallyUpdatedTargetDevice.name} is ${potentiallyUpdatedTargetDevice.state}.`;
        }
      }

      setFeedbackMessage(spokenResponse); setFeedbackType('success'); // Update UI feedback
      speak(spokenResponse); // SPEAK THE QUERY RESPONSE
      setIsProcessingCommand(false); return;
    }

    if (genkitResponse.intentType === 'action') {
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
            if (onRefreshDeviceStates) setTimeout(() => onRefreshDeviceStates([targetDevice.id]), 1000); // Refresh state after action
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
        // Should not happen if Genkit schema is well-defined
        setFeedbackMessage(`Unknown intent type: ${genkitResponse.intentType}`); setFeedbackType('error');
        // speak("I'm not sure what to do with that command."); // SILENCED
        setIsProcessingCommand(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, selectedDevices, speak, onRefreshDeviceStates]); // Added speak and onRefreshDeviceStates to deps

  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;

    currentRecognition.onresult = (event: any) => {
      // Check if processing another command OR waiting for command part, to avoid premature new command processing
      if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) {
        console.log("Speech result ignored: processing another command.");
        return;
      }
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      // Do not setCommandText here; handleInterpretAndExecuteCommand will do it.
      handleInterpretAndExecuteCommand(transcript);
    };

    currentRecognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error, event.message);
      setMicActuallyActive(false); // Mic is no longer active on error
      let newMicPermissionError = micPermissionError;

      if (isWaitingForCommandAfterWakeWordRef.current) {
        setIsWaitingForCommandAfterWakeWord(false);
        if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        newMicPermissionError = "Microphone access denied. Please enable it in your browser settings.";
        setUserDesiredListening(false); // Stop trying if permission is denied
      } else if (event.error === 'audio-capture') {
        newMicPermissionError = "Audio capture failed. Please check your microphone.";
        setUserDesiredListening(false); // Stop trying if mic hardware fails
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        // Don't show errors for "no-speech" or if we programmatically aborted.
        newMicPermissionError = `Voice recognition error: ${event.error}.`;
      }
      setMicPermissionError(newMicPermissionError);
      // Only toast for new, significant errors to avoid spamming
      if (newMicPermissionError && (micPermissionError !== newMicPermissionError || event.error === 'network')) {
        toast({ title: "Voice Error", description: newMicPermissionError || event.message || event.error, variant: "destructive" });
      }
    };

    currentRecognition.onstart = () => {
      setMicActuallyActive(true);
      setMicPermissionError(null); // Clear previous errors on successful start
    };

    currentRecognition.onend = () => {
      setMicActuallyActive(false);
      // Auto-restart logic: only if user desires listening, API is available, no permission errors,
      // and not currently processing a command (unless it's waiting for the command part after wake word)
      if (userDesiredListening && speechRecognitionApiAvailable && !micPermissionError &&
          (!isProcessingCommandRef.current || isWaitingForCommandAfterWakeWordRef.current) ) {
        try {
          // Short delay before restarting to prevent rapid-fire restarts on some errors
          setTimeout(() => {
            // Re-check conditions before starting, in case state changed during timeout
            if (userDesiredListening && recognitionRef.current && !micActuallyActive && !micPermissionError &&
                (!isProcessingCommandRef.current || isWaitingForCommandAfterWakeWordRef.current) ) {
              recognitionRef.current.start();
            }
          }, 250); // 250ms delay
        } catch (e: any) {
          // Catch errors like "recognition already started" or other invalid states
          if (e.name !== 'InvalidStateError') { // Ignore if it's just an invalid state (e.g., already started)
            console.error("Error restarting recognition:", e);
            setMicPermissionError("Failed to restart voice recognition.");
            setUserDesiredListening(false); // Stop trying if restart fails critically
          }
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechRecognitionApiAvailable, userDesiredListening, handleInterpretAndExecuteCommand, toast]); // Removed micPermissionError from deps


  // Effect to manage starting/stopping recognition based on user desire and other states
  useEffect(() => {
    if (!speechRecognitionApiAvailable || !recognitionRef.current) return;

    // If processing a command AND NOT waiting for the command part, ensure mic is stopped.
    if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) {
        if(micActuallyActive) {
            try { recognitionRef.current.stop(); } catch(e) { /* ignore */ }
        }
        return; // Don't proceed to start/stop logic if processing fully
    }

    // If user wants to listen, mic is not active, and no permission errors: START
    if (userDesiredListening && !micActuallyActive && !micPermissionError) {
      try {
        recognitionRef.current.start();
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') { // Ignore if already started
          console.error("Error starting recognition in effect:", e);
          setMicPermissionError("Could not start microphone.");
          setUserDesiredListening(false); // Give up if start fails
        }
      }
    }
    // If user does NOT want to listen and mic IS active: STOP
    else if (!userDesiredListening && micActuallyActive) {
      try {
        recognitionRef.current.stop();
        if (isWaitingForCommandAfterWakeWordRef.current) { // If stopped while waiting for command
            setIsWaitingForCommandAfterWakeWord(false);
            if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        }
      } catch (e:any) {
        if (e.name !== 'InvalidStateError') console.error("Error stopping recognition in effect:", e);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDesiredListening, micActuallyActive, speechRecognitionApiAvailable, micPermissionError]); // isProcessingCommandRef is handled by ref, not in deps

  const handleMicButtonClick = () => {
    if (!speechRecognitionApiAvailable) {
      toast({ title: "Voice Not Supported", description:"Your browser doesn't support speech recognition.", variant: "destructive" });
      return;
    }
    if (micPermissionError && !micActuallyActive) {
        // If there's a permission error and mic is off, try resetting to allow another attempt
        setMicPermissionError(null);
    }
    if (isWaitingForCommandAfterWakeWordRef.current) {
        // If user clicks mic while waiting for command after "Jarvis"
        setIsWaitingForCommandAfterWakeWord(false);
        if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        const msg = "Command cancelled.";
        setFeedbackMessage(msg); setFeedbackType("info");
        // speak(msg); // SILENCED
    }
    setUserDesiredListening(prev => !prev); // Toggle listening state
  };

  const handleSubmitTextCommand = (event: FormEvent) => {
    event.preventDefault();
    if (isProcessingCommandRef.current || !commandText.trim()) return;
    // Clear any "waiting for command" state if text is submitted
    if (isWaitingForCommandAfterWakeWordRef.current) {
        setIsWaitingForCommandAfterWakeWord(false);
        if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
    }
    // Prepend wake word for typed commands to match voice flow for Genkit
    handleInterpretAndExecuteCommand(`${WAKE_WORD} ${commandText}`);
  };

  const getDeviceIcon = (device?: Device) => {
    if (device?.icon) return <device.icon className="h-5 w-5" />;
    if (!device?.type) return <HelpCircle className="h-5 w-5" />; // Default if type is missing
    const typeLower = device.type.toLowerCase();
    if (typeLower.includes("light")) return <Lightbulb className="h-5 w-5" />;
    if (typeLower.includes("thermostat") || (typeLower.includes("temp") && typeLower.includes("sensor"))) return <Thermometer className="h-5 w-5" />;
    if (typeLower.includes("humidity") && typeLower.includes("sensor")) return <Droplets className="h-5 w-5" />;
    if (typeLower.includes("tv")) return <Tv2 className="h-5 w-5" />;
    if (typeLower.includes("lock")) return <Lock className="h-5 w-5" />;
    if (typeLower.includes("fan")) return <Wind className="h-5 w-5" />;
    if (typeLower.includes("switch") || typeLower.includes("outlet")) return <Power className="h-5 w-5" />;
    if (typeLower.includes("sensor")) return <Info className="h-5 w-5" />; // Generic sensor
    return <HelpCircle className="h-5 w-5" />; // Fallback for unknown types
  };

  // Determine the UI feedback message
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
      default: return <Info className="h-5 w-5 text-blue-400" />; // Default icon
    }
  };
  const feedbackTitle = () => {
     switch(feedbackType) {
      case 'success': return 'Success';
      case 'error': return 'Error';
      case 'info': return 'Information';
      case 'speaking': return 'Speaking';
      default: return 'Status'; // Default title
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
              disabled={!speechRecognitionApiAvailable || (isProcessingCommand && !isWaitingForCommandAfterWakeWord)} // Disable if processing full command
              title={!speechRecognitionApiAvailable ? "Voice recognition not available" : (userDesiredListening ? "Stop listening" : "Start listening")}>
              {userDesiredListening && micActuallyActive ? <MicOff className="h-8 w-8 text-destructive-foreground" /> : <Mic className={`h-8 w-8 ${micPermissionError ? 'text-destructive' : 'text-primary'}`} />}
            </Button>
            <form onSubmit={handleSubmitTextCommand} className="flex-grow flex items-center space-x-2">
              <Input type="text"
                placeholder={micActuallyActive ? `Say "${WAKE_WORD}" or type command` : (speechRecognitionApiAvailable ? `Type command (e.g. turn on light)` : "Type command (voice N/A)")}
                value={commandText} onChange={(e) => setCommandText(e.target.value)}
                disabled={isProcessingCommand && !isWaitingForCommandAfterWakeWord} // Disable if processing full command
                className="flex-grow text-lg p-3 bg-input/50 border-border focus:ring-accent" />
              <Button type="submit" size="lg" disabled={isProcessingCommand || !commandText.trim()} className="bg-primary hover:bg-primary/80">
                {(isProcessingCommand && !isWaitingForCommandAfterWakeWord) ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              </Button>
            </form>
          </div>

          {(isProcessingCommand && !isWaitingForCommandAfterWakeWord && !feedbackMessage && !interpretedResult) && ( // Show generic processing only if no specific feedback yet
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

          {feedbackMessage && feedbackType && ( // Display feedback messages from state
             <Alert variant={feedbackType === 'error' ? 'destructive' : 'default'}
                className={`mt-6 ${
                  feedbackType === 'success' ? 'border-green-500/50 bg-green-900/20 text-green-300'
                  : feedbackType === 'error' ? 'border-destructive/50 text-destructive-foreground' // Uses default destructive style
                  : feedbackType === 'speaking' ? 'border-purple-500/50 bg-purple-900/20 text-purple-300'
                  : 'border-blue-500/50 bg-blue-900/20 text-blue-300' // Default to info style
                }`}>
              {feedbackIcon()}
              <AlertTitle className={`ml-2 ${
                  feedbackType === 'success' ? 'text-green-200'
                  : feedbackType === 'error' ? 'text-red-200' // Matching destructive alert title color
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
            {userDesiredListening ?
                (micActuallyActive ?
                    (isWaitingForCommandAfterWakeWord ? `Waiting for command... Say it now.` : `Listening for "${WAKE_WORD}"... `)
                    : "Microphone starting... ")
                : (speechRecognitionApiAvailable ? "Voice control idle. " : "Voice recognition N/A. ")
            }
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

