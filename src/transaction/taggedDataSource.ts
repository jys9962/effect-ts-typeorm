import { Context, Effect, Option } from 'effect';
import { DataSource } from 'typeorm';
import { makeGetTxId, makeIsInTransaction, makeTransactional } from './transaction';
import { makeEventCallback, makeGetRepository } from './make-with-repository';
import { EventType } from '../enums/EventType';
import { ITaggedDataSource } from '../index';

export const taggedDataSourceImpl =
  <const Id extends string>(id: Id) =>
    <Self>() =>
      class extends Context.Tag(`DataSource/${id}`)<Self, DataSource>() {
        static txId: Effect.Effect<Option.Option<string>> = makeGetTxId(this);
        static isInTransaction = makeIsInTransaction(this);
        static transactional = makeTransactional(this);
        static getRepository = makeGetRepository(this);
        static runOnCommit = makeEventCallback(this, EventType.Commit);
        static runOnRollback = makeEventCallback(this, EventType.Rollback);
        static runOnComplete = makeEventCallback(this, EventType.Complete);
      } satisfies ITaggedDataSource<any, any> as any;
