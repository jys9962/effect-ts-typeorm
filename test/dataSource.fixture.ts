import { DataSource } from 'typeorm';
import { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';
import { UserEntity } from './user.entity';

export namespace DataSourceFixture {
  export const create = (
    option?: Partial<MysqlConnectionOptions>,
  ) => new DataSource({
    type: 'mysql',
    poolSize: 10,
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'root',
    database: 'api',
    synchronize: true,
    entities: [UserEntity],
    ...option,
  });
}
