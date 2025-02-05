import { Cause, Effect, Exit, Layer, Option, pipe } from 'effect';
import { Propagation } from '../src/enums/Propagation';
import { ADB, BDB } from './db';
import { DataSourceFixture } from './dataSource.fixture';
import { DataSource } from 'typeorm';
import { PropagationError } from '../src/error/PropagationError';

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
    ADataSource = DataSourceFixture.createA();
    BDataSource = DataSourceFixture.createB();

    await ADataSource.initialize();
    await BDataSource.initialize();

    runTest = makeRunTest(
      Layer.merge(
        Layer.succeed(ADB, ADB.of(ADataSource)),
        Layer.succeed(BDB, BDB.of(BDataSource)),
      ),
    );
  });

  afterAll(async function () {
    await ADataSource.destroy();
    await BDataSource.destroy();
  });

  describe('isInTransaction', function () {
    it('Returns true when in a transaction', async function () {
      const exit = await pipe(
        ADB.isInTransaction,
        ADB.transactional(Propagation.REQUIRES_NEW),
        runTest,
      );

      assertSuccess(exit);
      const result = exit.value;
      expect(result).toBe(true);
    });

    it('Returns false when not in a transaction', async function () {
      const exit = await pipe(
        ADB.isInTransaction,
        ADB.transactional(Propagation.NEVER),
        runTest,
      );

      assertSuccess(exit);
      const result = exit.value;
      expect(result).toBe(false);
    });

    it('Returns false when in a transaction from a different database', async function () {
      const exit = await pipe(
        ADB.isInTransaction,
        BDB.transactional(Propagation.REQUIRES_NEW),
        runTest,
      );

      assertSuccess(exit);
      const result = exit.value;
      expect(result).toBe(false);
    });
  });

  describe('Transactional', function () {

    describe('Propagation.MANDATORY', function () {
      it('Throws an error when not in a transaction', async function () {
        const exit = await pipe(
          ADB.isInTransaction,
          ADB.transactional(Propagation.MANDATORY),
          ADB.transactional(Propagation.NOT_SUPPORTED),
          runTest,
        );

        assertFailure(exit);
        expect((exit.cause as Cause.Fail<any>).error).toStrictEqual(PropagationError.of(Propagation.MANDATORY));
      });

      it('Maintains the current transaction without creating a new one', async function () {
        const exit = await pipe(
          ADB.txId,
          ADB.transactional(Propagation.MANDATORY),
          Effect.andThen((txid) => Effect.all([Effect.succeed(txid), ADB.txId])),
          ADB.transactional(Propagation.REQUIRES_NEW),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        const id1 = Option.getOrThrow(result[0]);
        const id2 = Option.getOrThrow(result[1]);
        expect(id1).toBe(id2);
      });

    });
    describe('Propagation.NEVER', function () {
      it('Remains unchanged when not in a transaction', async function () {
        const exit = await pipe(
          ADB.isInTransaction,
          ADB.transactional(Propagation.NEVER),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(false);
      });

      it('Throws an error when in a transaction', async function () {
        const exit = await pipe(
          Effect.void,
          ADB.transactional(Propagation.NEVER),
          ADB.transactional(Propagation.REQUIRED),
          runTest,
        );

        assertFailure(exit);
        expect((exit.cause as Cause.Fail<any>).error).toStrictEqual(PropagationError.of(Propagation.NEVER));
      });
    });

    describe('Propagation.NOT_SUPPORTED', function () {
      it('Executes separately from the transaction even when in a transaction', async function () {
        const exit = await pipe(
          ADB.isInTransaction,
          ADB.transactional(Propagation.NOT_SUPPORTED),
          ADB.transactional(Propagation.REQUIRES_NEW),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(false);
      });
    });
    describe('Propagation.REQUIRED', function () {
      it('Creates a new transaction when not already in a transaction', async function () {
        const exit = await pipe(
          ADB.isInTransaction,
          ADB.transactional(Propagation.REQUIRED),
          ADB.transactional(Propagation.NOT_SUPPORTED),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(true);
      });

      it('Maintains the current transaction without creating a new one', async function () {
        const exit = await pipe(
          ADB.txId,
          ADB.transactional(Propagation.REQUIRED),
          Effect.andThen((txid) => Effect.all([Effect.succeed(txid), ADB.txId])),
          ADB.transactional(Propagation.REQUIRED),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        const id1 = Option.getOrThrow(result[0]);
        const id2 = Option.getOrThrow(result[1]);
        expect(id1).toBe(id2);
      });
    });
    describe('Propagation.REQUIRES_NEW', function () {
      it('Creates a new transaction even when already in a transaction', async function () {
        const exit = await pipe(
          ADB.txId,
          ADB.transactional(Propagation.REQUIRES_NEW),
          Effect.andThen((txid) => Effect.all([Effect.succeed(txid), ADB.txId])),
          ADB.transactional(Propagation.REQUIRED),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        const id1 = Option.getOrThrow(result[0]);
        const id2 = Option.getOrThrow(result[1]);
        expect(id1).not.toBe(id2);
      });

      it('Creates a new transaction when not in a transaction', async function () {
        const exit = await pipe(
          ADB.isInTransaction,
          ADB.transactional(Propagation.REQUIRES_NEW),
          ADB.transactional(Propagation.NEVER),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(true);
      });
    });

    describe('Propagation.SUPPORTS', function () {
      it('Remains unchanged when not in a transaction', async function () {
        const exit = await pipe(
          ADB.isInTransaction,
          ADB.transactional(Propagation.SUPPORTS),
          ADB.transactional(Propagation.NEVER),
          runTest,
        );

        assertSuccess(exit);
        const result = exit.value;
        expect(result).toBe(false);
      });

      it('Maintains the current transaction without creating a new one', async function () {
        const exit = await pipe(
          ADB.txId,
          ADB.transactional(Propagation.SUPPORTS),
          Effect.andThen((txid) => Effect.all([Effect.succeed(txid), ADB.txId])),
          ADB.transactional(Propagation.REQUIRES_NEW),
          runTest,
        );

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
      let runCount = 0;
      await pipe(
        ADB.runOnCommit(() => {
          runCount += 1;
        }),
        ADB.transactional(),
        runTest,
      );

      expect(runCount).toBe(1);
    });

    it('Does not execute when not in a transaction', async function () {
      let runCount = 0;
      await pipe(
        ADB.runOnCommit(() => {
          runCount += 1;
        }),
        ADB.transactional(Propagation.NEVER),
        runTest,
      );

      expect(runCount).toBe(0);
    });

    it('Executes only once even if duplicate transactions exist', async function () {
      let runCount = 0;
      await pipe(
        ADB.runOnCommit(() => {
          runCount += 1;
        }),
        ADB.transactional(Propagation.REQUIRES_NEW),
        ADB.transactional(Propagation.REQUIRES_NEW),
        runTest,
      );

      expect(runCount).toBe(1);
    });

    it('Does not execute if the transaction fails', async function () {
      let runCount = 0;
      await pipe(
        ADB.runOnCommit(() => {
          runCount += 1;
        }),
        Effect.andThen(() => Effect.fail(new Error())),
        ADB.transactional(Propagation.REQUIRES_NEW),
        ADB.transactional(Propagation.REQUIRES_NEW),
        runTest,
      );

      expect(runCount).toBe(0);
    });

  });

  describe('runOnRollback', function () {
    it('Successful case', async function () {
      let runCount = 0;
      await pipe(
        ADB.runOnRollback(() => {
          runCount++;
        }),
        Effect.andThen(() => Effect.fail(new Error)),
        ADB.transactional(Propagation.REQUIRED),
        runTest,
      );

      expect(runCount).toBe(1);
    });
  });

  describe('runOnComplete', function () {
    it('Executes when successful', async function () {
      let runCount = 0;
      await pipe(
        ADB.runOnComplete(() => {
          runCount++;
        }),
        ADB.transactional(Propagation.REQUIRED),
        runTest,
      );

      expect(runCount).toBe(1);
    });

    it('Executes when failed', async function () {
      let runCount = 0;
      await pipe(
        ADB.runOnComplete(() => {
          runCount++;
        }),
        Effect.andThen(() => Effect.fail(new Error)),
        ADB.transactional(Propagation.REQUIRED),
        runTest,
      );

      expect(runCount).toBe(1);
    });
  });
});
