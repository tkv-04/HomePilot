
// src/app/page.tsx
"use client";

// Removed useEffect, useRouter, useAuth as HomePage will no longer handle redirection.
// Middleware is responsible for redirecting from '/'.
// This page will only render if middleware explicitly allows access to '/',
// and in that case, it should just be a loading/placeholder.
import { Skeleton } from '@/components/ui/skeleton';

export default function HomePage() {
  // The AuthContext and its isLoading/user state are still available if needed
  // for conditional rendering within this page, but not for redirection.
  // const { user, isLoading } = useAuth();

  // This page should ideally not be reached if middleware is correctly
  // redirecting authenticated users to /dashboard and unauthenticated
  // users to /login when they hit '/'.
  // It now serves as a fallback loading display.
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="space-y-4 p-8 rounded-lg shadow-xl bg-card">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-10 w-full mt-4" />
        <p className="text-center text-muted-foreground mt-4">Loading HomePilot...</p>
      </div>
    </div>
  );
}
