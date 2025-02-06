import { Effect, Option, pipe } from 'effect';
import { EntityManager, QueryRunner } from 'typeorm';
import { EventType } from '../enums/EventType';

export type EventCallback = (error?: Error) => (void | Effect.Effect<any>)

export class TransactionContext {
  readonly id: Option.Option<string>;

  readonly events: {
    type: EventType,
    cb: EventCallback
  }[] = [];

  constructor(
    readonly manager: EntityManager,
    id?: string,
  ) {
    this.id = Option.fromNullable(id);
  }


  static createNotInTransaction(entityManager: EntityManager) {
    return new TransactionContext(entityManager);
  }

  static createInTransaction(queryRunner: QueryRunner): TransactionContext {
    return new TransactionContext(queryRunner.manager);
  }

  get isInTransaction() {
    return Option.isSome(this.id);
  }

  get queryRunner() {
    return this.manager.queryRunner;
  }

  commit() {
    if (!this.isInTransaction) {
      return Effect.void;
    }

    return pipe(
      Effect.promise(() => this.queryRunner!.commitTransaction()),
      Effect.tap(() => this.runCommit()),
      Effect.tap(() => this.runComplete()),
    );
  }

  rollback(error: any) {
    if (!this.isInTransaction) {
      return Effect.fail(error);
    }

    return pipe(
      Effect.promise(() => this.queryRunner!.rollbackTransaction()),
      Effect.tap(() => this.runRollback(error)),
      Effect.tap(() => this.runComplete(error)),
      Effect.andThen(() => Effect.fail(error)),
    );
  }

  ensuring() {
    if (!this.isInTransaction) {
      return Effect.void;
    }

    return pipe(
      Effect.promise(() => this.queryRunner!.release()),
      Effect.tap(() => this.clearEvent()),
    );
  }

  addEvent(type: EventType, callback: () => (void | Effect.Effect<any>)): void {
    this.events.push({
      type: type,
      cb: callback,
    });
  }

  runEvent(type: EventType, error?: Error) {
    const results = this.events
      .filter(t => t.type === type)
      .map(
        t => t.cb(error),
      );

    return Effect.all(
      (results as Effect.Effect<void>[]).filter(t => Effect.isEffect(t)),
      { concurrency: 'unbounded' },
    ).pipe(
      Effect.asVoid,
    );
  }

  runCommit(): Effect.Effect<void> {
    return this.runEvent(EventType.Commit);
  }

  runRollback(error: Error): Effect.Effect<void> {
    return this.runEvent(EventType.Rollback, error);
  }

  runComplete(error?: Error): Effect.Effect<void> {
    return this.runEvent(EventType.Complete, error);
  }

  clearEvent() {
    this.events.splice(0);
  }
}
