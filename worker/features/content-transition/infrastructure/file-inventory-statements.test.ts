import {readFileSync} from "node:fs";
import {createHash} from 'node:crypto';
import {expect,it} from "vitest";
import {captureMigrationStatements} from "./capture-statements";
import {fileReferenceGuardTriggers} from "../../assets/infrastructure/file-retention";
import {historicalFileRetentionTriggers} from "./file-retention";
import {fileReferenceInputStatements,fileReferenceIndexGuardStatements,fileOriginSql,filePathSql} from "./file-reference-index";
import {fileInventoryGuardStatements} from "./file-inventory-statements";
import {maintenanceGuardStatements} from './maintenance';
import {sourceJsonValidationStatements} from './source-json-validation';

it('matches current incremental capture and maintenance guards without altering applied generations',()=>{
  const migration=readFileSync('drizzle/0134_transition_abort_evidence.sql','utf8').replaceAll('\r\n','\n');
  expect(createHash('sha256').update(migration).digest('hex')).toBe('5bd65ccf4da655f66e3951b674a441a4763bbf8e7bae58ed6f76217887fb0f03');
  const scheduled=/^CREATE TRIGGER maintenance_(?:scheduled_admission|scheduled_retry|scheduled_job_items_claim|scheduled_outbox_claim) /;
  const repair=/^CREATE TRIGGER maintenance_x_(?:post_repair_work|quote_body_work)_/;
  const statements=[...captureMigrationStatements(),...maintenanceGuardStatements().filter(statement=>!scheduled.test(statement)&&!repair.test(statement))];
  const drops=statements.map(statement=>statement.match(/^CREATE (TRIGGER|VIEW) ([a-z0-9_]+)/i)).filter(match=>match!==null).map(match=>`DROP ${match[1]} IF EXISTS ${match[2]}`);
  const originalJsonRoot=migration.split('--> statement-breakpoint').map(statement=>statement.trim().replace(/;$/,'')).find(statement=>statement.startsWith('CREATE VIEW content_transition_json_roots '))!;
  const originalStatements=statements.map(statement=>statement.startsWith('CREATE VIEW content_transition_json_roots ')?originalJsonRoot:statement);
  expect(migration.split('-- Generated abort-aware capture and maintenance guards.\n')[1]).toBe([...drops,...originalStatements].join(';\n--> statement-breakpoint\n')+';\n');
  expect(readFileSync('drizzle/0140_publication-ingestion-evidence.sql','utf8').replaceAll('\r\n','\n')).toBe('-- Preserve issued ingestion evidence in the canonical transition JSON validator.\nDROP VIEW IF EXISTS content_transition_json_roots;\n--> statement-breakpoint\n'+sourceJsonValidationStatements()[0]+';\n');
  const incremental=readFileSync('drizzle/0135_transition_scheduled_reconciliation.sql','utf8').replaceAll('\r\n','\n');
  const added=maintenanceGuardStatements().filter(statement=>scheduled.test(statement));
  expect(added).toHaveLength(4);
  expect(incremental.split('-- Generated scheduled admission guards.\n')[1]).toBe(added.join(';\n--> statement-breakpoint\n')+';\n');
  const repairGuards=maintenanceGuardStatements().filter(statement=>repair.test(statement));
  expect(repairGuards).toHaveLength(6);
  expect(readFileSync('drizzle/0139_x-repair-maintenance-guards.sql','utf8').replaceAll('\r\n','\n'))
    .toBe('-- Generated X repair maintenance guards.\n'+repairGuards.join(';\n--> statement-breakpoint\n')+';\n');
  expect(Math.max(...statements.map(statement=>Buffer.byteLength(statement)))).toBeLessThanOrEqual(100000);
  console.info('current capture/maintenance migration parity',{statements:statements.length,maxBytes:Math.max(...statements.map(statement=>Buffer.byteLength(statement)))});
});

it("preserves applied file authority",()=>{
  const fileStatements=[...fileReferenceInputStatements(),...fileReferenceIndexGuardStatements(),...fileReferenceGuardTriggers(),...historicalFileRetentionTriggers(),...fileInventoryGuardStatements()];
  const applied=readFileSync("drizzle/0117_asset_file_decode_validity.sql","utf8").replaceAll("\r\n","\n");
  for(const statement of fileStatements) expect(applied).toContain(statement.replace(/[ \t]+$/gm,""));
  const seed=`INSERT INTO asset_file_reference_paths(row_table,row_key,field,raw_url,origin,path) SELECT row_table,row_key,field,raw_url,${fileOriginSql("raw_url")},${filePathSql("raw_url")} FROM asset_file_reference_inputs`;
  expect(applied).toContain(seed);
});
