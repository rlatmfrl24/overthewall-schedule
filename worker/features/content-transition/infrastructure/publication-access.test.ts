import {expect,it} from 'vitest';
import {isPublicationCutoffSqlError} from './publication-access';
import {parseVideoCatalogFailure} from './youtube-video-read';

it('retains only the named atomic publication refusal as a definitive original SQL outcome',()=>{
  const sqlError="D1_ERROR: bad JSON path: 'publication_cutoff': SQLITE_ERROR";
  const failure={kind:'repository',code:'validation_failed',message:'Collection ended',fields:{policy:'publication_cutoff'},sqlError};
  expect(isPublicationCutoffSqlError(sqlError)).toBe(true);
  expect(parseVideoCatalogFailure(failure)).toEqual(failure);
  for(const unknown of ['D1_ERROR: malformed JSON: SQLITE_ERROR',"D1_ERROR: publication_cutoff: SQLITE_CONSTRAINT_TRIGGER",'Network unavailable']) {
    expect(isPublicationCutoffSqlError(unknown)).toBe(false);
    expect(parseVideoCatalogFailure({...failure,sqlError:unknown})).toBeNull();
  }
});
