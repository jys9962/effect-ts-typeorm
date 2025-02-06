import { EffectTypeORM } from '../src';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Effect, Layer } from 'effect';
import { UserEntity } from './user.entity';

export class ADB extends EffectTypeORM('A')<ADB>() {}

export class BDB extends EffectTypeORM('B')<BDB>() {}


declare const dataSource: DataSource;

// Create your database class
export class MyDatabase extends EffectTypeORM('MyDatabase')<MyDatabase>() {
  static readonly Live: Layer.Layer<MyDatabase> = this.makeLayer(dataSource);
  static readonly Test: Layer.Layer<MyDatabase> = this.makeTest();
}

export class Db extends Effect.Service<Db>()('Db', {
  effect: Effect.gen(function* () {
    const myDb = yield* MyDatabase;

    // Use db
    const myFunc = Effect.gen(function* () {
      // Not related to the transaction
      const dataSource = yield* myDb.dataSource;

      // Within a transaction
      const manager: EntityManager = yield* myDb.manager;
      const repository: Repository<UserEntity> = yield* myDb.getRepository(UserEntity);

      // ...

    }).pipe(
      myDb.transactional(),
    );

    return {
      myFunc,
    } as const;
  }),
  dependencies: [MyDatabase.Live],
}) {
  // use test
  static Test = this.DefaultWithoutDependencies.pipe(
    Layer.merge(MyDatabase.Test),
  );
}
