// src/contexts/AuthContext.tsx
"use client";

import type { ReactNode } from "react";
import React, { createContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase'; // Import Firebase auth instance
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User as FirebaseUser } from 'firebase/auth';
import { useToast } from "@/hooks/use-toast";

interface AppUser {
  uid: string;
  email: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_FLAG_COOKIE_NAME = 'homepilot_auth_flag';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
        // Set a simple flag cookie for middleware
        document.cookie = `${AUTH_FLAG_COOKIE_NAME}=true; path=/; max-age=${3600 * 24 * 7}; SameSite=Lax`; // Expires in 7 days
      } else {
        setUser(null);
        // Clear the flag cookie
        document.cookie = `${AUTH_FLAG_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
      }
      setIsLoading(false);
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle setting the user and cookie
      // Navigation will be handled by middleware or page logic seeing the cookie/auth state
      // No explicit router.push here to allow onAuthStateChanged and cookie to settle
      toast({ title: "Login Successful", description: "Redirecting to dashboard..." });
    } catch (error: any) {
      console.error("Firebase login error:", error);
      let errorMessage = "Login failed. Please check your credentials.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = "Invalid email or password.";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Too many login attempts. Please try again later.";
      }
      toast({
        title: "Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false); // Reset loading on error
      throw error; // Re-throw to be caught by LoginForm if needed
    }
    // setIsLoading(false); // onAuthStateChanged will set loading to false
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will handle clearing the user and cookie
      router.push('/login');
    } catch (error) {
      console.error("Firebase logout error:", error);
       toast({
        title: "Logout Failed",
        description: "Could not log out. Please try again.",
        variant: "destructive",
      });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
