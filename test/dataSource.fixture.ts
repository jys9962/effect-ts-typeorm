import { DataSource } from 'typeorm';

export namespace DataSourceFixture {
  export const createA = () => new DataSource({
    type: 'mysql',
    name: 'A',
    poolSize: 10,
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'root',
    database: 'A',
    synchronize: false,
  });

  export const createB = () => new DataSource({
    type: 'mysql',
    name: 'B',
    poolSize: 10,
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'root',
    database: 'B',
    synchronize: false,
  });
}
