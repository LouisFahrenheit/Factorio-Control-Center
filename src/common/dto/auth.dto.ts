import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Username' })
  username: string;

  @ApiProperty({ example: 'password', description: 'User password' })
  password: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'john' })
  username: string;

  @ApiProperty({ example: 'securepassword' })
  password: string;

  @ApiProperty({ example: 'operator', enum: ['administrator', 'operator'] })
  role: string;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({
    example: ['servers', 'saves'],
    required: false,
    type: [String],
  })
  tabs?: string[];

  @ApiProperty({
    example: ['*'],
    required: false,
    type: [String],
    description: 'Instance IDs the user can access. Use ["*"] for all.',
  })
  instance_ids?: string[];
}

export class UpdateUserDto {
  @ApiProperty({ required: false })
  password?: string;

  @ApiProperty({ required: false, enum: ['administrator', 'operator'] })
  role?: string;

  @ApiProperty({ required: false })
  enabled?: boolean;

  @ApiProperty({ required: false, type: [String] })
  tabs?: string[];

  @ApiProperty({ required: false, type: [String] })
  instance_ids?: string[];
}

export class Verify2faDto {
  @ApiProperty({ description: 'Temporary challenge token issued after password check' })
  challengeToken: string;

  @ApiProperty({ example: '123456', description: '6-digit TOTP code or backup recovery code' })
  code: string;
}

export class Enable2faDto {
  @ApiProperty({ example: '123456', description: '6-digit TOTP code from authenticator app' })
  code: string;
}

export class Disable2faDto {
  @ApiProperty({ required: false, description: 'Current password for confirmation' })
  password?: string;

  @ApiProperty({ required: false, description: '6-digit TOTP code for confirmation' })
  code?: string;
}

export class SetupAdminDto {
  @ApiProperty({ example: 'admin', description: 'Administrator username' })
  username: string;

  @ApiProperty({ example: 'password123', description: 'Administrator password' })
  password: string;
}

