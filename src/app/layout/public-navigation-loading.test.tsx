// @vitest-environment jsdom
import {renderHook} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {usePublicNavigationSections} from "./app-navigation";

const mocks=vi.hoisted(()=>({user:vi.fn(),config:vi.fn()}));
vi.mock("@clerk/clerk-react",()=>({useUser:mocks.user}));
vi.mock("@/features/auth",()=>({useAdminStatus:()=>({data:undefined,isPending:true})}));
vi.mock("@/features/x-posts",()=>({useXPostsConfig:()=>({visibility:"public"})}));
vi.mock("@/features/naver-cafe",()=>({useNaverCafePostsConfig:()=>({enabled:false,visibility:"private"})}));
vi.mock("@/features/otw-play",()=>({useOtwPlayConfig:mocks.config}));

it("keeps the public Play entry stable while auth loads and changes without a catalog request",()=>{
  mocks.user.mockReturnValue({isLoaded:false,isSignedIn:false,user:null});
  mocks.config.mockReturnValue({isPending:true,data:undefined});
  const view=renderHook(usePublicNavigationSections);
  const item=()=>view.result.current.flatMap(section=>section.items).find(entry=>entry.id==="otw-play");
  expect(item()).toMatchObject({to:"/play"});
  for(const user of [
    {isLoaded:true,isSignedIn:false,user:null},
    {isLoaded:true,isSignedIn:true,user:{id:"member"}},
    {isLoaded:true,isSignedIn:false,user:null},
  ]){
    mocks.user.mockReturnValue(user);view.rerender();
    expect(item()).toMatchObject({to:"/play"});
    expect(item()?.requiresAuth).toBeUndefined();
  }
  expect(mocks.config).not.toHaveBeenCalled();
  view.unmount();
});
