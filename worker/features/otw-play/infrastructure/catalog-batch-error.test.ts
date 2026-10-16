import { expect, it } from 'vitest';
import { catalogBatchError } from './catalog-batch-error';

it('keeps a real identity constraint as definitive validation failure',()=>{
  expect(catalogBatchError(new Error('UNIQUE constraint failed: music_entities.slug'))).toMatchObject({code:'validation_failed'});
});
