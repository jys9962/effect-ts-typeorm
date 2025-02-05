import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserEntity {

  @PrimaryColumn()
  id!: number;

  @Column()
  name!: string;

  @Column('datetime', { name: 'created_at' })
  createdAt!: Date;

}
