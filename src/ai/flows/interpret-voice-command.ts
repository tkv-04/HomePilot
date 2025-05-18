
'use server';
/**
 * @fileOverview This file defines a Genkit flow to interpret voice commands for home automation.
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

const InterpretVoiceCommandOutputSchema = z.object({
  intentType: z.enum(['action', 'query']).describe('The type of intent: "action" to perform on a device, or "query" to get information.'),
  action: z.string().describe('If intentType is "action", the action to perform (e.g., "turn on", "turn off"). If intentType is "query", the type of information requested (e.g., "get temperature", "get status").'),
  device: z.string().describe('The target device for the action or query.'),
  rawValue: z.string().optional().describe('The raw value from the voice command, if applicable (e.g., for setting brightness - not currently used for on/off or queries).'),
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
Your task is to extract the intent from the given voice command and convert that into actionable steps or information queries.

Given a voice command:
- Determine if the user wants to perform an ACTION (e.g., "turn on the light", "turn off the fan") or make a QUERY (e.g., "what is the temperature?", "is the living room light on?").
- Set the 'intentType' field to 'action' or 'query'.
- For 'action' intents, extract the action to perform (e.g., "turn on") and the target device. Make the action concise, like "turn on" or "turn off".
- For 'query' intents, determine what information is being asked for (e.g., "get temperature", "get humidity", "get status") and the target device. Make the action concise, like "get temperature" or "get status".
- If applicable, extract the raw value (though less common for simple on/off or queries).
Return the intentType, action, device, and rawValue (if applicable) in JSON format.

Examples:
- Voice Command: "Jarvis, turn on the kitchen light" -> intentType: "action", action: "turn on", device: "kitchen light"
- Voice Command: "Jarvis, what is the temperature in the living room?" -> intentType: "query", action: "get temperature", device: "living room temperature sensor" (or a generic name if the user isn't specific, but try to match known device names)
- Voice Command: "Jarvis, is the fan on?" -> intentType: "query", action: "get status", device: "fan"
- Voice Command: "Jarvis, what's the humidity?" -> intentType: "query", action: "get humidity", device: "humidity sensor" (or a more specific name if available)

If the device name in the voice command is generic (e.g., "the sensor", "the light"), try to infer a more specific device name if the context allows, or use the generic name.

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
