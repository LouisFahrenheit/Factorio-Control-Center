import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('instance_raw_metrics')
@Index('IDX_RAW_METRIC', ['instanceId', 'timestamp'])
export class InstanceRawMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  instanceId: string;

  @Column()
  timestamp: Date;

  @Column('float')
  cpuPercent: number;

  @Column('bigint')
  memoryBytes: number;

  @Column('int')
  onlinePlayers: number;

  @Column('float', { default: 60 })
  ups: number;

  @Column('bigint', { default: 0 })
  saveSize: number;

  @Column('float', { default: 0 })
  spm: number;
}
