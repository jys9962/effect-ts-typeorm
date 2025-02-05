# TypeORM Transaction Manager

A transaction management library for TypeORM using Effect.ts.

## Installation

```bash
npm i @jys9962/effect-ts-typeorm 
```

## Basic Usage

### Create DataSource class

```typescript
// Create your database class
export class MyDB extends TaggedDataSource('DataSource')<MyDB>() {}

// Create Layer with TypeORM DataSource
const dataSource: DataSource; // = {...}
const MyDataSourceLive = Layer.succeed(MyDB, MyDB.of(dataSource));

// Use transaction
Effect.gen(function* () {
  // Not related to the transaction
  const dataSource: DataSource = yield* ADB;

  // Within a transaction
  const manager: EntityManager = yield* ADB.manager;
  const repository: Repository<UserEntity> = yield* ADB.getRepository(UserEntity);
  
}).pipe(
  MyDB.transactional(),
  Effect.provide(MyDataSourceLive),
  Effect.runPromise,
);
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

MyDB.transactional(Propagation.REQUIRED)
// Default = Propagation.REQUIRED 
MyDB.transactional()
```

### Transaction Hooks

```typescript
// Run after successful commit
pipe(
  MyDB.runOnCommit(() => {
    console.log('Committed!')
  }),
  MyDB.transactional()
)

// Run after rollback
pipe(
  MyDB.runOnRollback(() => {
    console.log('Rolled back!')
  }),
  MyDB.transactional()
)

// Run after transaction completes (success or failure)
pipe(
  MyDB.runOnComplete(() => {
    console.log('Completed!')
  }),
  MyDB.transactional()
)
```

