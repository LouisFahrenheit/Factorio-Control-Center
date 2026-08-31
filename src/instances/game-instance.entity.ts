import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('game_instances')
export class GameInstance {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  serverPath: string;

  @Column({ default: '0.0.0.0' })
  ip: string;

  @Column({ default: '34197' })
  port: string;

  @Column({ type: 'int', default: 0 })
  rconPort: number;

  @Column({ default: '' })
  rconPassword: string;

  @Column({ default: false })
  autostartServer: boolean;

  @Column({ default: false })
  autoEnterPanel: boolean;

  @Column({ default: 'latest' })
  launchSave: string;

  @Column({ default: false })
  maintenanceLock: boolean;

  @Column({ default: false })
  blockUpdates: boolean;

  @Column({ default: false })
  experimentalUpdates: boolean;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ type: 'text', default: '' })
  publicDescription: string;

  @Column({ default: '' })
  publicConnectionAddress: string;

  @Column({ default: false })
  collectGameMetrics: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
