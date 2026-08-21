import { ApiProperty } from '@nestjs/swagger';

export class ServerActionDto {
  @ApiProperty({ required: false, description: 'Target instance ID. Omit to use the currently selected instance.' })
  instance_id?: string;
}

export class RconDto {
  @ApiProperty({ example: '/time', description: 'RCON command to execute' })
  command?: string;

  @ApiProperty({ required: false, example: 'web', description: 'Source identifier for the command' })
  source?: string;

  @ApiProperty({ required: false, description: 'Unique command ID for tracking' })
  command_id?: string;

  @ApiProperty({ required: false, description: 'Human-readable command name' })
  command_name?: string;
}

export class ChatSendDto {
  @ApiProperty({ example: 'Hello from FCC!', description: 'Message to send to in-game chat' })
  message?: string;
}

export class SelectInstanceDto {
  @ApiProperty({ description: 'Instance ID to select as active. Pass empty string to deselect.' })
  id?: string;
}

export class CreateSaveDto {
  @ApiProperty({ example: 'my-save', description: 'Save file name (without extension)' })
  name?: string;

  @ApiProperty({ required: false, example: 'default', description: 'Game mode: default, freeplay, etc.' })
  mode?: string;

  @ApiProperty({ required: false, description: 'Preset name to use for generation' })
  preset?: string;

  @ApiProperty({ required: false, example: 12345, description: 'Random seed for map generation' })
  seed?: number;

  @ApiProperty({ required: false, description: 'Map generation settings object' })
  map_gen_settings?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Map settings object' })
  map_settings?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Map exchange string to use for generation' })
  map_exchange_string?: string;
}

export class BanPlayerDto {
  @ApiProperty({ example: 'PlayerName', description: 'Player username to ban' })
  name?: string;

  @ApiProperty({ required: false, example: 'Cheating', description: 'Ban reason' })
  reason?: string;
}

export class PlayerActionDto {
  @ApiProperty({ example: 'PlayerName', description: 'Player username' })
  name?: string;

  @ApiProperty({ required: false, description: 'Reason for the action' })
  reason?: string;
}

export class AnnouncementsWriteDto {
  @ApiProperty({ required: false, description: 'Announcements data' })
  data?: unknown;
}

export class MaintenanceSetDto {
  // Arbitrary maintenance configuration fields (task schedules, intervals, etc.)
  [key: string]: unknown;
}
