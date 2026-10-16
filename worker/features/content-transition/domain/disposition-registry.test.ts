import {describe,expect,it} from "vitest";
import {getTableConfig} from "drizzle-orm/sqlite-core";
import * as schema from "../../../../db/schema";
import {contentDispositionRegistry} from "./disposition-registry";
import {knownJsonFormats} from "./projected-content";
import {captureMigrationStatements} from "../infrastructure/capture-statements";
import {captureEdges} from "../infrastructure/capture-graph";

describe("versioned canonical content disposition inventory",()=>{
  it("classifies every canonical column exactly once, with reasons and known parsed JSON",()=>{
    const tables=Object.values(schema).flatMap(value=>{try{return [getTableConfig(value as never)];}catch{return [];}});
    expect(Object.keys(contentDispositionRegistry).sort()).toEqual(tables.map(table=>table.name).sort());
    for(const table of tables) {
      const entry=contentDispositionRegistry[table.name as keyof typeof contentDispositionRegistry];
      const columns=[...entry.values,...entry.excluded,...Object.keys(entry.json)];
      expect(columns.sort(),table.name).toEqual(table.columns.map(column=>column.name).sort());
      expect(entry.reason.length).toBeGreaterThan(20);
      expect(Object.keys(entry.excludedReasons).sort()).toEqual([...entry.excluded].sort());
      for(const shape of Object.values(entry.json)) expect(knownJsonFormats).toContain(shape);
      for(const reason of Object.values(entry.excludedReasons)) expect(reason.length).toBeGreaterThan(20);
    }
  });
  it("bounds generated SQL and traverses dependency rows without aggregating source adjacency",()=>{
    const statements=captureMigrationStatements();
    expect(captureEdges.length).toBeLessThanOrEqual(124);
    for(const statement of statements) {
      expect(new TextEncoder().encode(statement).length).toBeLessThanOrEqual(100_000);
      expect(statement).not.toContain("json_group_array");
      if(statement.includes("WITH RECURSIVE closure")) {
        expect(statement.match(/FROM closure c CROSS JOIN/g)).toHaveLength(4);
        expect(statement.match(/UNION SELECT c.transition_id/g)).toHaveLength(4);
      }
    }
  });
});
