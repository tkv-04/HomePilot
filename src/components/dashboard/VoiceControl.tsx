
// src/components/dashboard/VoiceControl.tsx
"use client";

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import type { InterpretVoiceCommandOutput, SingleDeviceAction } from '@/ai/flows/interpret-voice-command';
import { interpretVoiceCommand } from '@/ai/flows/interpret-voice-command';
import { executeDeviceCommandsOnApi, type DeviceCommand } from '@/services/homeAssistantService';
import type { Device } from '@/types/home-assistant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mic, MicOff, Loader2, CheckCircle2, XCircle, Lightbulb, Thermometer, Tv2, Lock, Send, Info, Droplets, HelpCircle, Wind, Power, Volume2, MessageSquare, TimerIcon } from 'lucide-react';
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

export function VoiceControl({ selectedDevices, onRefreshDeviceStates }: VoiceControlProps) {
  const [commandText, setCommandText] = useState("");
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [processedCommandDetails, setProcessedCommandDetails] = useState<any>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info' | 'speaking' | 'general' | 'timer' | null>(null);

  const [speechRecognitionApiAvailable, setSpeechRecognitionApiAvailable] = useState(false);
  const [speechSynthesisApiAvailable, setSpeechSynthesisApiAvailable] = useState(false);

  const [userDesiredListening, setUserDesiredListening] = useState(true);
  const [micActuallyActive, setMicActuallyActive] = useState(false);
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
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US'; 
      utterance.rate = 0.9;
      
      const storedVoiceURI = userPreferences.selectedVoiceURI;
      if (storedVoiceURI && availableVoices.length > 0) {
        const voice = availableVoices.find(v => v.voiceURI === storedVoiceURI);
        if (voice) { 
          utterance.voice = voice; 
          utterance.lang = voice.lang; // Use the language of the selected voice
        }
      }

      utterance.onerror = (event) => {
        console.error("SpeechSynthesis Error:", event.error);
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
      setCommandText(commandToInterpret); // Show the command part in the input field
    } else if (lowerCaseTranscript.startsWith(WAKE_WORD.toLowerCase())) {
      const commandPartAfterWakeWord = fullTranscript.substring(WAKE_WORD.length).trim();
      if (!commandPartAfterWakeWord) {
        setFeedbackMessage(null); // Clear previous feedback
        setFeedbackMessage(`"${WAKE_WORD}" detected. Waiting for your command...`); 
        setFeedbackType('info'); setCommandText(""); 
        setIsWaitingForCommandAfterWakeWord(true);
        setIsProcessingCommand(false); 
        if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        waitForCommandTimeoutRef.current = setTimeout(() => {
          if (isWaitingForCommandAfterWakeWordRef.current) { // Check ref here
            setFeedbackMessage(null); 
            setIsWaitingForCommandAfterWakeWord(false); setCommandText("");
          }
        }, COMMAND_WAIT_TIMEOUT);
        return;
      }
      commandToInterpret = commandPartAfterWakeWord;
      setCommandText(commandToInterpret); // Show the command part in the input field
    } else {
      setCommandText(fullTranscript); 
      setIsProcessingCommand(false);
      return;
    }
    
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
      const msg = `Error: Could not interpret. ${error instanceof Error ? error.message : String(error)}`;
      setFeedbackMessage(msg); setFeedbackType('error');
      toast({ title: "Interpretation Error", description: `Failed: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
      setIsProcessingCommand(false); return;
    }
    
    const executeAfterOptionalConfirmation = async () => {
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
          setFeedbackMessage(notFoundMsg); setFeedbackType('error'); setIsProcessingCommand(false); 
          if (userPreferences?.selectedVoiceURI && speechSynthesisApiAvailable) { speak(notFoundMsg); }
          return;
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
          setFeedbackMessage("No devices selected on dashboard to control."); setFeedbackType('info'); setIsProcessingCommand(false); return;
        }
        
        let actionSummaryForDisplay = "";
        const commandsToExecute: DeviceCommand[] = [];
        const timedActionsToSchedule: Array<{ device: Device, actionDetail: SingleDeviceAction, targetOnState: boolean, actionSummary: string }> = [];

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

          const matchedRoom = rooms?.find(room => room.name.toLowerCase() === actionTargetLower);
          if (matchedRoom) {
            devicesForThisAction = selectedDevices.filter(d => matchedRoom.deviceIds.includes(d.id) && d.online);
            matchedCustomName = `room "${matchedRoom.name}"`;
            groupOrRoomProcessed = true;
          }

          if (!groupOrRoomProcessed) {
            const matchedGroup = deviceGroups?.find(group => group.name.toLowerCase() === actionTargetLower);
            if (matchedGroup) {
              devicesForThisAction = selectedDevices.filter(d => matchedGroup.deviceIds.includes(d.id) && d.online);
              matchedCustomName = `group "${matchedGroup.name}"`;
              groupOrRoomProcessed = true;
            }
          }
          
          let currentActionSummarySegment = "";
          if (groupOrRoomProcessed) {
            currentActionSummarySegment = `${targetOnState ? 'Turning on' : 'Turning off'} devices in ${matchedCustomName}. `;
          } else { 
            if (actionTargetLower.startsWith("all ")) {
              const typeKeyword = actionTargetLower.substring(4).trim();
              const deviceTypeKeywords: Record<string, Device['type']> = { lights: 'light', light: 'light', lamps: 'light', lamp: 'light', fans: 'fan', fan: 'fan', switches: 'switch', switch: 'switch', outlets: 'outlet', outlet: 'outlet' };
              const appDeviceType = deviceTypeKeywords[typeKeyword];
              if (appDeviceType) {
                devicesForThisAction = selectedDevices.filter(d => d.type === appDeviceType && d.online);
                currentActionSummarySegment = `${targetOnState ? 'Turning on' : 'Turning off'} all ${typeKeyword}. `;
              } else {
                currentActionSummarySegment = `Unknown general group "${actionDetail.device}". `;
              }
            } else {
              let parsedRoom = "";
              let parsedTypeKeyword = "";
              const words = actionTargetLower.split(" ");
              const lastWord = words[words.length - 1];
              const deviceTypeKeywords: Record<string, Device['type']> = { lights: 'light', light: 'light', lamps: 'light', lamp: 'light', fans: 'fan', fan: 'fan', switches: 'switch', switch: 'switch', outlets: 'outlet', outlet: 'outlet' };
              if (deviceTypeKeywords[lastWord]) {
                  parsedTypeKeyword = lastWord;
                  parsedRoom = words.slice(0, -1).join(" ");
              }

              if (parsedRoom && parsedTypeKeyword) {
                  const appDeviceType = deviceTypeKeywords[parsedTypeKeyword];
                  devicesForThisAction = selectedDevices.filter(d => 
                      d.name.toLowerCase().includes(parsedRoom) && d.type === appDeviceType && d.online
                  );
                  currentActionSummarySegment = `${targetOnState ? 'Turning on' : 'Turning off'} ${parsedRoom} ${parsedTypeKeyword}. `;
              } else { 
                const targetDevice = selectedDevices.find(
                  d => (d.name.toLowerCase().includes(actionTargetLower) || 
                        actionTargetLower.includes(d.name.toLowerCase()) || 
                        d.id.toLowerCase() === actionTargetLower) && d.online
                );
                if (targetDevice) {
                  devicesForThisAction.push(targetDevice);
                  currentActionSummarySegment = `${targetOnState ? 'Turning on' : 'Turning off'} ${targetDevice.name}. `;
                } else {
                  currentActionSummarySegment = `Device "${actionDetail.device}" not found or is offline. `;
                }
              }
            }
          }
          actionSummaryForDisplay += currentActionSummarySegment;

          devicesForThisAction.forEach(device => {
            if (!['light', 'switch', 'fan', 'outlet'].includes(device.type)) {
              actionSummaryForDisplay += `Cannot control ${device.name} (${device.type}). `; return;
            }
            if (actionDetail.delayInSeconds && actionDetail.delayInSeconds > 0) {
              timedActionsToSchedule.push({ device, actionDetail, targetOnState: targetOnState as boolean, actionSummary: currentActionSummarySegment });
            } else if (actionDetail.targetExecutionTime) {
              timedActionsToSchedule.push({ device, actionDetail, targetOnState: targetOnState as boolean, actionSummary: currentActionSummarySegment });
            }
            else {
              commandsToExecute.push({
                deviceId: device.id,
                command: 'action.devices.commands.OnOff',
                params: { on: targetOnState as boolean }
              });
            }
          });
        }

        setProcessedCommandDetails({ intentType: 'action', actions: genkitResponse.actions, summary: actionSummaryForDisplay.trim() });

        if (commandsToExecute.length > 0) {
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
            if (successCount > 0 && failCount === 0) toast({ title: "Commands Successful", description: `${successCount} action(s) sent.` });
            else if (successCount > 0 && failCount > 0) toast({ title: "Some Commands Sent", description: `${successCount} OK, ${failCount} failed.` });
            else toast({ title: "Commands Failed", description: `All ${failCount} action(s) failed.`, variant: "destructive" });

            const finalFeedbackMsg = resultSummary.trim() || (successCount > 0 ? "Immediate actions completed." : "Immediate actions failed.");
            setFeedbackMessage(finalFeedbackMsg);
            const finalFeedbackType = failCount === 0 ? 'success' : (successCount > 0 ? 'info' : 'error');
            setFeedbackType(finalFeedbackType);

            if (deviceIdsToRefresh.length > 0 && onRefreshDeviceStates) {
              setFeedbackMessage(`Refreshing states for ${deviceIdsToRefresh.length} device(s)...`); setFeedbackType('info');
              await onRefreshDeviceStates(deviceIdsToRefresh);
              setFeedbackMessage(finalFeedbackMsg); setFeedbackType(finalFeedbackType); 
            }
          } catch (execError: any) {
            const msg = `API Error executing immediate commands: ${execError.message}`;
            setFeedbackMessage(msg); setFeedbackType('error'); toast({ title: "API Error", description: msg, variant: "destructive" });
          }
        }

        let timerSchedulingFeedback = "";
        if (timedActionsToSchedule.length > 0 && process.env.NEXT_PUBLIC_TIMER_SERVICE_BASE_URL) {
            setFeedbackType('timer'); 
            for (const { device, actionDetail, targetOnState, actionSummary } of timedActionsToSchedule) {
                const timerPayload: {
                    deviceId: string;
                    action: "turn_on" | "turn_off";
                    delayInSeconds?: number;
                    targetExecutionTime?: string;
                } = {
                    deviceId: device.id,
                    action: targetOnState ? "turn_on" : "turn_off",
                };

                if (actionDetail.targetExecutionTime) {
                    timerPayload.targetExecutionTime = actionDetail.targetExecutionTime;
                } else if (actionDetail.delayInSeconds && actionDetail.delayInSeconds > 0) {
                    timerPayload.delayInSeconds = actionDetail.delayInSeconds;
                } else {
                    continue; 
                }
                
                try {
                    const response = await fetch(`${process.env.NEXT_PUBLIC_TIMER_SERVICE_BASE_URL}/schedule-task`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(timerPayload),
                    });
                    if (response.ok) {
                        const responseData = await response.json();
                        const scheduledFor = actionDetail.targetExecutionTime 
                            ? `for ${new Date(actionDetail.targetExecutionTime).toLocaleString()}` 
                            : `in ${actionDetail.delayInSeconds} seconds`;
                        toast({
                            title: "Timer Scheduled",
                            description: `${actionSummary.trim()} scheduled ${scheduledFor} with server (ID: ${responseData.taskId}).`,
                        });
                        timerSchedulingFeedback += `${actionSummary.trim()} scheduled ${scheduledFor}. `;
                    } else {
                        const errorData = await response.text();
                        toast({
                            title: "Timer Scheduling Failed",
                            description: `Could not schedule: ${actionSummary.trim()}. Server: ${errorData}`,
                            variant: "destructive",
                        });
                        timerSchedulingFeedback += `Failed to schedule ${actionSummary.trim()}. `;
                    }
                } catch (scheduleError: any) {
                    toast({
                        title: "Timer Scheduling Error",
                        description: `Could not schedule: ${actionSummary.trim()}. Error: ${scheduleError.message}`,
                        variant: "destructive",
                    });
                    timerSchedulingFeedback += `Error scheduling ${actionSummary.trim()}. `;
                }
            }
        } else if (timedActionsToSchedule.length > 0 && !process.env.NEXT_PUBLIC_TIMER_SERVICE_BASE_URL) {
            timerSchedulingFeedback = "Timer service URL not configured. Cannot schedule timed actions.";
            toast({ title: "Timer Service Error", description: timerSchedulingFeedback, variant: "destructive" });
            setFeedbackType('error');
        }

        if (timerSchedulingFeedback) {
            setFeedbackMessage(prev => (prev && commandsToExecute.length > 0 ? `${prev} ${timerSchedulingFeedback.trim()}` : timerSchedulingFeedback.trim()));
             if (!commandsToExecute.length) setFeedbackType('timer'); 
        }

        if (commandsToExecute.length === 0 && timedActionsToSchedule.length === 0) {
          const finalMsg = actionSummaryForDisplay || "No valid actions to execute.";
          setFeedbackMessage(finalMsg);
          setFeedbackType(finalMsg.includes("not found") || finalMsg.includes("offline") || finalMsg.includes("not supported") ? 'error' : 'info');
        }
        
        setIsProcessingCommand(false); 

      } else if (genkitResponse.intentType !== 'query' && genkitResponse.intentType !== 'general') {
        setFeedbackMessage(`Unknown intent or no actions/query found.`); setFeedbackType('error'); setIsProcessingCommand(false);
      }
    };
    
    if (genkitResponse.suggestedConfirmation &&
      (genkitResponse.intentType === 'action' || genkitResponse.intentType === 'query')) {
      if (userPreferences?.selectedVoiceURI && speechSynthesisApiAvailable) {
        setFeedbackMessage(genkitResponse.suggestedConfirmation); 
        setFeedbackType('speaking');
        speak(genkitResponse.suggestedConfirmation, executeAfterOptionalConfirmation);
      } else {
        setFeedbackMessage(genkitResponse.suggestedConfirmation); 
        setFeedbackType('info');
        executeAfterOptionalConfirmation(); 
      }
    } else {
      executeAfterOptionalConfirmation(); 
    }
  }, [
    toast, selectedDevices, speak, onRefreshDeviceStates, 
    speechSynthesisApiAvailable, userPreferences, isLoadingPreferences, availableVoices,
    rooms, deviceGroups, 
    isWaitingForCommandAfterWakeWord, 
    setIsWaitingForCommandAfterWakeWord, setIsProcessingCommand, setCommandText, 
    setFeedbackMessage, setFeedbackType, setProcessedCommandDetails
  ]);


  useEffect(() => {
    const SpeechRecognitionAPI = (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition) : undefined;
    if (SpeechRecognitionAPI) {
      try {
        if (!recognitionRef.current) {
          recognitionRef.current = new SpeechRecognitionAPI();
          setSpeechRecognitionApiAvailable(true);
        }
        recognitionRef.current.continuous = false; 
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.interimResults = false; 
        recognitionRef.current.maxAlternatives = 1;
      } catch (e: any) {
        console.error("Speech recognition init error:", e);
        setSpeechRecognitionApiAvailable(false);
        setMicPermissionError(e.name === 'SecurityError' || e.name === 'NotAllowedError' ? "Mic permission denied." : "Voice recognition init error.");
      }
    } else {
      setSpeechRecognitionApiAvailable(false);
      setMicPermissionError("Voice recognition not supported by this browser.");
    }
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
  }, []); 


  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;

    currentRecognition.onresult = (event: any) => {
      if ((isProcessingCommand && !isWaitingForCommandAfterWakeWordRef.current) || !userDesiredListening) { 
        return; 
      }
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      handleInterpretAndExecuteCommand(transcript);
    };

    currentRecognition.onerror = (event: any) => {
      setMicActuallyActive(false);
      let newMicPermissionError = micPermissionError; 
      if (isWaitingForCommandAfterWakeWordRef.current) { 
        setIsWaitingForCommandAfterWakeWord(false);
        if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
        setFeedbackMessage(null); 
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { newMicPermissionError = "Mic access denied. Enable in browser."; setUserDesiredListening(false); }
      else if (event.error === 'audio-capture') { newMicPermissionError = "Mic capture failed."; setUserDesiredListening(false); }
      else if (event.error === 'network') { newMicPermissionError = "Network error for speech."; }
      else if (event.error !== 'no-speech' && event.error !== 'aborted') newMicPermissionError = `Voice error: ${event.error}.`;

      if (newMicPermissionError && (micPermissionError !== newMicPermissionError || event.error === 'network') && (event.error !== 'no-speech' && event.error !== 'aborted')) {
        setMicPermissionError(newMicPermissionError);
        if(event.error !== 'no-speech' && event.error !== 'aborted'){
          toast({ title: "Voice Error", description: newMicPermissionError || event.message || event.error, variant: "destructive" });
        }
      }
    };
    currentRecognition.onstart = () => { setMicActuallyActive(true); setMicPermissionError(null); };
    currentRecognition.onend = () => {
      setMicActuallyActive(false);
    };
  }, [
    speechRecognitionApiAvailable, handleInterpretAndExecuteCommand, toast, 
    micPermissionError, userDesiredListening, 
    isProcessingCommand, isWaitingForCommandAfterWakeWord, 
    setMicActuallyActive, setMicPermissionError, setIsWaitingForCommandAfterWakeWord, 
    setFeedbackMessage,
    // Ensure all state setters used in handlers are included or the handlers themselves are stable
  ]);


  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (!currentRecognition || !speechRecognitionApiAvailable) return;

    const shouldBeListening = userDesiredListening && !micPermissionError && (!isProcessingCommand || isWaitingForCommandAfterWakeWordRef.current);

    if (shouldBeListening && !micActuallyActive) {
      try {
        currentRecognition.start();
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') {
          console.warn("Error starting mic in useEffect:", e);
          if(!micPermissionError) setMicPermissionError("Could not (re)start mic. Try toggling.");
        }
      }
    } else if (!shouldBeListening && micActuallyActive) {
      try {
        currentRecognition.stop();
        if (isWaitingForCommandAfterWakeWordRef.current) {
          setIsWaitingForCommandAfterWakeWord(false);
          if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
          setFeedbackMessage("Command input cancelled."); setFeedbackType("info");
        }
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') console.warn("Error stopping mic in useEffect:", e);
      }
    }
  }, [userDesiredListening, isProcessingCommand, micActuallyActive, speechRecognitionApiAvailable, micPermissionError, setIsWaitingForCommandAfterWakeWord, setFeedbackMessage, setFeedbackType]);


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
      if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
      setFeedbackMessage("Command input cancelled."); setFeedbackType("info");
    }
    setUserDesiredListening(prev => !prev);
  };

  const handleSubmitTextCommand = (event: FormEvent) => {
    event.preventDefault();
    if (isProcessingCommand || !commandText.trim()) return;
    if (isWaitingForCommandAfterWakeWord) {
      setIsWaitingForCommandAfterWakeWord(false);
      if (waitForCommandTimeoutRef.current) clearTimeout(waitForCommandTimeoutRef.current);
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
      case 'timer': return <TimerIcon className="h-5 w-5 text-orange-400" />;
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
      case 'timer': return 'Timer Information';
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
                {processedCommandDetails.actions.map((act: SingleDeviceAction, index: number) => {
                    if (act.delayInSeconds) {
                        const delayUnit = act.delayInSeconds < 120 ? "second" : "minute";
                        const delayValue = delayUnit === "second" ? act.delayInSeconds : Math.round(act.delayInSeconds / 60);
                        return (
                            <p key={index} className="text-sm text-muted-foreground">
                            <TimerIcon className="inline h-4 w-4 mr-1" /> Action for "{act.device}" scheduled with server in {delayValue} {delayUnit}{delayValue !== 1 ? 's' : ''}.
                            </p>
                        );
                    } else if (act.targetExecutionTime) {
                         return (
                            <p key={index} className="text-sm text-muted-foreground">
                            <TimerIcon className="inline h-4 w-4 mr-1" /> Action for "{act.device}" scheduled with server for {new Date(act.targetExecutionTime).toLocaleString()}.
                            </p>
                        );
                    }
                    return null;
                })}
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
                : feedbackType === 'timer' ? 'border-orange-500/50 bg-orange-900/20 text-orange-300'
                : 'border-blue-500/50 bg-blue-900/20 text-blue-300' 
              }`}>
              {feedbackIcon()}
              <AlertTitle className={`ml-2 ${
                feedbackType === 'success' ? 'text-green-200'
                : feedbackType === 'error' ? 'text-red-200'
                : feedbackType === 'speaking' ? 'text-purple-200'
                : feedbackType === 'general' ? 'text-teal-200'
                : feedbackType === 'timer' ? 'text-orange-200'
                : 'text-blue-200'
              }`}>
                {feedbackTitle()}
              </AlertTitle>
              <AlertDescription className="ml-2 text-sm"> {feedbackMessage} </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="text-center">
          <p className="text-xs text-muted-foreground"> Dashboard devices update via API. Voice output quality varies. Timers are server-side. </p>
        </CardFooter>
      </Card>
    </div>
  );
}
