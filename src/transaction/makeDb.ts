import { DataSource, Repository } from 'typeorm';
import { Context, Effect, Option, pipe } from 'effect';
import { TransactionContext } from './TransactionContext';
import { Propagation } from '../enums/Propagation';
import { PropagationError } from '../error/PropagationError';
import { ObjectLiteral } from 'typeorm/common/ObjectLiteral';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { EventType } from '../enums/EventType';
import { IDB } from '../index';
import { v4 as uuidv4 } from 'uuid';


const getTransactionTag =
  <Self>(dataSourceTag: Context.Tag<Self, IDB>) =>
    Context.Tag(`Transaction/${dataSourceTag.key}`)<any, TransactionContext>();

export const makeDbEffect =
  <Self>(_this: Context.Tag<Self, IDB>) =>
    (dataSource: DataSource) =>
      Effect.gen(function* () {
          const TransactionTag = getTransactionTag(_this);
          const transactionCtxOption = Effect.serviceOption(TransactionTag);

          const txId = pipe(
            transactionCtxOption,
            Effect.map(
              Option.match({
                onSome: (tx) => tx.id,
                onNone: () => Option.none(),
              }),
            ),
          );

          const isInTransaction = pipe(
            transactionCtxOption,
            Effect.andThen(
              Option.match({
                onSome: conn => Option.isSome(conn.id),
                onNone: () => false,
              }),
            ),
          );

          const manager = pipe(
            transactionCtxOption,
            Effect.andThen(
              Option.match({
                onSome: ({ manager }) => manager,
                onNone: () => dataSource.manager,
              }),
            ),
          );

          const runWithNewTransaction =
            <A, E, R>(
              self: Effect.Effect<A, E, R>,
            ): Effect.Effect<A, E, R> =>
              pipe(
                Effect.promise(async () => {
                  const queryRunner = dataSource.createQueryRunner();
                  await queryRunner.connect();
                  await queryRunner.startTransaction();
                  return queryRunner;
                }),
                Effect.catchAll(() => Effect.die('DATABASE CONNECTION ERROR')),
                Effect.andThen(runner => new TransactionContext(runner.manager, uuidv4())),
                Effect.andThen((transactionCtx) =>
                  pipe(
                    self,
                    Effect.provideService(TransactionTag, transactionCtx),
                    Effect.tap(() => transactionCtx.commit()),
                    Effect.catchAll((error) => transactionCtx.rollback(error)),
                    Effect.ensuring(transactionCtx.ensuring()),
                  )),
              );

          const runOriginal =
            <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
              self;

          const runWithoutTransaction =
            <A, E, R>(
              self: Effect.Effect<A, E, R>,
            ): Effect.Effect<A, E, R> =>
              pipe(
                self,
                Effect.provideService(TransactionTag, new TransactionContext(dataSource.manager)),
              );

          const transactional = (
              propagation: Propagation = Propagation.REQUIRED,
            ) => <A, E, R>(
              self: Effect.Effect<A, E, R>,
            ): Effect.Effect<A, E | PropagationError, R> =>
              pipe(
                isInTransaction,
                Effect.andThen((isActive) =>
                  ({
                    [Propagation.MANDATORY]: isActive
                      ? runOriginal(self)
                      : PropagationError.of(Propagation.MANDATORY),
                    [Propagation.NEVER]: isActive
                      ? PropagationError.of(Propagation.NEVER)
                      : runOriginal(self),
                    [Propagation.NOT_SUPPORTED]: isActive
                      ? runWithoutTransaction(self)
                      : runOriginal(self),
                    [Propagation.REQUIRED]: isActive
                      ? runOriginal(self)
                      : runWithNewTransaction(self),
                    [Propagation.REQUIRES_NEW]:
                      runWithNewTransaction(self),
                    [Propagation.SUPPORTS]:
                      runOriginal(self),
                  })[propagation],
                ),
              )
          ;

          const getRepository = <Entity extends ObjectLiteral>(
            target: EntityTarget<Entity>,
          ): Effect.Effect<Repository<Entity>> =>
            pipe(
              manager,
              Effect.andThen((manager) =>
                manager.getRepository(target),
              ),
            );

          const makeEventCallback =
            (type: EventType) =>
              (callback: any) =>
                pipe(
                  transactionCtxOption,
                  Effect.tap(
                    Option.map((tx) => tx.addEvent(type, callback)),
                  ),
                  Effect.ignore,
                );

          return {
            txId: txId,
            isInTransaction: isInTransaction,
            dataSource: Effect.succeed(dataSource),
            manager: manager,
            transactional: transactional,
            getRepository: getRepository,
            runOnCommit: makeEventCallback(EventType.Commit),
            runOnRollback: makeEventCallback(EventType.Rollback),
            runOnComplete: makeEventCallback(EventType.Complete),
          } satisfies IDB;
        },
      );

