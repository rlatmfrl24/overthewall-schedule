// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChzzkHistoryDto } from "@contracts/chzzk";
import { ChzzkHistory } from "./chzzk-history";
import { fetchChzzkHistory } from "../api/history";
vi.mock("../api/history", () => ({ fetchChzzkHistory: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("selects an archived channel and inspects expired held snapshot metadata", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const channels: ChzzkHistoryDto["channels"] = [{channelId:"archived",name:"보관 멤버",contentAccess:"admin_archive"}];
  vi.mocked(fetchChzzkHistory).mockResolvedValueOnce({channels,snapshots:[],nextCursor:null}).mockResolvedValue({channels,nextCursor:null,snapshots:[{key:"held",type:"clips",storedAt:"2026-10-01",contentAccess:"admin_archive",content:{size:10,page:{next:null,prev:null},data:[{clipUID:"held",videoNo:null,clipTitle:"보관 클립",ownerChannelId:"archived",thumbnailImageUrl:null,categoryType:"",clipCategory:"",duration:10,adult:false,createdDate:"2026-10-01",readCount:1,blindType:null,hasStreamerClips:true}]}}]});
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><ChzzkHistory /></QueryClientProvider>);
  // Wait for the actual query before opening the owning selector.
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  fireEvent.keyDown(screen.getByRole("combobox"), {key:"Enter"});
  fireEvent.click(await screen.findByRole("option", {name:"보관 멤버 · 관리자 보관"}));
  expect(await screen.findByText("보관 클립")).toBeTruthy();
  expect(screen.getByText("관리자 보관 · 읽기 전용")).toBeTruthy();
  expect(fetchChzzkHistory).toHaveBeenLastCalledWith("archived",null);
  client.clear();
});
