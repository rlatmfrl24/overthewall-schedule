// @vitest-environment jsdom
import React from "react";
import {render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider,useQuery} from "@tanstack/react-query";
import {beforeEach,expect,it,vi} from "vitest";
import {SessionQueryBoundary} from "./session-query-boundary";

const session=vi.hoisted(()=>({isLoaded:true,sessionId:null as string|null}));
vi.mock("@clerk/clerk-react",()=>({useAuth:()=>session}));
beforeEach(()=>{session.sessionId=null;session.isLoaded=true;});
it("retries native workspace reads after sign-in and removes cached preparation data on sign-out",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
  const read=vi.fn(async()=>{if(!session.sessionId) throw new Error("Preparing content requires own login");return "Private prepared member";});
  function Workspace(){const query=useQuery({queryKey:["members"],queryFn:read});return <p>{query.data??(query.isError?"Login required":"Loading")}</p>;}
  const tree=()=> <QueryClientProvider client={client}><SessionQueryBoundary><Workspace/></SessionQueryBoundary></QueryClientProvider>;
  const view=render(tree());
  await screen.findByText("Login required");
  session.sessionId="own-target-session";view.rerender(tree());
  await screen.findByText("Private prepared member");
  session.sessionId=null;view.rerender(tree());
  expect(screen.queryByText("Private prepared member")).toBeNull();
  await screen.findByText("Login required");
  await waitFor(()=>expect(client.getQueryData(["members"])).toBeUndefined());
});