export const makeForTest = <Self>(_this: Context.Tag<Self, IDB>) =>
  () =>
    Effect.gen(function* () {
        const TransactionTag = getTransactionTag(_this);
        const transactionCtxOption = Effect.serviceOption(TransactionTag);

        const txId = pipe(
          transactionCtxOption,
          Effect.map(
            Option.match({
              onSome: (tx) => tx.id,
              onNone: () => Option.none(),
            }),
          ),
        );

        const isInTransaction = pipe(
          transactionCtxOption,
          Effect.andThen(
            Option.match({
              onSome: conn => Option.isSome(conn.id),
              onNone: () => false,
            }),
          ),
        );

        const runWithNewTransaction =
          <A, E, R>(
            self: Effect.Effect<A, E, R>,
          ): Effect.Effect<A, E, R> =>
            pipe(
              Effect.succeed(new TransactionContext(null as any, uuidv4())),
              Effect.andThen(transactionCtx =>
                pipe(
                  self,
                  Effect.provideService(TransactionTag, transactionCtx),
                  Effect.tap(() => Effect.all([
                    transactionCtx.runCommit(),
                    transactionCtx.runComplete(),
                  ])),
                  Effect.catchAll((error: any) => pipe(
                    Effect.all([
                      transactionCtx.runRollback(error),
                      transactionCtx.runComplete(error),
                    ]),
                    Effect.andThen(() => Effect.fail(error)),
                  )),
                  Effect.ensuring(Effect.sync(() => transactionCtx.clearEvent())),
                ),
              ),
            );

        const runOriginal =
          <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
            self;

        const runWithoutTransaction =
          <A, E, R>(
            self: Effect.Effect<A, E, R>,
          ): Effect.Effect<A, E, R> =>
            pipe(
              self,
              Effect.provideService(TransactionTag, new TransactionContext(null as any)),
            );

        const transactional = (
            propagation: Propagation = Propagation.REQUIRED,
          ) => <A, E, R>(
            self: Effect.Effect<A, E, R>,
          ): Effect.Effect<A, E | PropagationError, R> =>
            pipe(
              isInTransaction,
              Effect.andThen((isActive) =>
                ({
                  [Propagation.MANDATORY]: isActive
                    ? runOriginal(self)
                    : PropagationError.of(Propagation.MANDATORY),
                  [Propagation.NEVER]: isActive
                    ? PropagationError.of(Propagation.NEVER)
                    : runOriginal(self),
                  [Propagation.NOT_SUPPORTED]: isActive
                    ? runWithoutTransaction(self)
                    : runOriginal(self),
                  [Propagation.REQUIRED]: isActive
                    ? runOriginal(self)
                    : runWithNewTransaction(self),
                  [Propagation.REQUIRES_NEW]:
                    runWithNewTransaction(self),
                  [Propagation.SUPPORTS]:
                    runOriginal(self),
                })[propagation],
              ),
            )
        ;

        const getRepository = <Entity extends ObjectLiteral>(
          target: EntityTarget<Entity>,
        ) =>
          Effect.void;

        const makeEventCallback =
          (type: EventType) =>
            (callback: any) =>
              pipe(
                transactionCtxOption,
                Effect.tap(
                  Option.map((tx) => tx.addEvent(type, callback)),
                ),
                Effect.ignore,
              );

        return {
          txId: txId,
          isInTransaction: isInTransaction,
          dataSource: Effect.void,
          manager: Effect.void,
          transactional: transactional,
          getRepository: getRepository,
          runOnCommit: makeEventCallback(EventType.Commit),
          runOnRollback: makeEventCallback(EventType.Rollback),
          runOnComplete: makeEventCallback(EventType.Complete),
        } as any;
      },
    );
