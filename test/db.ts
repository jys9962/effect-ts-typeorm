import { TaggedDataSource } from '../src';

export class ADB extends TaggedDataSource('A')<ADB>() {}

export class BDB extends TaggedDataSource('B')<BDB>() {}
