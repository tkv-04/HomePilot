
'use server';
/**
 * @fileOverview A Genkit tool to get the current system time.
 *
 * - getCurrentTime - A tool that returns the current time as a formatted string.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export const getCurrentTimeTool = ai.defineTool(
  {
    name: 'getCurrentTime',
    description: 'Returns the current time. Use this tool if the user asks what time it is.',
    inputSchema: z.object({}), // No input needed
    outputSchema: z.string().describe('The current time, formatted (e.g., "10:30 AM").'),
  },
  async () => {
    // This runs on the server, so new Date() is fine here.
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
);
