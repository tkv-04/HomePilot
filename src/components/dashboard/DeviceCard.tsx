// src/components/dashboard/DeviceCard.tsx
"use client";

import type { Device } from '@/types/home-assistant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Thermometer, Droplets, Power, Tv, Wind, Zap } from 'lucide-react'; // Added Zap as default
import { Switch as UISwitch } from '@/components/ui/switch'; // For light/switch toggles (display only for now)
import { Progress } from '@/components/ui/progress';

interface DeviceCardProps {
  device: Device;
}

const getDeviceIcon = (device: Device): React.ElementType => {
  if (device.icon) return device.icon;

  switch (device.type) {
    case 'light':
      return Lightbulb;
    case 'sensor':
      switch (device.attributes?.device_class) {
        case 'temperature':
          return Thermometer;
        case 'humidity':
          return Droplets;
        case 'power':
          return Power;
        default:
          return Zap; // Generic sensor icon
      }
    case 'switch':
      return Power;
    case 'media_player':
      return Tv;
    case 'climate':
      return Wind;
    default:
      return Zap; // Default icon for unknown types
  }
};

export function DeviceCard({ device }: DeviceCardProps) {
  const IconComponent = getDeviceIcon(device);

  const renderStateInfo = () => {
    switch (device.type) {
      case 'light':
      case 'switch':
        return (
          <div className="flex items-center space-x-2">
            <UISwitch
              checked={device.state === 'on'}
              aria-readonly
              className="cursor-default"
            />
            <span className={`capitalize text-sm ${device.state === 'on' ? 'text-accent' : 'text-muted-foreground'}`}>
              {device.state}
            </span>
            {device.type === 'light' && device.attributes?.brightness !== undefined && device.state === 'on' && (
                <div className="w-full ml-auto">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Brightness</span>
                        <span>{`${Math.round((device.attributes.brightness / 255) * 100)}%`}</span>
                    </div>
                    <Progress value={(device.attributes.brightness / 255) * 100} className="h-2" />
                </div>
            )}
          </div>
        );
      case 'sensor':
        return (
          <p className="text-2xl font-semibold text-accent">
            {device.state}
            {device.attributes?.unit_of_measurement && (
              <span className="text-sm text-muted-foreground ml-1">{device.attributes.unit_of_measurement}</span>
            )}
          </p>
        );
      case 'media_player':
        return (
          <div className="text-sm space-y-1">
            <p><strong className="text-foreground">State:</strong> <span className="text-accent capitalize">{String(device.state)}</span></p>
            {device.attributes?.media_title && <p><strong className="text-foreground">Playing:</strong> <span className="text-muted-foreground">{device.attributes.media_title}</span></p>}
            {device.attributes?.media_artist && <p><strong className="text-foreground">Artist:</strong> <span className="text-muted-foreground">{device.attributes.media_artist}</span></p>}
          </div>
        );
      case 'climate':
         return (
          <div className="text-sm space-y-1">
            <p><strong className="text-foreground">Mode:</strong> <span className="text-accent capitalize">{String(device.state)}</span></p>
            {device.attributes?.current_temperature !== undefined && <p><strong className="text-foreground">Current:</strong> <span className="text-muted-foreground">{device.attributes.current_temperature}°C</span></p>}
            {device.attributes?.target_temperature !== undefined && <p><strong className="text-foreground">Target:</strong> <span className="text-muted-foreground">{device.attributes.target_temperature}°C</span></p>}
            {device.attributes?.hvac_action && <p><strong className="text-foreground">Action:</strong> <span className="text-accent capitalize">{device.attributes.hvac_action}</span></p>}
          </div>
        );
      default:
        return <p className="text-lg text-accent capitalize">{String(device.state)}</p>;
    }
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">{device.name}</CardTitle>
        <IconComponent className="h-6 w-6 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between space-y-4">
        <div className="flex-grow">
         {renderStateInfo()}
        </div>
        <div className="pt-2">
          <Badge variant="outline" className="text-xs capitalize">{device.type.replace('_', ' ')}</Badge>
          {device.attributes?.device_class && (
            <Badge variant="secondary" className="text-xs ml-2 capitalize">{device.attributes.device_class}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
