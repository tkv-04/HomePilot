// src/contexts/UserPreferencesContext.tsx
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import type { UserPreferences } from '@/types/preferences';
import { useAuth } from '@/hooks/useAuth'; // Ensure this path is correct

interface UserPreferencesContextType {
  preferences: UserPreferences | null;
  updateSelectedDeviceIds: (deviceIds: string[]) => Promise<void>;
  updateSelectedVoiceURI: (voiceURI: string | null) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

export const UserPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: authIsLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const userId = user?.uid; // Using user.uid from Firebase Auth

  useEffect(() => {
    if (authIsLoading) {
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setPreferences(null); // Clear preferences if no user
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const prefDocRef = doc(db, 'userPreferences', userId); // Use userId (which is uid)

    const unsubscribe = onSnapshot(prefDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setPreferences(docSnap.data() as UserPreferences);
      } else {
        // No preferences saved yet, set defaults
        setPreferences({ selectedDeviceIds: [], selectedVoiceURI: null });
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching user preferences from Firestore:", err);
      setError(err);
      setIsLoading(false);
    });

    return () => unsubscribe(); // Cleanup snapshot listener on unmount or userId change

  }, [userId, authIsLoading]);

  const updatePreferencesInFirestore = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    if (!userId) {
      console.error("Cannot update preferences: no user ID.");
      throw new Error("User not authenticated.");
    }
    const prefDocRef = doc(db, 'userPreferences', userId);
    try {
      // Ensure we merge, so if a new field is added to UserPreferences type later, 
      // it doesn't wipe out existing fields not part of this specific update.
      await setDoc(prefDocRef, newPrefs, { merge: true }); 
    } catch (err: any) {
      console.error("Error updating user preferences in Firestore:", err);
      setError(err);
      throw err;
    }
  }, [userId]);

  const updateSelectedDeviceIds = useCallback(async (deviceIds: string[]) => {
    await updatePreferencesInFirestore({ selectedDeviceIds: deviceIds });
  }, [updatePreferencesInFirestore]);

  const updateSelectedVoiceURI = useCallback(async (voiceURI: string | null) => {
    await updatePreferencesInFirestore({ selectedVoiceURI: voiceURI });
  }, [updatePreferencesInFirestore]);

  return (
    <UserPreferencesContext.Provider value={{
      preferences,
      updateSelectedDeviceIds,
      updateSelectedVoiceURI,
      isLoading,
      error
    }}>
      {children}
    </UserPreferencesContext.Provider>
  );
};

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
};
