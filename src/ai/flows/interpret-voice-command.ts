
'use server';
/**
 * @fileOverview This file defines a Genkit flow to interpret voice commands for home automation
 * or general conversation. It can understand single queries, multiple actions on devices, or
 * respond to general chitchat, including telling the time and answering general knowledge questions.
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
  device: z.string().describe('The target device for the action. This should be the name of the device spoken by the user, e.g., "kitchen light", "living room fan".'),
  action: z.string().describe('The action to perform on the device (e.g., "turn on", "turn off"). Make this concise.'),
});

const InterpretVoiceCommandOutputSchema = z.object({
  intentType: z.enum(['action', 'query', 'general']).describe('The type of intent: "action" to perform on device(s), "query" to get information, or "general" for conversational responses.'),
  actions: z.array(SingleDeviceActionSchema).optional().describe('A list of actions to perform on devices. Used when intentType is "action". If multiple devices/actions are mentioned, list them all here.'),
  queryTarget: z.string().optional().describe('The target device or topic for the query (e.g., "kitchen light", "living room temperature sensor"). Used when intentType is "query".'),
  queryType: z.string().optional().describe('The type of information requested (e.g.,"get temperature", "get status", "is on"). Used when intentType is "query". Make this concise.'),
  suggestedConfirmation: z.string().optional().describe('A polite, natural language phrase confirming the understood command if it is an "action" or "query". e.g., "Okay, turning on the kitchen light." or "Let me check that for you." This field should NOT be populated if intentType is "general".'),
  generalResponse: z.string().optional().describe('A conversational response if the command is not a home automation action or query (i.e., intentType is "general"). This can include answers to questions like "what time is it?" or answers to general knowledge questions.'),
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
1.  First, try to determine if the user wants to perform a home automation ACTION (e.g., "turn on the light", "turn off the fan and turn on the AC") or make a home automation QUERY (e.g., "what is the temperature?", "is the living room light on?").

2.  If it's a home automation ACTION:
    - Set 'intentType' to 'action'.
    - Extract ALL actions and their target devices mentioned. Populate the 'actions' array.
    - For each item in 'actions', specify the 'device' (e.g., "kitchen light", "fan") and the 'action' (e.g., "turn on", "turn off"). Make actions concise.
    - Formulate a brief, polite, natural language confirmation phrase in 'suggestedConfirmation' (e.g., "Okay, I'll turn on the kitchen light.").
    - Do NOT populate 'generalResponse'.

3.  If it's a home automation QUERY:
    - Set 'intentType' to 'query'.
    - Determine what information is being asked for and the target device/topic.
    - Populate 'queryTarget' (e.g., "living room temperature sensor", "fan") and 'queryType' (e.g., "get temperature", "get status", "is on"). Make queryType concise.
    - You can optionally provide a short phrase in 'suggestedConfirmation' like "Let me check that for you." or "Looking up the status of the fan."
    - Do NOT populate 'generalResponse'.

4.  If the command is NOT clearly a home automation action or query (e.g., it's a greeting, a general question like "what time is it?", a request for a joke, a question about a general topic like "What is the capital of France?", or "Tell me about black holes"):
    - Set 'intentType' to 'general'.
    - If the user asks for the current time, use the 'getCurrentTime' tool to get the time and include it in your response.
    - For other general questions or statements, formulate a helpful, friendly, and conversational response to the user's input. Use your general knowledge to answer questions accurately and concisely. Store this in the 'generalResponse' field.
    - Do NOT populate 'actions', 'queryTarget', 'queryType', or 'suggestedConfirmation'.
    - If you cannot fulfill a general request (e.g., the information is beyond your capabilities or training data), you can state your current limitations politely.

Examples:
  - Voice Command: "Jarvis, turn on the kitchen light and turn off the living room fan"
    -> intentType: "action", actions: [{ device: "kitchen light", action: "turn on" }, { device: "living room fan", action: "turn off" }], suggestedConfirmation: "Okay, I'll turn on the kitchen light and turn off the living room fan."
  - Voice Command: "Jarvis, what is the temperature in the living room?"
    -> intentType: "query", queryTarget: "living room temperature sensor", queryType: "get temperature", suggestedConfirmation: "Let me check the living room temperature."
  - Voice Command: "Jarvis, hello there"
    -> intentType: "general", generalResponse: "Hello! How can I assist you today?"
  - Voice Command: "Jarvis, tell me a joke"
    -> intentType: "general", generalResponse: "Why don't scientists trust atoms? Because they make up everything!"
  - Voice Command: "Jarvis, what time is it?"
    -> (AI uses getCurrentTime tool, gets e.g., "3:45 PM")
    -> intentType: "general", generalResponse: "The current time is 3:45 PM."
  - Voice Command: "Jarvis, what is the capital of France?"
    -> intentType: "general", generalResponse: "The capital of France is Paris."
  - Voice Command: "Jarvis, tell me something interesting about space."
    -> intentType: "general", generalResponse: "Certainly! Did you know that a day on Venus is longer than its year? It rotates very slowly."

If a device name in a home automation command is generic (e.g., "the sensor", "the light"), try to infer a more specific device name if the context allows, or use the generic name.
The 'device' field in actions or 'queryTarget' in queries should be the name as commonly referred to by the user.

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

