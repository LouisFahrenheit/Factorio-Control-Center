import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Username' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'password', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'john' })
  @IsString()
  @MinLength(2)
  username: string;

  @ApiProperty({
    example: 'securepassword',
    description: 'Minimum 8 characters',
  })
  @IsString()
  @MinLength(8, { message: 'invalid_password' })
  password: string;

  @ApiProperty({
    example: 'moderator',
    enum: ['administrator', 'server_engineer', 'moderator'],
  })
  @IsEnum(['administrator', 'server_engineer', 'moderator'])
  role: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  enabled: boolean;

  @ApiProperty({
    example: ['servers', 'saves'],
    required: false,
    type: [String],
  })
  @IsOptional()
  tabs?: string[];

  @ApiProperty({
    example: ['*'],
    required: false,
    type: [String],
    description: 'Instance IDs the user can access. Use ["*"] for all.',
  })
  @IsOptional()
  instance_ids?: string[];
}

export class UpdateUserDto {
  @ApiProperty({ required: false, description: 'Minimum 8 characters' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'invalid_password' })
  password?: string;

  @ApiProperty({
    required: false,
    enum: ['administrator', 'server_engineer', 'moderator'],
  })
  @IsOptional()
  @IsEnum(['administrator', 'server_engineer', 'moderator'])
  role?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  tabs?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  instance_ids?: string[];
}

export class Verify2faDto {
  @ApiProperty({
    description: 'Temporary challenge token issued after password check',
  })
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit TOTP code or backup recovery code',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class Enable2faDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit TOTP code from authenticator app',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class Disable2faDto {
  @ApiProperty({
    required: false,
    description: 'Current password for confirmation',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({
    required: false,
    description: '6-digit TOTP code for confirmation',
  })
  @IsOptional()
  @IsString()
  code?: string;
}

export class SetupAdminDto {
  @ApiProperty({ example: 'admin', description: 'Administrator username' })
  @IsString()
  @MinLength(2)
  username: string;

  @ApiProperty({
    example: 'password123',
    description: 'Administrator password (minimum 8 characters)',
  })
  @IsString()
  @MinLength(8, { message: 'invalid_password' })
  password: string;
}
