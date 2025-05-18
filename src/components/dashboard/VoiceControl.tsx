
// src/components/dashboard/VoiceControl.tsx
"use client";

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import type { InterpretVoiceCommandOutput } from '@/ai/flows/interpret-voice-command';
import { interpretVoiceCommand } from '@/ai/flows/interpret-voice-command';
import { executeDeviceCommandsOnApi, type DeviceCommand } from '@/services/homeAssistantService';
import type { Device } from '@/types/home-assistant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mic, MicOff, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send, Info, Droplets, HelpCircle, Wind, Power, Volume2, MessageSquare } from 'lucide-react'; // Added MessageSquare
import { useToast } from '@/hooks/use-toast';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';

interface MockSpeechRecognition {
  start: () => void;
  stop: () => void;
  onresult?: (event: { results: { transcript: string; isFinal: boolean }[][], resultIndex: number }) => void;
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
const COMMAND_WAIT_TIMEOUT = 6000; 

export function VoiceControl({ selectedDevices, onRefreshDeviceStates }: VoiceControlProps) {
  const [commandText, setCommandText] = useState("");
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [processedCommandDetails, setProcessedCommandDetails] = useState<any>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info' | 'speaking' | 'general' | null>(null); // Added 'general'

  const [speechRecognitionApiAvailable, setSpeechRecognitionApiAvailable] = useState(false);
  const [speechSynthesisApiAvailable, setSpeechSynthesisApiAvailable] = useState(false);
  
  const [userDesiredListening, setUserDesiredListening] = useState(false);
  const [micActuallyActive, setMicActuallyActive] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [isWaitingForCommandAfterWakeWord, setIsWaitingForCommandAfterWakeWord] = useState(false);

  const { toast } = useToast();
  const { preferences: userPreferences, isLoading: isLoadingPreferences } = useUserPreferences();
  
  const recognitionRef = useRef<MockSpeechRecognition | null>(null);
  const waitForCommandTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
      const checkVoices = () => {
        if (window.speechSynthesis.getVoices().length > 0) { /* Voices loaded */ }
      };
      checkVoices();
      window.speechSynthesis.onvoiceschanged = checkVoices;
    } else {
      setSpeechSynthesisApiAvailable(false);
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (!speechSynthesisApiAvailable || typeof window === 'undefined' || !window.speechSynthesis || isLoadingPreferences) {
      onEndCallback?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      const storedVoiceURI = userPreferences?.selectedVoiceURI;
      const currentVoices = window.speechSynthesis.getVoices();
      if (storedVoiceURI && currentVoices.length > 0) {
        const voice = currentVoices.find(v => v.voiceURI === storedVoiceURI);
        if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      }
      utterance.onerror = (event) => {
        console.error("SpeechSynthesis Error:", event.error);
        setFeedbackMessage(`Error speaking: ${event.error}`); setFeedbackType('error');
        onEndCallback?.();
      };
      utterance.onend = () => { onEndCallback?.(); };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("Error initiating speech synthesis:", error);
      onEndCallback?.();
    }
  }, [speechSynthesisApiAvailable, userPreferences, isLoadingPreferences]);

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
        setFeedbackMessage(null); setCommandText(""); setIsProcessingCommand(false); return;
      }
      commandToInterpret = fullTranscript.trim();
    } else if (lowerCaseTranscript.startsWith(WAKE_WORD.toLowerCase())) {
      const commandPartAfterWakeWord = fullTranscript.substring(WAKE_WORD.length).trim();
      if (!commandPartAfterWakeWord) {
        setFeedbackMessage(`"${WAKE_WORD}" detected. Waiting for your command...`); 
        setFeedbackType('info'); setCommandText(""); setIsWaitingForCommandAfterWakeWord(true); setIsProcessingCommand(false);
        waitForCommandTimeoutRef.current = setTimeout(() => {
          if (isWaitingForCommandAfterWakeWordRef.current) {
            setFeedbackMessage(null); setIsWaitingForCommandAfterWakeWord(false); setCommandText("");
          }
        }, COMMAND_WAIT_TIMEOUT);
        return;
      }
      commandToInterpret = commandPartAfterWakeWord;
    } else {
      setCommandText(fullTranscript); setIsProcessingCommand(false); return;
    }

    setCommandText(commandToInterpret); 
    if (!commandToInterpret.trim()) {
      setFeedbackMessage(null); setCommandText(""); setIsProcessingCommand(false); return;
    }

    setIsProcessingCommand(true);
    setProcessedCommandDetails(null);
    setFeedbackMessage(`Interpreting: "${commandToInterpret}"`); setFeedbackType('info');

    let genkitResponse: InterpretVoiceCommandOutput;
    try {
      genkitResponse = await interpretVoiceCommand({ voiceCommand: commandToInterpret });
      setProcessedCommandDetails(genkitResponse); 
    } catch (error) {
      const msg = `Error: Could not interpret your command. ${error instanceof Error ? error.message : ''}`;
      setFeedbackMessage(msg); setFeedbackType('error');
      toast({ title: "Interpretation Error", description: `Failed to process. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
      setIsProcessingCommand(false); return;
    }
    
    const executeAfterSpeakingConfirmation = async () => {
        if (genkitResponse.intentType === 'general') {
            if (genkitResponse.generalResponse) {
                setFeedbackMessage(genkitResponse.generalResponse);
                setFeedbackType('general'); // Use 'general' or 'speaking'
                speak(genkitResponse.generalResponse, () => {
                    setFeedbackMessage(genkitResponse.generalResponse); // Keep it displayed
                    setFeedbackType('general'); // Revert to general after speaking
                    setIsProcessingCommand(false);
                });
            } else {
                setFeedbackMessage("I'm not sure how to respond to that.");
                setFeedbackType('info');
                setIsProcessingCommand(false);
            }
            return;
        }

        if (genkitResponse.intentType === 'query') {
            const queryTargetName = genkitResponse.queryTarget;
            const queryType = genkitResponse.queryType;
            if (!queryTargetName || !queryType) {
                setFeedbackMessage("Sorry, I couldn't understand what you're asking about."); 
                setFeedbackType('error'); setIsProcessingCommand(false); return;
            }
            setFeedbackMessage(`Looking up: ${queryType} for ${queryTargetName}...`); setFeedbackType('info');
            const targetDevice = selectedDevices.find(
              d => d.name.toLowerCase().includes(queryTargetName.toLowerCase()) ||
                   queryTargetName.toLowerCase().includes(d.name.toLowerCase()) ||
                   d.id.toLowerCase() === queryTargetName.toLowerCase()
            );
            if (!targetDevice) {
              const notFoundMsg = `Device "${queryTargetName}" not found on your dashboard for query.`;
              setFeedbackMessage(notFoundMsg); setFeedbackType('error'); setIsProcessingCommand(false); return;
            }
            setProcessedCommandDetails({ intentType: 'query', queryTarget: targetDevice.name, queryType });
            if (onRefreshDeviceStates) {
                try {
                    setFeedbackMessage(`Refreshing state for ${targetDevice.name}...`); setFeedbackType('info');
                    await onRefreshDeviceStates([targetDevice.id]);
                } catch (refreshError) { console.error("Error refreshing device state for query:", refreshError); }
            }
            setTimeout(() => {
                const potentiallyUpdatedTargetDevice = selectedDevices.find(d => d.id === targetDevice.id) || targetDevice;
                let spokenResponse = "";
                if (potentiallyUpdatedTargetDevice) {
                    const actionLower = queryType.toLowerCase();
                    if (potentiallyUpdatedTargetDevice.type === 'sensor') {
                        const unit = potentiallyUpdatedTargetDevice.attributes?.unit_of_measurement || '';
                        let state = (potentiallyUpdatedTargetDevice.state === 'unknown' || potentiallyUpdatedTargetDevice.state === null || potentiallyUpdatedTargetDevice.state === undefined)
                                    ? 'unavailable' : String(potentiallyUpdatedTargetDevice.state);
                        if (typeof potentiallyUpdatedTargetDevice.state === 'boolean') state = potentiallyUpdatedTargetDevice.state ? 'active' : 'inactive';
                        const sensorName = potentiallyUpdatedTargetDevice.name;
                        if (actionLower.includes("get temperature") || actionLower.includes("what is the temperature")) spokenResponse = `${sensorName} is currently ${state}${unit}.`;
                        else if (actionLower.includes("get humidity") || actionLower.includes("what is the humidity")) spokenResponse = `${sensorName} is currently ${state}${unit}.`;
                        else spokenResponse = `The ${sensorName} is ${state}${unit}.`;
                    } else { 
                        spokenResponse = `The ${potentiallyUpdatedTargetDevice.name} is currently ${potentiallyUpdatedTargetDevice.state}.`;
                    }
                } else { spokenResponse = `I couldn't find information for ${queryTargetName} on your dashboard.`; }
                setFeedbackMessage(spokenResponse); setFeedbackType('speaking');
                speak(spokenResponse, () => { setFeedbackMessage(spokenResponse); setFeedbackType('success'); });
                setIsProcessingCommand(false);
            }, targetDevice && onRefreshDeviceStates ? 500 : 0); 
            return;
        }

        if (genkitResponse.intentType === 'action' && genkitResponse.actions && genkitResponse.actions.length > 0) {
            if (selectedDevices.length === 0) {
                setFeedbackMessage("No devices selected on dashboard."); setFeedbackType('info'); setIsProcessingCommand(false); return;
            }
            let actionSummaryForDisplay = "";
            const commandsToExecute: DeviceCommand[] = genkitResponse.actions.reduce((acc, actionDetail) => {
                const targetDeviceNameLower = actionDetail.device.toLowerCase();
                const targetDevice = selectedDevices.find(
                  d => d.name.toLowerCase().includes(targetDeviceNameLower) ||
                       targetDeviceNameLower.includes(d.name.toLowerCase()) ||
                       d.id.toLowerCase() === targetDeviceNameLower
                );
                if (!targetDevice) { actionSummaryForDisplay += `Device "${actionDetail.device}" not found. `; return acc; }
                if (!targetDevice.online) { actionSummaryForDisplay += `${targetDevice.name} is offline. `; return acc; }
                if (!['light', 'switch', 'fan', 'outlet'].includes(targetDevice.type)) { actionSummaryForDisplay += `Cannot control ${targetDevice.name}. `; return acc; }
                const actionCmdLower = actionDetail.action.toLowerCase();
                let apiCommand = '', apiParams: Record<string, any> = {};
                if (actionCmdLower.includes("turn on") || actionCmdLower.includes("activate")) { apiCommand = 'action.devices.commands.OnOff'; apiParams = { on: true }; }
                else if (actionCmdLower.includes("turn off") || actionCmdLower.includes("deactivate")) { apiCommand = 'action.devices.commands.OnOff'; apiParams = { on: false }; }
                else { actionSummaryForDisplay += `Action "${actionDetail.action}" on ${targetDevice.name} not supported. `; return acc; }
                acc.push({ deviceId: targetDevice.id, command: apiCommand, params: apiParams });
                actionSummaryForDisplay += `${actionDetail.action} ${targetDevice.name}. `;
                return acc;
            }, [] as DeviceCommand[]);
            setProcessedCommandDetails({ intentType: 'action', actions: genkitResponse.actions, summary: actionSummaryForDisplay.trim() });
            if (commandsToExecute.length === 0) {
                const finalMsg = actionSummaryForDisplay || "No valid actions to execute.";
                setFeedbackMessage(finalMsg); setFeedbackType(actionSummaryForDisplay.includes("not found") ? 'error' : 'info');
                setIsProcessingCommand(false); return;
            }
            setFeedbackMessage(`Sending ${commandsToExecute.length} command(s)...`); setFeedbackType('info');
            try {
                const execResults = await executeDeviceCommandsOnApi(commandsToExecute);
                let successCount = 0; let failCount = 0; let resultSummary = ""; const deviceIdsToRefresh: string[] = [];
                execResults.commands.forEach(result => {
                  const deviceId = result.ids[0]; const device = selectedDevices.find(d => d.id === deviceId);
                  const deviceName = device ? device.name : deviceId;
                  if (result.status === 'SUCCESS') { successCount++; resultSummary += `${deviceName} OK. `; deviceIdsToRefresh.push(deviceId); }
                  else { failCount++; resultSummary += `${deviceName} FAILED (${result.errorCode || 'unknown'}). `; }
                });
                if (successCount > 0 && failCount === 0) toast({ title: "Commands Successful", description: `${successCount} action(s) sent.`});
                else if (successCount > 0 && failCount > 0) toast({ title: "Some Commands Sent", description: `${successCount} OK, ${failCount} failed.`});
                else toast({ title: "Commands Failed", description: `All ${failCount} action(s) failed.`, variant: "destructive"});
                setFeedbackMessage(resultSummary.trim()); setFeedbackType(failCount === 0 ? 'success' : 'error');
                if (deviceIdsToRefresh.length > 0 && onRefreshDeviceStates) {
                  setTimeout(() => {
                    const currentFeedback = feedbackMessage;
                    setFeedbackMessage(`Refreshing states...`); setFeedbackType('info');
                    onRefreshDeviceStates(deviceIdsToRefresh).finally(() => {
                        setFeedbackMessage(currentFeedback); setFeedbackType(failCount === 0 ? 'success' : 'error');
                        setIsProcessingCommand(false);
                    });
                  }, 1000); 
                } else { setIsProcessingCommand(false); }
            } catch (execError: any) {
                const msg = `API Error: ${execError.message}`;
                setFeedbackMessage(msg); setFeedbackType('error'); toast({ title: "API Error", description: msg, variant: "destructive" });
                setIsProcessingCommand(false);
            }
        } else if (genkitResponse.intentType !== 'query' && genkitResponse.intentType !== 'general') { // Handle unhandled intents
            setFeedbackMessage(`Unknown intent or no actions/query found.`); setFeedbackType('error'); setIsProcessingCommand(false);
        }
    };

    if (genkitResponse.intentType === 'action' && genkitResponse.suggestedConfirmation && speechSynthesisApiAvailable) {
        setFeedbackMessage(genkitResponse.suggestedConfirmation); setFeedbackType('speaking');
        speak(genkitResponse.suggestedConfirmation, () => {
             setFeedbackMessage(genkitResponse.suggestedConfirmation); setFeedbackType('info'); 
             executeAfterSpeakingConfirmation();
        });
    } else if (genkitResponse.intentType === 'query' && genkitResponse.suggestedConfirmation && genkitResponse.suggestedConfirmation.toLowerCase().includes("check")) {
        setFeedbackMessage(genkitResponse.suggestedConfirmation); setFeedbackType('speaking');
        speak(genkitResponse.suggestedConfirmation, () => { executeAfterSpeakingConfirmation(); });
    } else {
        executeAfterSpeakingConfirmation();
    }
  }, [toast, selectedDevices, speak, onRefreshDeviceStates, speechSynthesisApiAvailable, COMMAND_WAIT_TIMEOUT, feedbackMessage]); // Added feedbackMessage to deps

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        try {
          recognitionRef.current = new SpeechRecognitionAPI();
          if (recognitionRef.current) {
            recognitionRef.current.continuous = false; 
            recognitionRef.current.lang = 'en-US';
            recognitionRef.current.interimResults = false; 
            recognitionRef.current.maxAlternatives = 1;
            setSpeechRecognitionApiAvailable(true);
            setUserDesiredListening(true);
          }
        } catch (e: any) {
            setSpeechRecognitionApiAvailable(false);
            setMicPermissionError(e.name === 'SecurityError' || e.name === 'NotAllowedError' ? "Mic permission denied." : "Voice recognition init error.");
        }
      }
    } else {
      setSpeechRecognitionApiAvailable(false);
      setMicPermissionError("Voice recognition not supported.");
    }
    return () => { 
      if (recognitionRef.current && micActuallyActive) { try { recognitionRef.current.stop(); recognitionRef.current.abort(); } catch (e) {} }
      if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [micActuallyActive]); // Re-added micActuallyActive to re-init recognitionRef on certain errors.

  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;
    if (isProcessingCommand && !isWaitingForCommandAfterWakeWord) {
      if (micActuallyActive) try { currentRecognition.stop(); } catch (e) {}
      return; 
    }
    if (userDesiredListening && !micActuallyActive && !micPermissionError && !isProcessingCommand) {
      try { currentRecognition.start(); } catch (e: any) {
        if (e.name !== 'InvalidStateError') { 
          setMicPermissionError("Could not start mic."); setUserDesiredListening(false); 
        }
      }
    } else if ((!userDesiredListening || isProcessingCommand) && micActuallyActive) { 
      try { currentRecognition.stop();
        if (isWaitingForCommandAfterWakeWord) { setIsWaitingForCommandAfterWakeWord(false); if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current); }
      } catch (e: any) { if (e.name !== 'InvalidStateError') console.warn("Error stopping mic:", e); }
    }
  }, [userDesiredListening, isProcessingCommand, isWaitingForCommandAfterWakeWord, micActuallyActive, speechRecognitionApiAvailable, micPermissionError]);

  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;
    currentRecognition.onresult = (event: any) => {
      if (isProcessingCommandRef.current && !isWaitingForCommandAfterWakeWordRef.current) return;
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      handleInterpretAndExecuteCommand(transcript);
    };
    currentRecognition.onerror = (event: any) => {
      setMicActuallyActive(false); 
      let newMicPermissionError = micPermissionError;
      if (isWaitingForCommandAfterWakeWordRef.current) { setIsWaitingForCommandAfterWakeWord(false); if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current); }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { newMicPermissionError = "Mic access denied."; setUserDesiredListening(false); }
      else if (event.error === 'audio-capture') { newMicPermissionError = "Mic capture failed."; setUserDesiredListening(false); }
      else if (event.error !== 'no-speech' && event.error !== 'aborted') newMicPermissionError = `Voice error: ${event.error}.`;
      setMicPermissionError(newMicPermissionError);
      if (newMicPermissionError && (micPermissionError !== newMicPermissionError || event.error === 'network') && (event.error !== 'no-speech' && event.error !== 'aborted') ) {
        toast({ title: "Voice Error", description: newMicPermissionError || event.message || event.error, variant: "destructive" });
      }
    };
    currentRecognition.onstart = () => { setMicActuallyActive(true); setMicPermissionError(null); };
    currentRecognition.onend = () => { setMicActuallyActive(false); };
  }, [speechRecognitionApiAvailable, handleInterpretAndExecuteCommand, toast, micPermissionError]);

  const handleMicButtonClick = () => {
    if (!speechRecognitionApiAvailable) { toast({ title: "Voice Not Supported", variant: "destructive" }); return; }
    if (micPermissionError && !micActuallyActive) setMicPermissionError(null);
    if (isWaitingForCommandAfterWakeWord) { setIsWaitingForCommandAfterWakeWord(false); if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current); setFeedbackMessage("Command cancelled."); setFeedbackType("info"); }
    setUserDesiredListening(prev => !prev);
  };

  const handleSubmitTextCommand = (event: FormEvent) => {
    event.preventDefault();
    if (isProcessingCommand || !commandText.trim()) return;
    if (isWaitingForCommandAfterWakeWord) { setIsWaitingForCommandAfterWakeWord(false); if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current); }
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
    : !speechRecognitionApiAvailable ? "Voice recognition not available."
    : userDesiredListening ? (micActuallyActive ? `Listening... Say "${WAKE_WORD}" then command.` : "Microphone starting...")
    : "Voice control idle. Click mic or type command.";

  const feedbackIcon = () => {
    switch(feedbackType) {
      case 'success': return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-400" />;
      case 'info': return <Info className="h-5 w-5 text-blue-400" />;
      case 'speaking': return <Volume2 className="h-5 w-5 text-purple-400" />;
      case 'general': return <MessageSquare className="h-5 w-5 text-teal-400" />; // New icon for general
      default: return <Info className="h-5 w-5 text-blue-400" />;
    }
  };
  const feedbackTitle = () => {
     switch(feedbackType) {
      case 'success': return 'Success';
      case 'error': return 'Error';
      case 'info': return 'Information';
      case 'speaking': return 'Speaking';
      case 'general': return 'HomePilot says'; // New title for general
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
            {!speechSynthesisApiAvailable && speechRecognitionApiAvailable && " (Voice output N/A.)"}
            {isLoadingPreferences && " (Loading preferences...)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-2">
            <Button onClick={handleMicButtonClick} variant={userDesiredListening && micActuallyActive ? "destructive" : "outline"} size="lg"
              className={`p-4 rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 ${userDesiredListening && micActuallyActive ? 'animate-pulse bg-accent/30 border-accent' : 'border-primary/50'}`}
              aria-label={userDesiredListening ? "Stop listening" : "Start listening"}
              disabled={!speechRecognitionApiAvailable || (isProcessingCommand && !isWaitingForCommandAfterWakeWord)}
              title={!speechRecognitionApiAvailable ? "Voice N/A" : (userDesiredListening ? "Stop listening" : "Start listening")}>
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
              <CardHeader><CardTitle className="flex items-center text-xl"><Power className="h-5 w-5 mr-2" /> Action Command</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-base">
                <p><strong className="text-foreground">Summary:</strong> <span className="text-accent">{processedCommandDetails.summary || 'Executing...'}</span></p>
                <ul className="list-disc pl-5 space-y-1">
                  {processedCommandDetails.actions.map((act: any, index: number) => ( <li key={index}><span className="text-muted-foreground">{act.action}</span> <strong className="text-foreground">{act.device}</strong></li> ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {processedCommandDetails && processedCommandDetails.intentType === 'query' && (
             <Card className="mt-6 bg-card/80 border-border shadow-md">
              <CardHeader><CardTitle className="flex items-center text-xl"> {getDeviceIcon(selectedDevices.find(d => d.name === processedCommandDetails.queryTarget))} <span className="ml-2">Query: {processedCommandDetails.queryTarget}</span> </CardTitle></CardHeader>
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
                  : feedbackType === 'general' ? 'border-teal-500/50 bg-teal-900/20 text-teal-300' // New style for general
                  : 'border-blue-500/50 bg-blue-900/20 text-blue-300'
                }`}>
              {feedbackIcon()}
              <AlertTitle className={`ml-2 ${
                  feedbackType === 'success' ? 'text-green-200'
                  : feedbackType === 'error' ? 'text-red-200' 
                  : feedbackType === 'speaking' ? 'text-purple-200'
                  : feedbackType === 'general' ? 'text-teal-200' // New style for general
                  : 'text-blue-200'
                }`}>
                {feedbackTitle()}
              </AlertTitle>
              <AlertDescription className="ml-2 text-sm"> {feedbackMessage} </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="text-center">
          <p className="text-xs text-muted-foreground"> Dashboard devices update via API. Voice output quality varies. </p>
        </CardFooter>
      </Card>

      <div className="w-full max-w-2xl p-4 bg-card/50 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2 text-center text-foreground">Example Voice Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>`"{WAKE_WORD}"` (pause) `"turn on kitchen lights"`</li>
          <li>`"{WAKE_WORD} turn on main light and turn off table light"`</li>
          <li>`"{WAKE_WORD} what is the temperature?"`</li>
          <li>`"{WAKE_WORD} is the main light on?"`</li>
          <li>`"{WAKE_WORD} hello"`</li>
          <li>`"{WAKE_WORD} tell me something interesting"`</li>
        </ul>
         <h3 className="text-lg font-semibold mt-4 mb-2 text-center text-foreground">Example Typed Commands</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground text-center">
          <li>`"Turn on kitchen lights"`</li>
          <li>`"What is the temperature?"`</li>
          <li>`"Hello there"`</li>
        </ul>
      </div>
    </div>
  );
}
