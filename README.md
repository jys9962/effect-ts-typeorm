# TypeORM Transaction Manager

A transaction management library for TypeORM using Effect.ts.

## Installation

```bash
npm i @jys9962/effect-ts-typeorm 
```

## Basic Usage

### Create DataSource class

```typescript
const dataSource: DataSource; // = new ... 

// Create your database class
export class MyDatabase extends EffectTypeORM('MyDatabase')<MyDatabase>() {
  
  static readonly Live: Layer.Layer<MyDatabase> =
    this.makeLayer(dataSource);
  
  static readonly Test: Layer.Layer<MyDatabase> =
    this.makeTest();
  
}

export class MyService extends Effect.Service<Db>()('Db', {
  effect: Effect.gen(function* () {
    const myDb = yield* MyDatabase;
    
    // transaction function
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

```

### Transaction Propagation

```typescript

export enum Propagation {
  /**
   * Support a current transaction, throw an exception if none exists.
   */
  MANDATORY = 'MANDATORY',
  /**
   * Execute non-transactionally, throw an exception if a transaction exists.
   */
  NEVER = 'NEVER',
  /**
   * Execute non-transactionally, suspend the current transaction if one exists.
   */
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  /**
   * Support a current transaction, create a new one if none exists.
   */
  REQUIRED = 'REQUIRED',
  /**
   * Create a new transaction, and suspend the current transaction if one exists.
   */
  REQUIRES_NEW = 'REQUIRES_NEW',
  /**
   * Support a current transaction, execute non-transactionally if none exists.
   */
  SUPPORTS = 'SUPPORTS'
}

// Default = Propagation.REQUIRED 
myDb.transactional(Propagation.REQUIRED)
```

### Transaction Hooks

```typescript
// Run after successful commit
pipe(
  myDb.runOnCommit(() => {
    console.log('Committed!')
  }),
  myDb.transactional()
)

// Run after rollback
pipe(
  myDb.runOnRollback(() => {
    console.log('Rolled back!')
  }),
  myDb.transactional()
)

// Run after transaction completes (success or failure)
pipe(
  myDb.runOnComplete(() => {
    console.log('Completed!')
  }),
  myDb.transactional()
)
```

