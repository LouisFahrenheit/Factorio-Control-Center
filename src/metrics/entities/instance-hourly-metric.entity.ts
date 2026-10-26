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

  @Column('float', { default: 0 })
  espmAvg: number;

  @Column('float', { default: 0 })
  espmMax: number;

  @Column('float', { default: 0 })
  evolutionAvg: number;

  @Column('float', { default: 0 })
  evolutionMax: number;

  @Column('float', { default: 0 })
  evolutionGlebaAvg: number;

  @Column('float', { default: 0 })
  evolutionGlebaMax: number;

  @Column('float', { default: 0 })
  pollutionAvg: number;

  @Column('float', { default: 0 })
  pollutionMax: number;

  @Column('float', { default: 0 })
  pollutionAbsorbedAvg: number;

  @Column('float', { default: 0 })
  pollutionAbsorbedMax: number;

  @Column('float', { default: 0 })
  pollutionGlebaAvg: number;

  @Column('float', { default: 0 })
  pollutionGlebaMax: number;

  @Column('float', { default: 0 })
  pollutionGlebaAbsorbedAvg: number;

  @Column('float', { default: 0 })
  pollutionGlebaAbsorbedMax: number;

  @Column('float', { default: 0 })
  pollutionTotalAvg: number;

  @Column('float', { default: 0 })
  pollutionTotalMax: number;

  @Column('float', { default: 0 })
  pollutionGlebaTotalAvg: number;

  @Column('float', { default: 0 })
  pollutionGlebaTotalMax: number;
}
