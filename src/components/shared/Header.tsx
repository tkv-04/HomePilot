
// src/components/shared/Header.tsx
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, Home, Settings2 } from 'lucide-react'; // Added Settings2

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <Home className="h-7 w-7 text-primary" />
          <span className="text-2xl font-bold text-foreground">HomePilot</span>
        </Link>
        <div className="flex items-center space-x-2 sm:space-x-4">
          {user && (
            <>
              <span className="text-sm text-muted-foreground hidden md:inline">Welcome, {user.email}</span>
              <Button variant="ghost" size="icon" asChild title="Manage Devices">
                <Link href="/manage-devices">
                  <Settings2 className="h-5 w-5 text-foreground hover:text-accent" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={logout} aria-label="Logout" title="Logout">
                <LogOut className="h-5 w-5 text-foreground hover:text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
