import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('maintenance_schedules')
export class MaintenanceSchedule {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ default: true })
  active: boolean;

  @Column({ default: '04:00' })
  timeHhmm: string;

  @Column('simple-json')
  weekdays: number[];

  @Column({ default: true })
  repeatWeekly: boolean;

  @Column({ default: false })
  manualOnly: boolean;

  @Column({ nullable: true })
  timezone: string;

  @Column('simple-json')
  instanceIds: string[];

  @Column('simple-json')
  options: any;

  @Column({ nullable: true })
  lastRunKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
