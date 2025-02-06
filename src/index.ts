import { Context, Effect, Layer, Option } from 'effect';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Propagation } from './enums/Propagation';
import { PropagationError } from './error/PropagationError';
import { ObjectLiteral } from 'typeorm/common/ObjectLiteral';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { makeDbEffect, makeForTest } from './transaction/makeDb';

export interface IDB {
  get txId(): Effect.Effect<Option.Option<string>>;

  get isInTransaction(): Effect.Effect<boolean>;

  get dataSource(): Effect.Effect<DataSource>;

  get manager(): Effect.Effect<EntityManager>;

  transactional(
    propagation?: Propagation,
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PropagationError, R>;

  getRepository<Entity extends ObjectLiteral>(
    target: EntityTarget<Entity>,
  ): Effect.Effect<Repository<Entity>>;

  runOnCommit(
    callback: () => (void | Effect.Effect<any>),
  ): Effect.Effect<void>;

  runOnRollback(
    callback: (error: Error) => (void | Effect.Effect<any>),
  ): Effect.Effect<void>;

  runOnComplete(
    callback: (error?: Error) => (void | Effect.Effect<any>),
  ): Effect.Effect<void>;
}

export interface DbImpl<Self, Id> extends Context.TagClass<Self, Id, IDB> {
  makeLayer(dataSource: DataSource): Layer.Layer<Self>;

  makeTest(): Layer.Layer<Self>;
}

export const taggedDataSourceImpl =
  <const Id extends string>(id: Id) =>
    <Self>() =>
      class extends Context.Tag(`DataSource/${id}`)<Self, IDB>() {
        static makeLayer =
          (dataSource: DataSource) =>
            Layer.effect(this, makeDbEffect(this)(dataSource));

        static makeTest =
          () =>
            Layer.effect(this, makeForTest(this)());
      } satisfies DbImpl<Self, any> as DbImpl<Self, Id>;

export const DB: <const Id extends string>(id: Id) => <Self>() => DbImpl<Self, Id> =
  taggedDataSourceImpl;
