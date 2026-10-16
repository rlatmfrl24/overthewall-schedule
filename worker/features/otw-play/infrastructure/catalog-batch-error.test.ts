import { expect, it } from 'vitest';
import { catalogBatchError } from './catalog-batch-error';

const stopped=new Error('D1_ERROR: content_transition_maintenance_stopped: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)');
it.each([stopped,new Error('Catalog batch constraint failed',{cause:stopped})])('preserves the durable maintenance refusal for the HTTP retry contract: %s',error=>{
  expect(catalogBatchError(error)).toBeNull();
});

it('keeps a real identity constraint as definitive validation failure',()=>{
  expect(catalogBatchError(new Error('UNIQUE constraint failed: music_entities.slug'))).toMatchObject({code:'validation_failed'});
});
