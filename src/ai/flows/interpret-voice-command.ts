// The `use server` directive is required for Server Actions used in Next.js
'use server';

/**
 * @fileOverview This file defines a Genkit flow to interpret voice commands for home automation.
 *
 * - interpretVoiceCommand - A function that takes a voice command as input and returns an
 *   actionable command for Home Assistant.
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
  action: z.string().describe('The action to perform on the home devices.'),
  device: z.string().describe('The target device for the action.'),
  rawValue: z.string().optional().describe('The raw value from the voice command, if applicable'),
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
  prompt: `You are a helpful AI assistant that interprets voice commands for home automation. Your task is to extract the intent from the given voice command and convert that into actionable steps which will control smart home devices.

Given a voice command, extract the action to perform and the device to control. If applicable, extract the raw value. Return the action, device, and raw value (if applicable) in JSON format.

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
