import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('instance_hourly_metrics')
@Index('IDX_HOURLY_METRIC', ['instanceId', 'timestamp'])
export class InstanceHourlyMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  instanceId: string;

  @Column()
  timestamp: Date;

  @Column('float')
  cpuAvg: number;

  @Column('float')
  cpuMax: number;

  @Column('bigint')
  memoryAvg: number;

  @Column('bigint')
  memoryMax: number;

  @Column('int')
  playersMax: number;

  @Column('float', { default: 60 })
  upsAvg: number;

  @Column('float', { default: 60 })
  upsMin: number;

  @Column('bigint', { default: 0 })
  saveSizeAvg: number;

  @Column('bigint', { default: 0 })
  saveSizeMax: number;

  @Column('float', { default: 0 })
  spmAvg: number;

  @Column('float', { default: 0 })
  spmMax: number;
}
