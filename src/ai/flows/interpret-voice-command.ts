
'use server';
/**
 * @fileOverview This file defines a Genkit flow to interpret voice commands for home automation.
 * It can understand single queries or multiple actions on devices from a single command.
 *
 * - interpretVoiceCommand - A function that takes a voice command as input and returns an
 *   actionable command or query for Home Assistant.
 * - InterpretVoiceCommandInput - The input type for the interpretVoiceCommand function.
 * - InterpretVoiceCommandOutput - The return type for the interpretVoiceCommand function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InterpretVoiceCommandInputSchema = z.object({
  voiceCommand: z.string().describe('The voice command to interpret.'),
});
export type InterpretVoiceCommandInput = z.infer<
  typeof InterpretVoiceCommandInputSchema
>;

const SingleDeviceActionSchema = z.object({
  device: z.string().describe('The target device for the action. This should be the name of the device spoken by the user, e.g., "kitchen light", "living room fan".'),
  action: z.string().describe('The action to perform on the device (e.g., "turn on", "turn off"). Make this concise.'),
  // rawValue: z.string().optional().describe('The raw value from the voice command, if applicable (e.g., for setting brightness - not currently used).'),
});

const InterpretVoiceCommandOutputSchema = z.object({
  intentType: z.enum(['action', 'query']).describe('The type of intent: "action" to perform on device(s), or "query" to get information.'),
  // For actions
  actions: z.array(SingleDeviceActionSchema).optional().describe('A list of actions to perform on devices. Used when intentType is "action". If multiple devices/actions are mentioned, list them all here.'),
  // For queries (singular device/topic for query still makes sense for voice response)
  queryTarget: z.string().optional().describe('The target device or topic for the query (e.g., "kitchen light", "living room temperature sensor"). Used when intentType is "query".'),
  queryType: z.string().optional().describe('The type of information requested (e.g.,"get temperature", "get status", "is on"). Used when intentType is "query". Make this concise.'),
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
  prompt: `You are a helpful AI assistant that interprets voice commands for home automation.
Your task is to extract the intent from the given voice command.

Given a voice command:
- First, determine if the user wants to perform an ACTION (e.g., "turn on the light", "turn off the fan and turn on the AC") or make a QUERY (e.g., "what is the temperature?", "is the living room light on?"). Set the 'intentType' field to 'action' or 'query'.

- If 'intentType' is "action":
  - Extract ALL actions and their target devices mentioned. Populate the 'actions' array.
  - For each item in 'actions', specify the 'device' (e.g., "kitchen light", "fan") and the 'action' (e.g., "turn on", "turn off"). Make actions concise.
  - Example: "Jarvis, turn on the kitchen light and turn off the living room fan"
    -> intentType: "action", actions: [{ device: "kitchen light", action: "turn on" }, { device: "living room fan", action: "turn off" }]
  - Example: "Jarvis, switch off the main lamp"
    -> intentType: "action", actions: [{ device: "main lamp", action: "turn off" }]

- If 'intentType' is "query":
  - Determine what information is being asked for and the target device/topic.
  - Populate 'queryTarget' (e.g., "living room temperature sensor", "fan") and 'queryType' (e.g., "get temperature", "get status", "is on"). Make queryType concise.
  - Queries usually target a single piece of information.
  - Example: "Jarvis, what is the temperature in the living room?"
    -> intentType: "query", queryTarget: "living room temperature sensor", queryType: "get temperature"
  - Example: "Jarvis, is the fan on?"
    -> intentType: "query", queryTarget: "fan", queryType: "get status" (or "is on")

If the device name in the voice command is generic (e.g., "the sensor", "the light"), try to infer a more specific device name if the context allows, or use the generic name.
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
