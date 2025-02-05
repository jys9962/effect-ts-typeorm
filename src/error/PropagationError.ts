import { Data } from 'effect';
import { Propagation } from '../enums/Propagation';

export class PropagationError extends Data.TaggedError('PropagationError')<{
  propagation: Propagation
}> {
  static of(propagation: Propagation) {
    return new PropagationError({ propagation });
  }
}
