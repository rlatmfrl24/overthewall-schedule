// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import React from "react";
import { HistoricalMaterials } from "./historical-materials";

describe("historical review materials",()=>{
  it("shows original source, outcome, time and nested credits without providing execution controls",()=>{
    render(React.createElement(HistoricalMaterials,{materials:[{sourceSite:"otw",sourceRecordId:"opaque",sourceTable:"music_ai_reviews",kind:"review",values:{status:"succeeded",created_at:1,result_json:{songs:[{values:{song:{title:"Original song"},participants:[{name:"External artist"}]}}]}}}]}));
    expect(screen.getByText("otw · 이전 AI 검토")).toBeTruthy();
    expect(screen.getByText("succeeded")).toBeTruthy();
    expect(screen.getByText("Original song")).toBeTruthy();
    expect(screen.getByText("External artist")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
