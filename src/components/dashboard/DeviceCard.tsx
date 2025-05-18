
// src/components/dashboard/DeviceCard.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, WifiOff } from 'lucide-react';
import { Switch as UISwitch } from '@/components/ui/switch';

interface DeviceCardProps {
  device: Device;
  onToggleState?: (deviceId: string, currentState: Device['state']) => void;
}

const getDeviceIconElement = (device: Device): React.ReactElement => {
  const IconComponent = device.icon || HelpCircle; // Fallback to HelpCircle if no icon provided
  return <IconComponent className="h-6 w-6 text-muted-foreground" />;
};

export function DeviceCard({ device, onToggleState }: DeviceCardProps) {
  const IconElement = getDeviceIconElement(device);

  const handleToggle = () => {
    if (onToggleState && (device.type === 'light' || device.type === 'switch' || device.type === 'fan' || device.type === 'outlet')) {
      if (device.state === 'on' || device.state === 'off') { 
         onToggleState(device.id, device.state);
      }
    }
  };

  const renderStateInfo = () => {
    if (!device.online) {
      return (
        <div className="flex items-center space-x-2 text-muted-foreground">
          <WifiOff className="h-5 w-5 text-destructive" />
          <span>Offline</span>
        </div>
      );
    }

    switch (device.type) {
      case 'light':
      case 'switch':
      case 'fan':
      case 'outlet':
        const isChecked = device.state === 'on';
        return (
          <div className="flex items-center space-x-2">
            <UISwitch
              checked={isChecked}
              onCheckedChange={handleToggle}
              aria-label={`Toggle ${device.name}`}
              className={onToggleState ? "cursor-pointer" : "cursor-default"}
              disabled={!onToggleState || !device.online}
            />
            <span className={`capitalize text-sm ${isChecked && device.online ? 'text-accent' : 'text-muted-foreground'}`}>
              {device.online ? String(device.state) : 'Offline'}
            </span>
          </div>
        );
      case 'sensor':
         // Display 'N/A' if state is 'unknown' or undefined, otherwise display the state.
         const displayState = (device.state === 'unknown' || device.state === undefined || device.state === null) 
                              ? 'N/A' 
                              : String(device.state);
         return (
          <p className="text-lg text-accent">
            {displayState}
            {device.attributes?.unit_of_measurement && displayState !== 'N/A' && (
              <span className="text-sm text-muted-foreground ml-1">{device.attributes.unit_of_measurement}</span>
            )}
          </p>
        );
      default:
        return <p className="text-lg text-muted-foreground capitalize">{device.online ? String(device.state) : 'Offline'}</p>;
    }
  };

  return (
    <Card className={`shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col h-full ${!device.online ? 'opacity-60' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium truncate pr-2" title={device.name}>{device.name}</CardTitle>
        {IconElement}
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between space-y-4">
        <div className="flex-grow">
         {renderStateInfo()}
        </div>
        <div className="pt-2">
          <Badge variant={device.online ? "outline" : "destructive"} className="text-xs capitalize">
            {device.type.replace('_', ' ')}
          </Badge>
          {device.attributes?.googleDeviceType && (
            <Badge variant="secondary" className="text-xs ml-2 truncate max-w-[150px]" title={String(device.attributes.googleDeviceType).split('.').pop()?.toLowerCase()}>
              {String(device.attributes.googleDeviceType).split('.').pop()?.toLowerCase()}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
    