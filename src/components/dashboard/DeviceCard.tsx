// src/components/dashboard/DeviceCard.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Power, Wind, Zap, Thermometer, Droplets, Tv, Question, WifiOff } from 'lucide-react'; // Added Question, WifiOff
import { Switch as UISwitch } from '@/components/ui/switch';
// Progress component is removed as brightness attribute is not reliably available for now
// import { Progress } from '@/components/ui/progress';

interface DeviceCardProps {
  device: Device;
  onToggleState?: (deviceId: string, currentState: Device['state']) => void;
}

// getDeviceIcon now uses the icon pre-assigned by the service, or falls back
const getDeviceIconElement = (device: Device): React.ReactElement => {
  const IconComponent = device.icon || Zap; // Fallback to Zap if no icon provided
  return <IconComponent className="h-6 w-6 text-muted-foreground" />;
};

export function DeviceCard({ device, onToggleState }: DeviceCardProps) {
  const IconElement = getDeviceIconElement(device);

  const handleToggle = () => {
    if (onToggleState && (device.type === 'light' || device.type === 'switch' || device.type === 'fan' || device.type === 'outlet')) {
      if (device.state === 'on' || device.state === 'off') { // Ensure state is toggleable
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
              {device.online ? device.state : 'Offline'}
            </span>
            {/* Brightness progress bar removed for now
            {device.type === 'light' && device.attributes?.brightness !== undefined && device.state === 'on' && (
                <div className="w-full ml-auto">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Brightness</span>
                        <span>{`${Math.round((device.attributes.brightness / 255) * 100)}%`}</span>
                    </div>
                    <Progress value={(device.attributes.brightness / 255) * 100} className="h-2" />
                </div>
            )}
            */}
          </div>
        );
      // Sensor, media_player, climate types are simplified or shown as 'unknown' for now
      // as the provided bridge primarily handles OnOff.
      // These can be expanded if the bridge provides more detailed SYNC/QUERY data.
      case 'sensor':
         return (
          <p className="text-lg text-accent">
            {String(device.state)}
            {device.attributes?.unit_of_measurement && (
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
        <CardTitle className="text-lg font-medium">{device.name}</CardTitle>
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
            <Badge variant="secondary" className="text-xs ml-2 truncate max-w-[150px]">
              {device.attributes.googleDeviceType.split('.').pop()?.toLowerCase()}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
