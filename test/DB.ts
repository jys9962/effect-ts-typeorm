import { EffectTypeORM } from '../src';

export class ADB extends EffectTypeORM('A')<ADB>() {}

export class BDB extends EffectTypeORM('B')<BDB>() {}
