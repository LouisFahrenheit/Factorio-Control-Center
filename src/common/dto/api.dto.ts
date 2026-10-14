import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class ServerActionDto {
  @ApiProperty({
    required: false,
    description:
      'Target instance ID. Omit to use the currently selected instance.',
  })
  @IsOptional()
  @IsString()
  instance_id?: string;
}

export class RconDto {
  @ApiProperty({ example: '/time', description: 'RCON command to execute' })
  @IsOptional()
  @IsString()
  command?: string;

  @ApiProperty({
    required: false,
    example: 'web',
    description: 'Source identifier for the command',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    required: false,
    description: 'Unique command ID for tracking',
  })
  @IsOptional()
  @IsString()
  command_id?: string;

  @ApiProperty({ required: false, description: 'Human-readable command name' })
  @IsOptional()
  @IsString()
  command_name?: string;
}

export class ChatSendDto {
  @ApiProperty({
    example: 'Hello from FCC!',
    description: 'Message to send to in-game chat',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

export class SelectInstanceDto {
  @ApiProperty({
    description:
      'Instance ID to select as active. Pass empty string to deselect.',
  })
  @IsOptional()
  @IsString()
  id?: string;
}

export class CreateSaveDto {
  @ApiProperty({
    example: 'my-save',
    description: 'Save file name (without extension)',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    required: false,
    example: 'default',
    description: 'Game mode: default, freeplay, etc.',
  })
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiProperty({
    required: false,
    description: 'Preset name to use for generation',
  })
  @IsOptional()
  @IsString()
  preset?: string;

  @ApiProperty({
    required: false,
    example: 12345,
    description: 'Random seed for map generation',
  })
  @IsOptional()
  @IsNumber()
  seed?: number;

  @ApiProperty({
    required: false,
    description: 'Map generation settings object',
  })
  @IsOptional()
  @IsObject()
  map_gen_settings?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Map settings object' })
  @IsOptional()
  @IsObject()
  map_settings?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Map exchange string to use for generation',
  })
  @IsOptional()
  @IsString()
  map_exchange_string?: string;
}

export class BanPlayerDto {
  @ApiProperty({ example: 'PlayerName', description: 'Player username to ban' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    required: false,
    example: 'Cheating',
    description: 'Ban reason',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PlayerActionDto {
  @ApiProperty({ example: 'PlayerName', description: 'Player username' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, description: 'Reason for the action' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AnnouncementsWriteDto {
  @ApiProperty({ required: false, description: 'Announcements data' })
  @IsOptional()
  data?: unknown;
}

export class MaintenanceSetDto {
  // Arbitrary maintenance configuration fields (task schedules, intervals, etc.)
  [key: string]: unknown;
}
