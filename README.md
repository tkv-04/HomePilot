# HomePilot - A Voice-Controlled Smart Home Dashboard

HomePilot is a modern, web-based dashboard for controlling and automating your smart home devices. It features a sophisticated voice control system powered by Google's Genkit, allowing for natural language commands, custom routines, and powerful automations.



## ✨ Key Features

- **Voice-First Interface**: Control your home using natural language. The AI can handle complex commands like "turn on the kitchen lights and turn off the living room fan in 5 minutes."
- **Customizable Dashboard**: Select which devices appear on your dashboard for quick access. Devices are automatically grouped by rooms.
- **Routines**: Create custom voice commands to trigger multiple actions at once. For example, a "movie time" routine could dim the lights and turn on the TV. Supports multiple trigger phrases and optional custom voice responses after execution.
- **Powerful Automations**: Build rules to automate your home.
  - **Device-based triggers**: "IF the temperature is above 25°C..."
  - **Time-based triggers**: "...THEN turn on the fan at 8 PM on weekdays."
- **Rooms & Groups**: Organize your devices into rooms and custom groups for easier management and control (e.g., "turn on all downstairs lights").
- **Personalization**:
  - Customize the wake word prefix (e.g., change "Jarvis" to "Computer").
  - Choose from various system voices for spoken feedback.
- **Secure Authentication**: User accounts and preferences are securely managed with Firebase Authentication and Firestore.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **UI Library**: [React](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [ShadCN UI](https://ui.shadcn.com/)
- **AI & Generative Features**: [Google's Genkit](https://firebase.google.com/docs/genkit)
- **Backend & Database**: [Firebase](https://firebase.google.com/) (Authentication & Firestore)
- **Icons**: [Lucide React](https://lucide.dev/)

## 🚀 Getting Started

### Prerequisites

This is the **frontend** application. It requires backend services to function correctly:
1.  **Smart Home Bridge**: A service that acts as a bridge between HomePilot and your smart home platform (e.g., Home Assistant). It must expose an API compatible with Google Smart Home intents (SYNC, QUERY, EXECUTE).
2.  **Timer Service**: A simple backend service to handle scheduled actions (e.g., "turn off the lights in 5 minutes").
3.  **Deployed Genkit Flows**: The Genkit AI flows need to be deployed as callable HTTP endpoints for voice interpretation.

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tkv-04/HomePilot.git
    cd HomePilot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables:**
    Create a `.env.local` file in the root of the project and add your Firebase and backend service credentials. Start by copying the `.env` file if it exists.

    ```env
    # Firebase Client SDK Configuration
    NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
    NEXT_PUBLIC_FIREBASE_APP_ID=...

    # Google AI / Genkit
    NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY=AIza...

    # Backend Service URLs (replace with your actual endpoints)
    # Note: These are not part of this repository and must be created separately.
    NEXT_PUBLIC_SMART_HOME_API_URL=https://smarthome.example.com/api
    NEXT_PUBLIC_TIMER_SERVICE_BASE_URL=https://timers.example.com
    NEXT_PUBLIC_GENKIT_FLOW_ENDPOINT_URL=https://genkit.example.com/interpretVoiceCommand
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) (or your configured port) with your browser to see the result.

## 📁 Project Structure

- `src/app/`: Next.js App Router pages and layouts.
- `src/components/`: Reusable React components.
  - `src/components/dashboard/`: Components specific to the main dashboard.
  - `src/components/settings/`: Components for various settings pages.
  - `src/components/ui/`: ShadCN UI components.
- `src/ai/`: Genkit AI flows and tools.
- `src/contexts/`: React context providers for global state management (Auth, UserPreferences).
- `src/services/`: Client-side functions for communicating with external APIs.
- `src/types/`: TypeScript type definitions for the application.
- `src/lib/`: Utility functions and Firebase initialization.
