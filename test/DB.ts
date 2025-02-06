import { DB } from '../src';

export class ADB extends DB('A')<ADB>() {}

export class BDB extends DB('B')<BDB>() {}
