
// src/contexts/UserPreferencesContext.tsx
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import type { UserPreferences, Room, DeviceGroup } from '@/types/preferences';
import { useAuth } from '@/hooks/useAuth';

interface UserPreferencesContextType {
  preferences: UserPreferences | null;
  updateSelectedDeviceIds: (deviceIds: string[]) => Promise<void>;
  updateSelectedVoiceURI: (voiceURI: string | null) => Promise<void>;
  
  rooms: Room[];
  addRoom: (room: Omit<Room, 'id'>) => Promise<void>;
  updateRoom: (roomId: string, updatedRoom: Partial<Omit<Room, 'id'>>) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;

  deviceGroups: DeviceGroup[];
  addDeviceGroup: (group: Omit<DeviceGroup, 'id'>) => Promise<void>;
  updateDeviceGroup: (groupId: string, updatedGroup: Partial<Omit<DeviceGroup, 'id'>>) => Promise<void>;
  deleteDeviceGroup: (groupId: string) => Promise<void>;

  isLoading: boolean;
  error: Error | null;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

export const UserPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: authIsLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const userId = user?.uid;

  useEffect(() => {
    if (authIsLoading) {
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setPreferences(null);
      setRooms([]);
      setDeviceGroups([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const prefDocRef = doc(db, 'userPreferences', userId);

    const unsubscribe = onSnapshot(prefDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserPreferences;
        setPreferences(data);
        setRooms(data.rooms || []);
        setDeviceGroups(data.deviceGroups || []);
      } else {
        const defaultPrefs: UserPreferences = {
          selectedDeviceIds: [],
          selectedVoiceURI: null,
          rooms: [],
          deviceGroups: [],
        };
        setPreferences(defaultPrefs);
        setRooms([]);
        setDeviceGroups([]);
        // Optionally create the document with defaults if it doesn't exist
        setDoc(prefDocRef, defaultPrefs).catch(err => {
          console.error("Error creating initial preferences doc:", err);
          setError(err as Error);
        });
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching user preferences from Firestore:", err);
      setError(err);
      setIsLoading(false);
    });

    return () => unsubscribe();

  }, [userId, authIsLoading]);

  const updatePreferencesInFirestore = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    if (!userId) {
      console.error("Cannot update preferences: no user ID.");
      throw new Error("User not authenticated.");
    }
    const prefDocRef = doc(db, 'userPreferences', userId);
    try {
      await updateDoc(prefDocRef, newPrefs); // Use updateDoc for partial updates
    } catch (err: any) {
      // If document doesn't exist, setDoc might be more appropriate or handle error.
      // For now, assume document exists if we're updating.
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

  // Room Management
  const addRoom = useCallback(async (roomData: Omit<Room, 'id'>) => {
    if (!userId) throw new Error("User not authenticated.");
    const newId = doc(collection(db, 'userPreferences', userId, '_placeholder')).id; // Firestore generates IDs this way
    const newRoom: Room = { ...roomData, id: newId };
    const newRooms = [...rooms, newRoom];
    await updatePreferencesInFirestore({ rooms: newRooms });
  }, [userId, rooms, updatePreferencesInFirestore]);

  const updateRoom = useCallback(async (roomId: string, updatedRoomData: Partial<Omit<Room, 'id'>>) => {
    if (!userId) throw new Error("User not authenticated.");
    const newRooms = rooms.map(r => r.id === roomId ? { ...r, ...updatedRoomData } : r);
    await updatePreferencesInFirestore({ rooms: newRooms });
  }, [userId, rooms, updatePreferencesInFirestore]);

  const deleteRoom = useCallback(async (roomId: string) => {
    if (!userId) throw new Error("User not authenticated.");
    const newRooms = rooms.filter(r => r.id !== roomId);
    await updatePreferencesInFirestore({ rooms: newRooms });
  }, [userId, rooms, updatePreferencesInFirestore]);

  // Device Group Management
  const addDeviceGroup = useCallback(async (groupData: Omit<DeviceGroup, 'id'>) => {
    if (!userId) throw new Error("User not authenticated.");
    const newId = doc(collection(db, 'userPreferences', userId, '_placeholder')).id;
    const newGroup: DeviceGroup = { ...groupData, id: newId };
    const newGroups = [...deviceGroups, newGroup];
    await updatePreferencesInFirestore({ deviceGroups: newGroups });
  }, [userId, deviceGroups, updatePreferencesInFirestore]);

  const updateDeviceGroup = useCallback(async (groupId: string, updatedGroupData: Partial<Omit<DeviceGroup, 'id'>>) => {
    if (!userId) throw new Error("User not authenticated.");
    const newGroups = deviceGroups.map(g => g.id === groupId ? { ...g, ...updatedGroupData } : g);
    await updatePreferencesInFirestore({ deviceGroups: newGroups });
  }, [userId, deviceGroups, updatePreferencesInFirestore]);

  const deleteDeviceGroup = useCallback(async (groupId: string) => {
    if (!userId) throw new Error("User not authenticated.");
    const newGroups = deviceGroups.filter(g => g.id !== groupId);
    await updatePreferencesInFirestore({ deviceGroups: newGroups });
  }, [userId, deviceGroups, updatePreferencesInFirestore]);

  // Helper to generate IDs on the client, as Firestore ID generation for subcollections is complex.
  const { collection } = require("firebase/firestore"); // ensure collection is imported

  return (
    <UserPreferencesContext.Provider value={{
      preferences,
      updateSelectedDeviceIds,
      updateSelectedVoiceURI,
      rooms,
      addRoom,
      updateRoom,
      deleteRoom,
      deviceGroups,
      addDeviceGroup,
      updateDeviceGroup,
      deleteDeviceGroup,
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
