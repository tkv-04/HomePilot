
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Ensure this environment variable is set in your .env file
// (e.g., NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY=your_api_key_here)
const geminiApiKey = process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY;

if (!geminiApiKey) {
  // This warning will appear in the server console where Genkit code executes
  console.warn(
    'WARNING: NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY is not set in the environment. ' +
    'Genkit AI features requiring this key will likely fail.'
  );
  // Depending on your setup, Genkit might still throw an error if the key is truly missing
  // when an API call is attempted. This console warning is an early indicator.
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: geminiApiKey, // Explicitly pass the API key
    }),
  ],
  model: 'googleai/gemini-2.0-flash',
});

