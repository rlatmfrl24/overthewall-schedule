import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {captureMigrationStatements} from "./capture-statements";
import {fileReferenceGuardTriggers} from "../../assets/infrastructure/file-retention";
import {historicalFileRetentionTriggers} from "./file-retention";
import {fileReferenceInputStatements,fileReferenceIndexGuardStatements,fileOriginSql,filePathSql} from "./file-reference-index";
import {fileInventoryGuardStatements} from "./file-inventory-statements";

it("matches the applied inventory/path migration with the owning generators within D1 statement bounds",()=>{
  const statements=[...fileReferenceInputStatements(),...fileReferenceIndexGuardStatements(),...fileReferenceGuardTriggers(),...historicalFileRetentionTriggers(),...fileInventoryGuardStatements(),...captureMigrationStatements()];
  const drops=statements.map(statement=>statement.match(/^CREATE (TRIGGER|VIEW) ([a-z0-9_]+)/i)).filter(match=>match!==null).map(match=>`DROP ${match[1]} IF EXISTS ${match[2]}`);
  const seed=`INSERT INTO asset_file_reference_paths(row_table,row_key,field,raw_url,origin,path) SELECT row_table,row_key,field,raw_url,${fileOriginSql("raw_url")},${filePathSql("raw_url")} FROM asset_file_reference_inputs`;
  const generated="-- Refresh owning path semantics and inventory retention guards; rebuild only the derived URL index.\n"+[...drops,"DELETE FROM asset_file_reference_paths",...statements,seed].join(";\n--> statement-breakpoint\n")+";\n";
  expect(readFileSync("drizzle/0114_asset_file_inventory_guards.sql","utf8").replaceAll("\r\n","\n")).toBe(generated);
  expect(Math.max(...statements.map(statement=>Buffer.byteLength(statement)))).toBeLessThanOrEqual(100000);
  console.info("fix1 inventory migration parity",{statements:statements.length,maxBytes:Math.max(...statements.map(statement=>Buffer.byteLength(statement)))});
});
