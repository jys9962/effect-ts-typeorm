import { DataSource } from 'typeorm';
import { Context, Effect, Option, pipe } from 'effect';
import { Propagation } from '../enums/Propagation';
import { TransactionContext } from './TransactionContext';
import { PropagationError } from '../error/PropagationError';

export const getTransactionTag =
  (dataSourceTag: Context.Tag<any, DataSource>) =>
    Context.Tag(`Transaction/${dataSourceTag.key}`)<any, TransactionContext>();

export const getTransactionCtx =
  (dataSourceTag: Context.Tag<any, DataSource>): Effect.Effect<Option.Option<TransactionContext>> =>
    pipe(
      getTransactionTag(dataSourceTag),
      tag => Effect.serviceOption(tag),
    );

const runWithNewTransaction =
  <DbTag, A, E, R>(
    dataSourceTag: Context.Tag<DbTag, DataSource>,
    self: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R | DbTag> =>
    Effect.gen(function* () {
      const dataSource = yield* dataSourceTag;
      const TransactionTag = getTransactionTag(dataSourceTag);

      const queryRunner = yield* pipe(
        Effect.promise(async () => {
          const queryRunner = dataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();
          return queryRunner;
        }),
        Effect.catchAll(() => Effect.die('DATABASE CONNECTION ERROR')),
      );
      const transactionCtx = TransactionContext.createInTransaction(queryRunner);

      return yield* pipe(
        self,
        Effect.provideService(TransactionTag, transactionCtx),
        Effect.tap(() => transactionCtx.commit()),
        Effect.catchAll((error) => transactionCtx.rollback(error)),
        Effect.ensuring(transactionCtx.ensuring()),
      );
    });

const runOriginal =
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self;

const runWithoutTransaction =
  <DbTag, A, E, R>(
    dataSourceTag: Context.Tag<DbTag, DataSource>,
    self: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R | DbTag> =>
    Effect.gen(function* () {
      const dataSource = yield* dataSourceTag;
      const transactionTag = getTransactionTag(dataSourceTag);

      return yield* pipe(
        self,
        Effect.provideService(transactionTag, TransactionContext.createNotInTransaction(dataSource.manager)),
      );
    });

export const makeGetTxId = <DbTag>(
  dataSourceTag: Context.Tag<DbTag, DataSource>,
): Effect.Effect<Option.Option<string>> =>
  pipe(
    getTransactionCtx(dataSourceTag),
    Effect.map(
      Option.match({
        onSome: (tx) => tx.id,
        onNone: () => Option.none(),
      }),
    ),
  );

export const makeIsInTransaction = <DbTag>(
  dataSourceTag: Context.Tag<DbTag, DataSource>,
): Effect.Effect<boolean, never, never> =>
  pipe(
    getTransactionCtx(dataSourceTag),
    Effect.andThen(
      Option.match({
        onSome: conn => Option.isSome(conn.id),
        onNone: () => false,
      }),
    ),
  );

export const makeTransactional = <DbTag>(
  dataSourceTag: Context.Tag<DbTag, DataSource>,
) => (
  propagation: Propagation = Propagation.REQUIRED,
) => <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | PropagationError, R | DbTag> =>
  Effect.gen(function* () {
    const isActive = yield* makeIsInTransaction(dataSourceTag);

    switch (propagation) {
      case Propagation.MANDATORY:
        return isActive
          ? yield* runOriginal(self)
          : yield* PropagationError.of(Propagation.MANDATORY);
      case Propagation.NEVER:
        return isActive
          ? yield* PropagationError.of(Propagation.NEVER)
          : yield* runOriginal(self);
      case Propagation.NOT_SUPPORTED:
        return yield* isActive
          ? runWithoutTransaction(dataSourceTag, self)
          : runOriginal(self);
      case Propagation.REQUIRED:
        return yield* isActive
          ? runOriginal(self)
          : runWithNewTransaction(dataSourceTag, self);
      case Propagation.REQUIRES_NEW:
        return yield* runWithNewTransaction(dataSourceTag, self);
      case Propagation.SUPPORTS:
        return yield* runOriginal(self);
    }

  });
