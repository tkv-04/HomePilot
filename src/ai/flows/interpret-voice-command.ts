
'use server';
/**
 * @fileOverview This file defines a Genkit flow to interpret voice commands for home automation
 * or general conversation. It can understand single queries, multiple actions on devices (including groups, rooms),
 * actions with a delay (timers), or respond to general chitchat, including telling the time and
 * answering general knowledge questions.
 *
 * - interpretVoiceCommand - A function that takes a voice command as input and returns an
 *   actionable command, query for Home Assistant, or a general conversational response.
 * - InterpretVoiceCommandInput - The input type for the interpretVoiceCommand function.
 * - InterpretVoiceCommandOutput - The return type for the interpretVoiceCommand function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {getCurrentTimeTool} from '@/ai/tools/get-current-time-tool';

const InterpretVoiceCommandInputSchema = z.object({
  voiceCommand: z.string().describe('The voice command to interpret.'),
});
export type InterpretVoiceCommandInput = z.infer<
  typeof InterpretVoiceCommandInputSchema
>;

const SingleDeviceActionSchema = z.object({
  device: z.string().describe('The target device, room, or group for the action. This can be a specific device name (e.g., "kitchen light"), a general group (e.g., "all lights", "all fans"), a room-specific group (e.g., "living room lights", "bedroom fan"), or a user-defined room or group name (e.g., "Office", "Downstairs Lights").'),
  action: z.string().describe('The action to perform on the device or group (e.g., "turn on", "turn off"). Make this concise.'),
  delayInSeconds: z.number().optional().describe('The delay in seconds before the action should be performed, if a delay was specified in the command (e.g., "in 5 minutes", "after 1 hour"). If no delay, this field is absent.'),
});

const InterpretVoiceCommandOutputSchema = z.object({
  intentType: z.enum(['action', 'query', 'general']).describe('The type of intent: "action" to perform on device(s)/group(s), "query" to get information, or "general" for conversational responses.'),
  actions: z.array(SingleDeviceActionSchema).optional().describe('A list of actions to perform on devices or groups. Used when intentType is "action". If multiple distinct actions/devices/rooms/groups are mentioned, list them all here. For group commands like "turn on all lights", this array will contain one entry with device="all lights". For a command like "turn on the office lights", if "Office" is a known room or group, the device might be "Office". If a delay is specified (e.g., "in 5 minutes"), include delayInSeconds for each relevant action.'),
  queryTarget: z.string().optional().describe('The target device or topic for the query (e.g., "kitchen light", "living room temperature sensor", "Office temperature"). Used when intentType is "query".'),
  queryType: z.string().optional().describe('The type of information requested (e.g.,"get temperature", "get status", "is on"). Used when intentType is "query". Make this concise.'),
  suggestedConfirmation: z.string().optional().describe('A polite, natural language phrase confirming the understood command if it is an "action" or "query". e.g., "Okay, turning on all kitchen lights." or "Okay, I will turn on the fan in 10 minutes." or "Let me check that for you." This field should NOT be populated if intentType is "general".'),
  generalResponse: z.string().optional().describe('A conversational response if the command is not a home automation action or query (i.e., intentType is "general"). This can include answers to questions like "what time is it?" or answers to general knowledge questions. If the request is to set a timer for a device, this field should be empty or brief, as the confirmation will be in suggestedConfirmation.'),
});

export type InterpretVoiceCommandOutput = z.infer<
  typeof InterpretVoiceCommandOutputSchema
>;

export async function interpretVoiceCommand(
  input: InterpretVoiceCommandInput
): Promise<InterpretVoiceCommandOutput> {
  return interpretVoiceCommandFlow(input);
}

const prompt = ai.definePrompt({
  name: 'interpretVoiceCommandPrompt',
  input: {schema: InterpretVoiceCommandInputSchema},
  output: {schema: InterpretVoiceCommandOutputSchema},
  tools: [getCurrentTimeTool],
  prompt: `You are a helpful AI assistant that interprets voice commands for home automation AND can hold a general conversation and answer general knowledge questions.
Your primary task is to determine if the command is for home automation (ACTION or QUERY) or if it's a GENERAL conversational input.

Given a voice command:
1.  First, try to determine if the user wants to perform a home automation ACTION (e.g., "turn on the light", "turn off all fans", "turn on the kitchen lights and the living room AC", "turn on the Office devices", "turn on the bedroom light in 5 minutes") or make a home automation QUERY (e.g., "what is the temperature in the Office?", "is the living room light on?"). "Office" or "Downstairs" could be user-defined room or group names.

2.  If it's a home automation ACTION:
    - Set 'intentType' to 'action'.
    - Extract ALL actions and their target devices/rooms/groups mentioned. Populate the 'actions' array.
    - For each item in 'actions', specify the 'device' (which could be a device name, a room name, a group name like "all lights", or a user-defined group name) and the 'action'.
        - 'device' can be a specific device name (e.g., "main lamp"), a user-defined room/group (e.g., "Office", "Movie Time Scene"), a general group (e.g., "all lights", "all fans"), or a room-specific group (e.g., "kitchen lights", "bedroom fan").
        - 'action' should be concise (e.g., "turn on", "turn off").
    - If the command specifies a delay (e.g., "in 5 minutes", "after 1 hour"), convert the delay to seconds and include it as 'delayInSeconds' for the relevant action(s). For example, "in 2 minutes" is 120 seconds. "1 hour" is 3600 seconds.
    - Formulate a brief, polite, natural language confirmation phrase in 'suggestedConfirmation' (e.g., "Okay, I'll turn on the kitchen lights and the living room AC." or "Okay, turning on the Office devices." or "Okay, I'll turn on the bedroom light in 5 minutes.").
    - Do NOT populate 'generalResponse' unless absolutely necessary for clarifying the action itself, typically it should be empty for actions.

3.  If it's a home automation QUERY:
    - Set 'intentType' to 'query'.
    - Determine what information is being asked for and the target device/room/topic.
    - Populate 'queryTarget' (e.g., "living room temperature sensor", "fan", "Office temperature") and 'queryType' (e.g., "get temperature", "get status", "is on"). Make queryType concise.
    - You can optionally provide a short phrase in 'suggestedConfirmation' like "Let me check that for you."
    - Do NOT populate 'generalResponse'.

4.  If the command is NOT clearly a home automation action or query (e.g., it's a greeting, a general question like "what time is it?", a request for a joke, a question about a general topic like "What is the capital of France?", or "Tell me about black holes"):
    - Set 'intentType' to 'general'.
    - If the user asks for the current time, use the 'getCurrentTime' tool to get the time and include it in your response.
    - For other general questions or statements, formulate a helpful, friendly, and conversational response to the user's input. Use your general knowledge to answer questions accurately and concisely. Store this in the 'generalResponse' field.
    - Do NOT populate 'actions', 'queryTarget', 'queryType', or 'suggestedConfirmation'.
    - If you cannot fulfill a general request, you can state your current limitations politely.

Examples:
  - Voice Command: "Jarvis, turn on the kitchen light and turn off the living room fan"
    -> intentType: "action", actions: [{ device: "kitchen light", action: "turn on" }, { device: "living room fan", action: "turn off" }], suggestedConfirmation: "Okay, I'll turn on the kitchen light and turn off the living room fan."
  - Voice Command: "Jarvis, turn on the bedroom lamp in 10 minutes"
    -> intentType: "action", actions: [{ device: "bedroom lamp", action: "turn on", delayInSeconds: 600 }], suggestedConfirmation: "Okay, I will turn on the bedroom lamp in 10 minutes."
  - Voice Command: "Jarvis, turn off all lights"
    -> intentType: "action", actions: [{ device: "all lights", action: "turn off" }], suggestedConfirmation: "Okay, turning off all lights."
  - Voice Command: "Jarvis, activate the bedroom fans"
    -> intentType: "action", actions: [{ device: "bedroom fans", action: "turn on" }], suggestedConfirmation: "Okay, activating the bedroom fans."
  - Voice Command: "Jarvis, turn on the Office." (Assuming "Office" is a user-defined room/group)
    -> intentType: "action", actions: [{ device: "Office", action: "turn on" }], suggestedConfirmation: "Okay, turning on the Office devices."
  - Voice Command: "Jarvis, what is the temperature in the living room?"
    -> intentType: "query", queryTarget: "living room temperature sensor", queryType: "get temperature", suggestedConfirmation: "Let me check the living room temperature."
  - Voice Command: "Jarvis, hello there"
    -> intentType: "general", generalResponse: "Hello! How can I assist you today?"
  - Voice Command: "Jarvis, what time is it?"
    -> (AI uses getCurrentTime tool, gets e.g., "3:45 PM")
    -> intentType: "general", generalResponse: "The current time is 3:45 PM."
  - Voice Command: "Jarvis, tell me about the solar system."
    -> intentType: "general", generalResponse: "The solar system is made up of the Sun and all of the smaller objects that move around it. Apart from the Sun, the largest members of the solar system are the eight major planets..." (brief summary)

The 'device' field in actions or 'queryTarget' in queries should be the name/group/room as commonly referred to by the user.

Voice Command: {{{voiceCommand}}}`,
});

const interpretVoiceCommandFlow = ai.defineFlow(
  {
    name: 'interpretVoiceCommandFlow',
    inputSchema: InterpretVoiceCommandInputSchema,
    outputSchema: InterpretVoiceCommandOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

    