
// src/contexts/UserPreferencesContext.tsx
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import type { UserPreferences, Room, DeviceGroup } from '@/types/preferences';
import type { AutomationRule } from '@/types/automations'; // Added
import { useAuth } from '@/hooks/useAuth';
import { v4 as uuidv4 } from 'uuid';

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

  automations: AutomationRule[]; // Added
  addAutomation: (automation: Omit<AutomationRule, 'id'>) => Promise<void>; // Added
  updateAutomation: (automationId: string, updatedAutomation: Partial<Omit<AutomationRule, 'id'>>) => Promise<void>; // Added
  deleteAutomation: (automationId: string) => Promise<void>; // Added
  toggleAutomationEnable: (automationId: string, isEnabled: boolean) => Promise<void>; // Added


  isLoading: boolean;
  error: Error | null;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

export const UserPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: authIsLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]); // Added
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
      setAutomations([]); // Added
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
        setAutomations(data.automations || []); // Added
      } else {
        const defaultPrefs: UserPreferences = {
          selectedDeviceIds: [],
          selectedVoiceURI: null,
          rooms: [],
          deviceGroups: [],
          automations: [], // Added
        };
        setPreferences(defaultPrefs);
        setRooms([]);
        setDeviceGroups([]);
        setAutomations([]); // Added
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

  // Room Management
  const addRoom = useCallback(async (roomData: Omit<Room, 'id'>) => {
    if (!userId) throw new Error("User not authenticated.");
    const newId = uuidv4();
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
    const newId = uuidv4();
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

  // Automation Management - Added
  const addAutomation = useCallback(async (automationData: Omit<AutomationRule, 'id'>) => {
    if (!userId) throw new Error("User not authenticated.");
    const newId = uuidv4();
    const newAutomation: AutomationRule = { ...automationData, id: newId };
    const newAutomations = [...automations, newAutomation];
    await updatePreferencesInFirestore({ automations: newAutomations });
  }, [userId, automations, updatePreferencesInFirestore]);

  const updateAutomation = useCallback(async (automationId: string, updatedAutomationData: Partial<Omit<AutomationRule, 'id'>>) => {
    if (!userId) throw new Error("User not authenticated.");
    const newAutomations = automations.map(a => a.id === automationId ? { ...a, ...updatedAutomationData } : a);
    await updatePreferencesInFirestore({ automations: newAutomations });
  }, [userId, automations, updatePreferencesInFirestore]);

  const deleteAutomation = useCallback(async (automationId: string) => {
    if (!userId) throw new Error("User not authenticated.");
    const newAutomations = automations.filter(a => a.id !== automationId);
    await updatePreferencesInFirestore({ automations: newAutomations });
  }, [userId, automations, updatePreferencesInFirestore]);
  
  const toggleAutomationEnable = useCallback(async (automationId: string, isEnabled: boolean) => {
    if (!userId) throw new Error("User not authenticated.");
    const newAutomations = automations.map(a => a.id === automationId ? { ...a, isEnabled } : a);
    await updatePreferencesInFirestore({ automations: newAutomations });
  }, [userId, automations, updatePreferencesInFirestore]);


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
      automations, // Added
      addAutomation, // Added
      updateAutomation, // Added
      deleteAutomation, // Added
      toggleAutomationEnable, // Added
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
