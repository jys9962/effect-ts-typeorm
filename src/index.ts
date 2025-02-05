import { Context, Effect, Option } from 'effect';
import { DataSource, Repository } from 'typeorm';
import { Propagation } from './enums/Propagation';
import { ObjectLiteral } from 'typeorm/common/ObjectLiteral';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { taggedDataSourceImpl } from './transaction/taggedDataSource';
import { PropagationError } from './error/PropagationError';

export interface ITaggedDataSource<Self, Id> extends Context.TagClass<Self, Id, DataSource> {

  get txId(): Effect.Effect<Option.Option<string>>;

  get isInTransaction(): Effect.Effect<boolean>;

  transactional(
    propagation?: Propagation,
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PropagationError, R | Self>;

  getRepository<Entity extends ObjectLiteral>(
    target: EntityTarget<Entity>,
  ): Effect.Effect<Repository<Entity>, never, Self>;

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

export const TaggedDataSource: <const Id extends string>(id: Id) => <Self>() => ITaggedDataSource<Self, Id> =
  taggedDataSourceImpl;
