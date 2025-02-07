import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserEntity {

  @PrimaryColumn()
  id!: number;

  @Column()
  name!: string;

  @Column('datetime', { name: 'created_at' })
  createdAt!: Date;

  constructor(id: number, name: string, createdAt: Date) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
  }
}
