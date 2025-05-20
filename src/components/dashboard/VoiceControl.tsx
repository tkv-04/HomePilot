
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
import { Mic, MicOff, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send, Info, Droplets, HelpCircle, Wind, Power, Volume2, MessageSquare } from 'lucide-react';
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
const COMMAND_WAIT_TIMEOUT = 6000; // 6 seconds

// Helper map for parsing device types from group commands
const deviceTypeKeywords: Record<string, Device['type']> = {
  lights: 'light',
  light: 'light',
  lamps: 'light',
  lamp: 'light',
  fans: 'fan',
  fan: 'fan',
  switches: 'switch',
  switch: 'switch',
  outlets: 'outlet',
  outlet: 'outlet',
};


export function VoiceControl({ selectedDevices, onRefreshDeviceStates }: VoiceControlProps) {
  const [commandText, setCommandText] = useState("");
  const [isProcessingCommand, setIsProcessingCommand] = useState(false); // True when Genkit/API call is active
  const [processedCommandDetails, setProcessedCommandDetails] = useState<any>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info' | 'speaking' | 'general' | null>(null);

  const [speechRecognitionApiAvailable, setSpeechRecognitionApiAvailable] = useState(false);
  const [speechSynthesisApiAvailable, setSpeechSynthesisApiAvailable] = useState(false);
  
  const [userDesiredListening, setUserDesiredListening] = useState(true); // User's intent to listen
  const [micActuallyActive, setMicActuallyActive] = useState(false); // Actual state of the browser's mic
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [isWaitingForCommandAfterWakeWord, setIsWaitingForCommandAfterWakeWord] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const { toast } = useToast();
  const { 
    preferences: userPreferences, 
    isLoading: isLoadingPreferences,
    rooms, 
    deviceGroups 
  } = useUserPreferences();
  
  const recognitionRef = useRef<MockSpeechRecognition | null>(null);
  const waitForCommandTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Ref for isWaitingForCommandAfterWakeWord, useful for the timeout callback
  const isWaitingForCommandAfterWakeWordRef = useRef(isWaitingForCommandAfterWakeWord);
  useEffect(() => { 
    isWaitingForCommandAfterWakeWordRef.current = isWaitingForCommandAfterWakeWord; 
  }, [isWaitingForCommandAfterWakeWord]);


  const populateVoices = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    }
  }, []);
  
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setSpeechSynthesisApiAvailable(true);
      populateVoices();
      window.speechSynthesis.onvoiceschanged = populateVoices;
    } else {
      setSpeechSynthesisApiAvailable(false);
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
      }
    };
  }, [populateVoices]);

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (!speechSynthesisApiAvailable || typeof window === 'undefined' || !window.speechSynthesis || isLoadingPreferences || !userPreferences) {
      onEndCallback?.();
      return;
    }
    try {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      const storedVoiceURI = userPreferences.selectedVoiceURI;
      
      if (storedVoiceURI && availableVoices.length > 0) {
        const voice = availableVoices.find(v => v.voiceURI === storedVoiceURI);
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
  }, [speechSynthesisApiAvailable, userPreferences, isLoadingPreferences, availableVoices]);

  const handleInterpretAndExecuteCommand = useCallback(async (fullTranscript: string) => {
    if (waitForCommandTimeoutRef.current) {
      clearTimeout(waitForCommandTimeoutRef.current);
      waitForCommandTimeoutRef.current = null;
    }

    const lowerCaseTranscript = fullTranscript.toLowerCase();
    let commandToInterpret = "";

    if (isWaitingForCommandAfterWakeWord) { 
      setFeedbackMessage(null); 
      setIsWaitingForCommandAfterWakeWord(false); 
      if (!fullTranscript.trim()) {
        setCommandText(""); setIsProcessingCommand(false); return;
      }
      commandToInterpret = fullTranscript.trim();
    } else if (lowerCaseTranscript.startsWith(WAKE_WORD.toLowerCase())) {
      const commandPartAfterWakeWord = fullTranscript.substring(WAKE_WORD.length).trim();
      if (!commandPartAfterWakeWord) {
        setFeedbackMessage(`"${WAKE_WORD}" detected. Waiting for your command...`); 
        setFeedbackType('info'); setCommandText(""); 
        setIsWaitingForCommandAfterWakeWord(true); 
        setIsProcessingCommand(false); // Not processing a full command yet
        if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        waitForCommandTimeoutRef.current = setTimeout(() => {
          if (isWaitingForCommandAfterWakeWordRef.current) { // Use ref for timeout check
            setFeedbackMessage(null); 
            setIsWaitingForCommandAfterWakeWord(false); setCommandText("");
          }
        }, COMMAND_WAIT_TIMEOUT);
        return;
      }
      commandToInterpret = commandPartAfterWakeWord;
    } else {
      setCommandText(fullTranscript); 
      setIsProcessingCommand(false); 
      return; 
    }

    setCommandText(commandToInterpret); 
    if (!commandToInterpret.trim()) {
      setFeedbackMessage(null); setCommandText(""); setIsProcessingCommand(false); return;
    }

    setIsProcessingCommand(true); // Genkit/API call starting
    setProcessedCommandDetails(null);
    setFeedbackMessage(`Interpreting: "${commandToInterpret}"`); setFeedbackType('info');

    let genkitResponse: InterpretVoiceCommandOutput;
    try {
      genkitResponse = await interpretVoiceCommand({ voiceCommand: commandToInterpret });
      setProcessedCommandDetails(genkitResponse); 
    } catch (error) {
      const msg = `Error: Could not interpret. ${error instanceof Error ? error.message : String(error)}`;
      setFeedbackMessage(msg); setFeedbackType('error');
      toast({ title: "Interpretation Error", description: `Failed: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
      setIsProcessingCommand(false); return;
    }
    
    const executeAfterConfirmation = async () => {
      if (genkitResponse.intentType === 'general') {
        if (genkitResponse.generalResponse) {
            setFeedbackMessage(genkitResponse.generalResponse); setFeedbackType('speaking');
            speak(genkitResponse.generalResponse, () => {
                setFeedbackMessage(genkitResponse.generalResponse); setFeedbackType('general'); 
                setIsProcessingCommand(false);
            });
        } else {
            setFeedbackMessage("I'm not sure how to respond to that."); setFeedbackType('info');
            setIsProcessingCommand(false);
        }
        return;
      }

      if (genkitResponse.intentType === 'query') {
        const queryTargetName = genkitResponse.queryTarget;
        const queryType = genkitResponse.queryType;
        if (!queryTargetName || !queryType) {
            setFeedbackMessage("Sorry, I couldn't understand what you're asking about."); setFeedbackType('error'); setIsProcessingCommand(false); return;
        }
        setFeedbackMessage(`Looking up: ${queryType} for ${queryTargetName}...`); setFeedbackType('info');
        
        const targetDevice = selectedDevices.find(
          d => d.name.toLowerCase().includes(queryTargetName.toLowerCase()) ||
               queryTargetName.toLowerCase().includes(d.name.toLowerCase()) ||
               d.id.toLowerCase() === queryTargetName.toLowerCase()
        );

        if (!targetDevice) {
          const notFoundMsg = `Device "${queryTargetName}" not found for query.`;
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
            } else { spokenResponse = `I couldn't find information for ${queryTargetName}.`; }
            
            setFeedbackMessage(spokenResponse); setFeedbackType('speaking');
            speak(spokenResponse, () => { 
                setFeedbackMessage(spokenResponse); setFeedbackType('success'); 
                setIsProcessingCommand(false);
            });
        }, targetDevice && onRefreshDeviceStates ? 500 : 0); 
        return;
      }

      if (genkitResponse.intentType === 'action' && genkitResponse.actions && genkitResponse.actions.length > 0) {
        if (selectedDevices.length === 0) {
            setFeedbackMessage("No devices selected on dashboard."); setFeedbackType('info'); setIsProcessingCommand(false); return;
        }
        
        let actionSummaryForDisplay = "";
        const commandsToExecute: DeviceCommand[] = [];

        for (const actionDetail of genkitResponse.actions) {
            const actionTargetLower = actionDetail.device.toLowerCase();
            const actionVerbLower = actionDetail.action.toLowerCase();
            let targetOnState: boolean | undefined;

            if (actionVerbLower.includes("turn on") || actionVerbLower.includes("activate")) targetOnState = true;
            else if (actionVerbLower.includes("turn off") || actionVerbLower.includes("deactivate")) targetOnState = false;
            
            if (targetOnState === undefined) {
                actionSummaryForDisplay += `Action "${actionDetail.action}" on "${actionDetail.device}" not supported. `;
                continue;
            }

            let devicesForThisAction: Device[] = [];
            let groupOrRoomProcessed = false;
            let matchedCustomName = "";

            if (userPreferences?.rooms) {
                const matchedRoom = userPreferences.rooms.find(room => room.name.toLowerCase() === actionTargetLower);
                if (matchedRoom) {
                    devicesForThisAction = selectedDevices.filter(d => matchedRoom.deviceIds.includes(d.id) && d.online);
                    matchedCustomName = `room "${matchedRoom.name}"`;
                    groupOrRoomProcessed = true;
                }
            }

            if (!groupOrRoomProcessed && userPreferences?.deviceGroups) {
                const matchedGroup = userPreferences.deviceGroups.find(group => group.name.toLowerCase() === actionTargetLower);
                if (matchedGroup) {
                    devicesForThisAction = selectedDevices.filter(d => matchedGroup.deviceIds.includes(d.id) && d.online);
                    matchedCustomName = `group "${matchedGroup.name}"`;
                    groupOrRoomProcessed = true;
                }
            }
            
            if (groupOrRoomProcessed) {
                 actionSummaryForDisplay += `${targetOnState ? 'Turning on' : 'Turning off'} devices in ${matchedCustomName}. `;
            } else { 
                if (actionTargetLower.startsWith("all ")) { 
                    const typeKeyword = actionTargetLower.substring(4).trim(); 
                    const appDeviceType = deviceTypeKeywords[typeKeyword];
                    if (appDeviceType) {
                        devicesForThisAction = selectedDevices.filter(d => d.type === appDeviceType && d.online);
                        actionSummaryForDisplay += `${targetOnState ? 'Turning on' : 'Turning off'} all ${typeKeyword}. `;
                    } else {
                        actionSummaryForDisplay += `Unknown general group "${actionDetail.device}". `;
                    }
                } else {
                    let parsedRoom = "";
                    let parsedTypeKeyword = "";
                    const words = actionTargetLower.split(" ");
                    const lastWord = words[words.length - 1];

                    if (deviceTypeKeywords[lastWord]) { 
                        parsedTypeKeyword = lastWord;
                        parsedRoom = words.slice(0, -1).join(" "); 
                    }

                    if (parsedRoom && parsedTypeKeyword) {
                        const appDeviceType = deviceTypeKeywords[parsedTypeKeyword];
                        devicesForThisAction = selectedDevices.filter(d => 
                            d.name.toLowerCase().includes(parsedRoom) && d.type === appDeviceType && d.online
                        );
                        actionSummaryForDisplay += `${targetOnState ? 'Turning on' : 'Turning off'} ${parsedRoom} ${parsedTypeKeyword}. `;
                    } else { 
                        const targetDevice = selectedDevices.find(
                            d => (d.name.toLowerCase().includes(actionTargetLower) ||
                                 actionTargetLower.includes(d.name.toLowerCase()) ||
                                 d.id.toLowerCase() === actionTargetLower) && d.online
                        );
                        if (targetDevice) {
                            devicesForThisAction.push(targetDevice);
                            actionSummaryForDisplay += `${targetOnState ? 'Turning on' : 'Turning off'} ${targetDevice.name}. `;
                        } else {
                            actionSummaryForDisplay += `Device "${actionDetail.device}" not found or is offline. `;
                        }
                    }
                }
            }

            devicesForThisAction.forEach(device => {
                if (!['light', 'switch', 'fan', 'outlet'].includes(device.type)) { 
                    actionSummaryForDisplay += `Cannot control ${device.name} (${device.type}). `; return;
                }
                commandsToExecute.push({
                    deviceId: device.id,
                    command: 'action.devices.commands.OnOff',
                    params: { on: targetOnState as boolean }
                });
            });
        }

        setProcessedCommandDetails({ intentType: 'action', actions: genkitResponse.actions, summary: actionSummaryForDisplay.trim() });

        if (commandsToExecute.length === 0) {
            const finalMsg = actionSummaryForDisplay || "No valid actions to execute.";
            setFeedbackMessage(finalMsg); 
            setFeedbackType(finalMsg.includes("not found") || finalMsg.includes("offline") || finalMsg.includes("not supported") ? 'error' : 'info');
            setIsProcessingCommand(false); return;
        }

        setFeedbackMessage(`Sending ${commandsToExecute.length} command(s): ${actionSummaryForDisplay.trim()}`); 
        setFeedbackType('info');

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
            
            const finalFeedbackMsg = resultSummary.trim() || (successCount > 0 ? "Actions completed." : "Actions failed.");
            setFeedbackMessage(finalFeedbackMsg); 
            const finalFeedbackType = failCount === 0 ? 'success' : (successCount > 0 ? 'info' : 'error');
            setFeedbackType(finalFeedbackType);
            
            if (deviceIdsToRefresh.length > 0 && onRefreshDeviceStates) {
              setTimeout(() => { // Give a moment for bridge to update state if it's slow
                setFeedbackMessage(`Refreshing states for ${deviceIdsToRefresh.length} device(s)...`); setFeedbackType('info');
                onRefreshDeviceStates(deviceIdsToRefresh).finally(() => {
                    setFeedbackMessage(finalFeedbackMsg); setFeedbackType(finalFeedbackType); 
                    setIsProcessingCommand(false);
                });
              }, 1000); 
            } else { setIsProcessingCommand(false); }
        } catch (execError: any) {
            const msg = `API Error: ${execError.message}`;
            setFeedbackMessage(msg); setFeedbackType('error'); toast({ title: "API Error", description: msg, variant: "destructive" });
            setIsProcessingCommand(false);
        }
      } else if (genkitResponse.intentType !== 'query' && genkitResponse.intentType !== 'general') { 
          setFeedbackMessage(`Unknown intent or no actions/query found.`); setFeedbackType('error'); setIsProcessingCommand(false);
      }
    };

    if (genkitResponse.suggestedConfirmation && (genkitResponse.intentType === 'action' || (genkitResponse.intentType === 'query' && genkitResponse.suggestedConfirmation.toLowerCase().includes("check")))) {
       setFeedbackMessage(genkitResponse.suggestedConfirmation);
       setFeedbackType('info'); // Don't speak this confirmation for actions, only queries if speech is desired
       if (genkitResponse.intentType === 'query' && speechSynthesisApiAvailable && userPreferences?.selectedVoiceURI){
           speak(genkitResponse.suggestedConfirmation, executeAfterConfirmation);
       } else {
           executeAfterConfirmation();
       }
    } else {
        executeAfterConfirmation();
    }
  }, [
      toast, selectedDevices, speak, onRefreshDeviceStates, 
      speechSynthesisApiAvailable, userPreferences, isLoadingPreferences, availableVoices, 
      rooms, deviceGroups, commandText, 
      isWaitingForCommandAfterWakeWord, // state dependency
      setIsWaitingForCommandAfterWakeWord, setIsProcessingCommand, setCommandText, 
      setFeedbackMessage, setFeedbackType, setProcessedCommandDetails // setters
    ]);

  // Effect to initialize SpeechRecognition and set its static properties
  useEffect(() => {
    const SpeechRecognitionAPI = (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition) : undefined;
    if (SpeechRecognitionAPI) {
      try {
        if (!recognitionRef.current) {
          recognitionRef.current = new SpeechRecognitionAPI();
          recognitionRef.current.continuous = false; 
          recognitionRef.current.lang = 'en-US';
          recognitionRef.current.interimResults = false; 
          recognitionRef.current.maxAlternatives = 1;
          setSpeechRecognitionApiAvailable(true);
        }
      } catch (e: any) {
          console.error("Speech recognition init error:", e);
          setSpeechRecognitionApiAvailable(false);
          setMicPermissionError(e.name === 'SecurityError' || e.name === 'NotAllowedError' ? "Mic permission denied." : "Voice recognition init error.");
      }
    } else {
      setSpeechRecognitionApiAvailable(false);
      setMicPermissionError("Voice recognition not supported by this browser.");
    }
    // Cleanup function for when the component unmounts
    return () => { 
      if (recognitionRef.current) { 
        try { 
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onstart = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop(); 
          recognitionRef.current.abort(); 
        } catch (e) { /* ignore */ } 
      }
      if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []); // Runs once on mount

  // Effect to manage SpeechRecognition event handlers - re-runs if these key states/callbacks change
  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;

    currentRecognition.onresult = (event: any) => {
      if ((isProcessingCommand && !isWaitingForCommandAfterWakeWord) || !userDesiredListening) {
        return; 
      }
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (isWaitingForCommandAfterWakeWord || transcript.toLowerCase().startsWith(WAKE_WORD.toLowerCase())) {
        handleInterpretAndExecuteCommand(transcript);
      }
    };

    currentRecognition.onerror = (event: any) => {
      setMicActuallyActive(false); 
      let newMicPermissionError = micPermissionError; 
      if (isWaitingForCommandAfterWakeWord) { 
        setIsWaitingForCommandAfterWakeWord(false); 
        if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        setFeedbackMessage(null);
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { newMicPermissionError = "Mic access denied. Enable in browser."; setUserDesiredListening(false); }
      else if (event.error === 'audio-capture') { newMicPermissionError = "Mic capture failed."; setUserDesiredListening(false); }
      else if (event.error === 'network') { newMicPermissionError = "Network error for speech.";}
      else if (event.error !== 'no-speech' && event.error !== 'aborted') newMicPermissionError = `Voice error: ${event.error}.`;
      
      if (newMicPermissionError && (micPermissionError !== newMicPermissionError || event.error === 'network') && (event.error !== 'no-speech' && event.error !== 'aborted') ) {
        setMicPermissionError(newMicPermissionError);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            toast({ title: "Voice Error", description: newMicPermissionError || event.message || event.error, variant: "destructive" });
        }
      }
    };
    currentRecognition.onstart = () => { setMicActuallyActive(true); setMicPermissionError(null); };
    currentRecognition.onend = () => {
      setMicActuallyActive(false);
      // The main useEffect below will handle restart logic.
    };
  }, [
      speechRecognitionApiAvailable, handleInterpretAndExecuteCommand, toast, 
      micPermissionError, userDesiredListening, 
      isProcessingCommand, isWaitingForCommandAfterWakeWord, // Key states
      setMicActuallyActive, setMicPermissionError, setIsWaitingForCommandAfterWakeWord, 
      setFeedbackMessage, // Setters used in handlers
      COMMAND_WAIT_TIMEOUT // For timeout logic within handlers if any
    ]);

  // Effect to start/stop mic based on component state
  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;

    const shouldBeListening = userDesiredListening && !micPermissionError && (!isProcessingCommand || isWaitingForCommandAfterWakeWord);

    if (shouldBeListening && !micActuallyActive) {
      try {
        currentRecognition.start();
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') { 
          console.warn("Error starting mic in useEffect:", e);
          if (!micPermissionError) setMicPermissionError("Could not (re)start mic. Try toggling."); 
        }
      }
    } else if (!shouldBeListening && micActuallyActive) { 
      try {
        currentRecognition.stop();
        if (isWaitingForCommandAfterWakeWord) { 
          setIsWaitingForCommandAfterWakeWord(false);
          if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
          setFeedbackMessage("Command input cancelled."); setFeedbackType("info");
        }
      } catch (e: any) { 
        if (e.name !== 'InvalidStateError') console.warn("Error stopping mic in useEffect:", e);
      }
    }
  }, [userDesiredListening, isProcessingCommand, isWaitingForCommandAfterWakeWord, micActuallyActive, speechRecognitionApiAvailable, micPermissionError]);

  const handleMicButtonClick = () => {
    if (!speechRecognitionApiAvailable) { 
      toast({ title: "Voice Not Supported", description: "Browser doesn't support speech recognition.", variant: "destructive" }); 
      return; 
    }
    if (micPermissionError && !micActuallyActive) { 
        setMicPermissionError(null); 
    }
    if (isWaitingForCommandAfterWakeWord) { 
      setIsWaitingForCommandAfterWakeWord(false); 
      if(waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current); 
      setFeedbackMessage("Command input cancelled."); setFeedbackType("info"); 
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
    const commandToSubmit = commandText.toLowerCase().startsWith(WAKE_WORD.toLowerCase()) 
                            ? commandText 
                            : `${WAKE_WORD} ${commandText}`; 
    handleInterpretAndExecuteCommand(commandToSubmit);
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
      case 'general': return <MessageSquare className="h-5 w-5 text-teal-400" />;
      default: return <Info className="h-5 w-5 text-blue-400" />; 
    }
  };
  const feedbackTitle = () => {
     switch(feedbackType) {
      case 'success': return 'Success';
      case 'error': return 'Error';
      case 'info': return 'Information';
      case 'speaking': return 'HomePilot Speaking';
      case 'general': return 'HomePilot says';
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
                <p><strong className="text-foreground">Interpreted:</strong> <span className="text-accent">{processedCommandDetails.summary || 'Processing action...'}</span></p>
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
                  : feedbackType === 'general' ? 'border-teal-500/50 bg-teal-900/20 text-teal-300'
                  : 'border-blue-500/50 bg-blue-900/20 text-blue-300' 
                }`}>
              {feedbackIcon()}
              <AlertTitle className={`ml-2 ${ 
                  feedbackType === 'success' ? 'text-green-200'
                  : feedbackType === 'error' ? 'text-red-200' 
                  : feedbackType === 'speaking' ? 'text-purple-200'
                  : feedbackType === 'general' ? 'text-teal-200'
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
          <li>`"{WAKE_WORD} turn on Main Light and turn off Table Light"`</li>
          <li>`"{WAKE_WORD} turn off all fans"`</li>
          <li>`"{WAKE_WORD} turn on the Office devices"` (if 'Office' is a room/group)</li>
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

    