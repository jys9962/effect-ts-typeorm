import { Cause, Effect, Exit, Layer, Option, pipe } from 'effect';
import { Propagation } from '../src/enums/Propagation';
import { ADB, BDB } from './DB';
import { DataSourceFixture } from './dataSource.fixture';
import { DataSource } from 'typeorm';
import { PropagationError } from '../src/error/PropagationError';
import { UserEntity } from './user.entity';

const makeRunTest = (
  layer: Layer.Layer<ADB | BDB>,
) =>
  <A, E>(
    self: Effect.Effect<A, E, ADB | BDB>,
  ) => pipe(
    self,
    Effect.provide(layer),
    Effect.runPromiseExit,
  );

function assertSuccess<A, E>(exit: Exit.Exit<A, E>): asserts exit is Exit.Success<A, E> {
  expect(Exit.isSuccess(exit)).toBe(true);
}

function assertFailure<A, E>(exit: Exit.Exit<A, E>): asserts exit is Exit.Failure<A, E> {
  expect(Exit.isFailure(exit)).toBe(true);
}

describe('TaggedDataSource', function () {

  let ADataSource: DataSource;
  let BDataSource: DataSource;
  let runTest: <A, E>(self: Effect.Effect<A, E, ADB | BDB>) => Promise<Exit.Exit<A, E>>;

  beforeAll(async function () {
    ADataSource = DataSourceFixture.create({ name: 'A' });
    BDataSource = DataSourceFixture.create({ name: 'B' });

    await ADataSource.initialize();
    await BDataSource.initialize();

    runTest = makeRunTest(
      Layer.merge(
        ADB.makeLayer(ADataSource),
        BDB.makeLayer(BDataSource),
      ),
    );

    await ADataSource.manager.getRepository(UserEntity).save([
      new UserEntity(1, 'name1', new Date()),
      new UserEntity(2, 'name1', new Date()),
    ]);
  });

  afterAll(async function () {
    await ADataSource.manager.getRepository(UserEntity).clear();

    await ADataSource.destroy();
    await BDataSource.destroy();
  });

  describe('makeLive', function () {
    it('throw error when use different tag', async function () {
      const dataSource = DataSourceFixture.create();
      await dataSource.initialize();
      const result = () => pipe(
        ADB,
        Effect.provide(BDB.makeLayer(dataSource) as any as Layer.Layer<ADB>),
        Effect.runPromise,
      );

      await expect(result).rejects.toThrow();
      await dataSource.destroy();
    });
  });

  describe('execute transaction', function () {
    it('check transaction by row locked', async function () {
      const result = await Effect.gen(function* () {
        const aDb = yield* ADB;
        const bDb = yield* BDB;

        return yield* Effect.gen(function* () {
          const userRepository_A = yield* aDb.getRepository(UserEntity);
          const userRepository_B = yield* bDb.getRepository(UserEntity);

          const userByA = yield* Effect.promise(() =>
            userRepository_A.findOne({
              where: { id: 1 },
              lock: {
                mode: 'pessimistic_write',
              },
            }),
          );

          const userByB = yield* Effect.promise(() =>
            userRepository_B.findOne({
              where: { id: 1 },
              lock: {
                mode: 'pessimistic_write',
                onLocked: 'skip_locked',
              },
            }),
          );

          return { userByA, userByB }
        }).pipe(
          aDb.transactional(),
          bDb.transactional(),
        );
      }).pipe(
        runTest,
      );

      assertSuccess(result);
      expect(result.value.userByA).toBeInstanceOf(UserEntity)
      expect(result.value.userByB).toBeNull()
    });
  });

  describe('isInTransaction', function () {
    it('Returns true when in a transaction', async function () {
      const exit = await Effect.gen(function* () {
        const aDb = yield* ADB;
        const bDb = yield* BDB;

        return yield* pipe(
          aDb.isInTransaction,
          aDb.transactional(Propagation.REQUIRES_NEW),
        );
      }).pipe(runTest);

      assertSuccess(exit);
      const result = exit.value;
      expect(result).toBe(true);
    });

    it('Returns false when not in a transaction', async function () {
      const exit = await Effect.gen(function* () {
        const aDb = yield* ADB;
        return yield* pipe(
          aDb.isInTransaction,
          aDb.transactional(Propagation.NEVER),
        );
      }).pipe(runTest);

      assertSuccess(exit);
      const result = exit.value;
      expect(result).toBe(false);
    });

    it('Returns false when in a transaction from a different database', async function () {
      const exit = await Effect.gen(function* () {
        const aDb = yield* ADB;
        const bDb = yield* BDB;
        return yield* pipe(
          aDb.isInTransaction,
          bDb.transactional(Propagation.REQUIRES_NEW),
        );
      }).pipe(runTest);

      assertSuccess(exit);
      const result = exit.value;
      expect(result).toBe(false);
    });
  });

  describe('Transactional', function () {
    describe('Propagation.MANDATORY', function () {
      it('Throws an error when not in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.isInTransaction,
            aDb.transactional(Propagation.MANDATORY),
            aDb.transactional(Propagation.NOT_SUPPORTED),
          );
        }).pipe(runTest);

        assertFailure(exit);
        expect((exit.cause as Cause.Fail<any>).error).toStrictEqual(
          PropagationError.of(Propagation.MANDATORY),
        );
      });

      it('Maintains the current transaction without creating a new one', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.txId,
            aDb.transactional(Propagation.MANDATORY),
            Effect.andThen((txid) => Effect.all([Effect.succeed(txid), aDb.txId])),
            aDb.transactional(Propagation.REQUIRES_NEW),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        const id1 = Option.getOrThrow(result[0]);
        const id2 = Option.getOrThrow(result[1]);
        expect(id1).toBe(id2);
      });
    });

    describe('Propagation.NEVER', function () {
      it('Remains unchanged when not in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(aDb.isInTransaction, aDb.transactional(Propagation.NEVER));
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(false);
      });

      it('Throws an error when in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            Effect.void,
            aDb.transactional(Propagation.NEVER),
            aDb.transactional(Propagation.REQUIRED),
          );
        }).pipe(runTest);

        assertFailure(exit);
        expect((exit.cause as Cause.Fail<any>).error).toStrictEqual(
          PropagationError.of(Propagation.NEVER),
        );
      });
    });

    describe('Propagation.NOT_SUPPORTED', function () {
      it('Executes separately from the transaction even when in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.isInTransaction,
            aDb.transactional(Propagation.NOT_SUPPORTED),
            aDb.transactional(Propagation.REQUIRES_NEW),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(false);
      });
    });

    describe('Propagation.REQUIRED', function () {
      it('Creates a new transaction when not already in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.isInTransaction,
            aDb.transactional(Propagation.REQUIRED),
            aDb.transactional(Propagation.NOT_SUPPORTED),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(true);
      });

      it('Maintains the current transaction without creating a new one', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.txId,
            aDb.transactional(Propagation.REQUIRED),
            Effect.andThen((txid) => Effect.all([Effect.succeed(txid), aDb.txId])),
            aDb.transactional(Propagation.REQUIRED),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        const id1 = Option.getOrThrow(result[0]);
        const id2 = Option.getOrThrow(result[1]);
        expect(id1).toBe(id2);
      });
    });

    describe('Propagation.REQUIRES_NEW', function () {
      it('Creates a new transaction even when already in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.txId,
            aDb.transactional(Propagation.REQUIRES_NEW),
            Effect.andThen((txid) => Effect.all([Effect.succeed(txid), aDb.txId])),
            aDb.transactional(Propagation.REQUIRED),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        const id1 = Option.getOrThrow(result[0]);
        const id2 = Option.getOrThrow(result[1]);
        expect(id1).not.toBe(id2);
      });

      it('Creates a new transaction when not in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.isInTransaction,
            aDb.transactional(Propagation.REQUIRES_NEW),
            aDb.transactional(Propagation.NEVER),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(true);
      });
    });

    describe('Propagation.SUPPORTS', function () {
      it('Remains unchanged when not in a transaction', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.isInTransaction,
            aDb.transactional(Propagation.SUPPORTS),
            aDb.transactional(Propagation.NEVER),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(false);
      });

      it('Maintains the current transaction without creating a new one', async function () {
        const exit = await Effect.gen(function* () {
          const aDb = yield* ADB;
          return yield* pipe(
            aDb.txId,
            aDb.transactional(Propagation.SUPPORTS),
            Effect.andThen((txid) => Effect.all([Effect.succeed(txid), aDb.txId])),
            aDb.transactional(Propagation.REQUIRES_NEW),
          );
        }).pipe(runTest);

        assertSuccess(exit);
        const result = exit.value;
        const id1 = Option.getOrThrow(result[0]);
        const id2 = Option.getOrThrow(result[1]);
        expect(id1).toBe(id2);
      });
    });
  });

  describe('runOnCommit', function () {
    it('Successful case', async function () {
      const exit = await Effect.gen(function* () {
        let runCount = 0;
        const aDb = yield* ADB;

        yield* pipe(
          aDb.runOnCommit(() => {
            runCount += 1;
          }),
          aDb.transactional(),
        );

        return runCount;
      }).pipe(runTest);

      assertSuccess(exit);
      expect(exit.value).toBe(1);
    });

    it('Does not execute when not in a transaction', async function () {
      const exit = await Effect.gen(function* () {
        let runCount = 0;
        const aDb = yield* ADB;

        yield* pipe(
          aDb.runOnCommit(() => {
            runCount += 1;
          }),
          aDb.transactional(Propagation.NEVER),
        );

        return runCount;
      }).pipe(runTest);

      assertSuccess(exit);
      expect(exit.value).toBe(0);
    });

    it('Executes only once even if duplicate transactions exist', async function () {
      const exit = await Effect.gen(function* () {
        let runCount = 0;
        const aDb = yield* ADB;

        yield* pipe(
          aDb.runOnCommit(() => {
            runCount += 1;
          }),
          aDb.transactional(Propagation.REQUIRES_NEW),
          aDb.transactional(Propagation.REQUIRES_NEW),
        );

        return runCount;
      }).pipe(runTest);

      assertSuccess(exit);
      expect(exit.value).toBe(1);
    });

    it('Does not execute if the transaction fails', async function () {
      let runCount = 0;
      const exit = await Effect.gen(function* () {
        const aDb = yield* ADB;

        yield* pipe(
          aDb.runOnCommit(() => {
            runCount += 1;
          }),
          Effect.andThen(() => Effect.fail(new Error())),
          aDb.transactional(Propagation.REQUIRES_NEW),
          aDb.transactional(Propagation.REQUIRES_NEW),
        );
      }).pipe(runTest);

      expect(runCount).toBe(0);
    });
  });

  describe('runOnRollback', function () {
    it('Successful case', async function () {
      let runCount = 0;
      const exit = await Effect.gen(function* () {
        const aDb = yield* ADB;

        yield* pipe(
          aDb.runOnRollback(() => {
            runCount++;
          }),
          Effect.andThen(() => Effect.fail(new Error())),
          aDb.transactional(Propagation.REQUIRED),
        );
      }).pipe(runTest);

      expect(runCount).toBe(1);
    });
  });

  describe('runOnComplete', function () {
    it('Executes when successful', async function () {
      let runCount = 0;
      const exit = await Effect.gen(function* () {
        const aDb = yield* ADB;

        yield* pipe(
          aDb.runOnComplete(() => {
            runCount++;
          }),
          aDb.transactional(Propagation.REQUIRED),
        );
      }).pipe(runTest);

      expect(runCount).toBe(1);
    });

    it('Executes when failed', async function () {
      let runCount = 0;
      const exit = await Effect.gen(function* () {
        const aDb = yield* ADB;

        yield* pipe(
          aDb.runOnComplete(() => {
            runCount++;
          }),
          Effect.andThen(() => Effect.fail(new Error())),
          aDb.transactional(Propagation.REQUIRED),
        );
      }).pipe(runTest);

      expect(runCount).toBe(1);
    });
  });

});
