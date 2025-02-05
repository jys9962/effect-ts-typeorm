import { ObjectLiteral } from 'typeorm/common/ObjectLiteral';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { Context, Effect, Option, pipe } from 'effect';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { getTransactionTag } from './transaction';
import { EventType } from '../enums/EventType';

export const getEntityManager =
  <DbTag>(
    dataSourceTag: Context.Tag<DbTag, DataSource>,
  ): Effect.Effect<EntityManager, never, DbTag> =>
    pipe(
      getTransactionTag(dataSourceTag),
      txCtx => Effect.serviceOption(txCtx),
      Effect.andThen(
        Option.match({
          onSome: ({ manager }) => Effect.succeed(manager),
          onNone: () => dataSourceTag.pipe(
            Effect.andThen((dataSource) => dataSource.manager),
          ),
        }),
      ),
    );

export const makeGetRepository =
  <DbTag>(
    dataSourceTag: Context.Tag<DbTag, DataSource>,
  ) =>
    <Entity extends ObjectLiteral>(
      target: EntityTarget<Entity>,
    ): Effect.Effect<Repository<Entity>, never, DbTag> =>
      pipe(
        getEntityManager(dataSourceTag),
        Effect.andThen((manager) =>
          manager.getRepository(target),
        ),
      );

export const makeEventCallback =
  <DbTag>(
    dataSourceTag: Context.Tag<DbTag, DataSource>,
    type: EventType,
  ) =>
    (callback: any) =>
      pipe(
        getTransactionTag(dataSourceTag),
        Effect.serviceOption,
        Effect.tap(
          Option.map((tx) => tx.addEvent(type, callback)),
        ),
        Effect.ignore,
      );
