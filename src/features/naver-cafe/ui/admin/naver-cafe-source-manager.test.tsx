// @vitest-environment jsdom
import {createElement} from 'react';
import {QueryClient} from '@tanstack/react-query';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createQueryWrapper} from '@/test/query-client';
import type {NaverCafeOperationSourceDto} from '@contracts/operations';
import type {NaverCafeSourceDto} from '@contracts/naver-cafe';
import {fetchNaverCafeSources,updateNaverCafeSource,deleteNaverCafeSource} from '../../api/naver-cafe-api';
import {NaverCafeSourceManager} from './naver-cafe-source-manager';

vi.mock('../../api/naver-cafe-api',()=>({fetchNaverCafeSources:vi.fn(),createNaverCafeSource:vi.fn(),updateNaverCafeSource:vi.fn(),deleteNaverCafeSource:vi.fn()}));
vi.mock('@/features/members',()=>({fetchActiveMembers:vi.fn(async()=>[])}));
vi.mock('@/shared/ui/toast',()=>({useToast:()=>({toast:vi.fn()})}));
const source=(id:number):NaverCafeSourceDto=>({id,name:`게시판 ${id}`,cafe_id:'12345',menu_id:String(id),cafe_url:`https://cafe.naver.com/f-e/cafes/12345/menus/${id}`,member_uid:null,enabled:true,sort_order:id,created_at:1,updated_at:1});
const check=(sourceId:number):NaverCafeOperationSourceDto=>({sourceId,sourceName:`게시판 ${sourceId}`,cafeId:'12345',menuId:String(sourceId),enabled:true,
  latestCheck:{id:sourceId,trigger:'scheduled',status:'ok',checkedAt:1,durationMs:1,postCount:sourceId*7,error:null},lastSuccessAt:1,latestError:null,disabledReason:null,stale:false,failing:false});
const show=(sources:NaverCafeOperationSourceDto[],error=false)=>render(createElement(NaverCafeSourceManager,{checks:{sources,loading:false,error,updatedAt:1}}),{wrapper:createQueryWrapper()});
beforeEach(()=>{vi.mocked(fetchNaverCafeSources).mockResolvedValue([source(1),source(2)]);vi.mocked(updateNaverCafeSource).mockResolvedValue(undefined);vi.mocked(deleteNaverCafeSource).mockResolvedValue(undefined);Element.prototype.scrollIntoView=vi.fn();vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('joins checks by board ID in the editable table without a search',async()=>{
  show([check(2),check(1)]);
  const row=(await screen.findByRole('button',{name:'게시판 1 수정'})).closest('tr')!;
  expect(within(row).getByText('7건')).toBeTruthy();
  expect(within(row).getByText('정상')).toBeTruthy();
  expect(within(row).getByRole('button',{name:'게시판 1 수정'})).toBeTruthy();
  expect(within(row).getByRole('button',{name:'게시판 1 삭제 메뉴'})).toBeTruthy();
  expect(screen.getAllByRole('table')).toHaveLength(1);
  expect(screen.queryByRole('textbox',{name:'카페 게시판 검색'})).toBeNull();
});
it('keeps stale and failed checks visible and missing checks unknown',async()=>{
  vi.mocked(fetchNaverCafeSources).mockResolvedValue([source(1),source(2),source(3)]);
  show([{...check(1),stale:true},{...check(2),latestCheck:{...check(2).latestCheck!,status:'error',error:'점검 실패'},latestError:'점검 실패',failing:true}]);
  const first=(await screen.findByRole('button',{name:'게시판 1 수정'})).closest('tr')!;
  expect(within(first).getByText('확인 지연')).toBeTruthy();
  expect(within(first).queryByText('정상')).toBeNull();
  const failed=within(screen.getByRole('button',{name:'게시판 2 수정'}).closest('tr')!);
  expect(failed.getByText('오류')).toBeTruthy();
  expect(failed.getByText('점검 실패')).toBeTruthy();
  expect(within(screen.getByRole('button',{name:'게시판 3 수정'}).closest('tr')!).getByText('미확인')).toBeTruthy();
});
it('shows retained checks as previous information after a check read failure',async()=>{
  show([check(1)],true);
  (await screen.findByRole('button',{name:'게시판 1 수정'})).closest('tr')!;
  expect(screen.getByText(/점검 상태 최신 조회 실패/)).toBeTruthy();
  expect(screen.getByText('이전 정상')).toBeTruthy();
});
it('opens editing from the combined row and preserves delete confirmation',async()=>{
  const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
  show([check(1)]);
  fireEvent.click(await screen.findByRole('button',{name:'게시판 1 수정'}));
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(screen.getByDisplayValue('게시판 1')).toBeTruthy();
  expect(updateNaverCafeSource).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'취소'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.keyDown(screen.getByRole('button',{name:'게시판 1 삭제 메뉴'}),{key:'Enter'});
  fireEvent.click(await screen.findByRole('menuitem',{name:'게시판 1 삭제'}));
  expect(await screen.findByRole('alertdialog')).toBeTruthy();
  expect(deleteNaverCafeSource).not.toHaveBeenCalled();
  vi.mocked(deleteNaverCafeSource).mockImplementationOnce(async()=>{vi.mocked(fetchNaverCafeSources).mockResolvedValue([source(2)]);});
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'삭제'}));
  await waitFor(()=>expect(deleteNaverCafeSource).toHaveBeenCalled());
  expect(vi.mocked(deleteNaverCafeSource).mock.calls[0][0]).toBe(1);
  await waitFor(()=>expect(screen.queryByRole('button',{name:'게시판 1 수정'})).toBeNull());
  expect(invalidate).toHaveBeenCalledWith({queryKey:['operations','status']});
  expect(invalidate).not.toHaveBeenCalledWith({queryKey:['operations']});
});
