import type { HistoricalContentMaterial, HistoricalJsonValue } from "../../../../../contracts/content-history";
import React from "react";

const kinds: Record<HistoricalContentMaterial["kind"],string> = {origin:"이전 수집 출처",event:"이전 변경 기록",review:"이전 AI 검토",attempt:"이전 분석 시도",batch:"이전 일괄 검토",job:"이전 수집 기록",work:"이전 검토 작업",approval:"이전 채널 승인"};
const labels: Record<string,string> = {status:"당시 상태",outcome:"결과",created_at:"생성 시각",updated_at:"변경 시각",started_at:"시작 시각",finished_at:"종료 시각",discovered_at:"발견 시각",source_url:"출처 URL",source_title:"출처 제목",playlist_position:"목록 순서",event_type:"변경 종류",input_json:"원래 분석 입력",result_json:"원래 분석 결과",detail_json:"변경 내용",before_json:"변경 전",after_json:"변경 후",selection_json:"원래 검토 대상",review_input_json:"원래 검토 입력",title:"제목",name:"이름",participants:"참여자",originalArtists:"원곡 크레딧",song:"곡",songs:"곡별 결과",values:"검토 내용",warnings:"주의 사항",evidence:"근거",text:"내용",description:"설명",model:"분석 모델",prompt_version:"분석 기준",error_message:"당시 오류",reason:"사유",reason_note:"사유 설명"};
function MaterialValue({value}:{value:HistoricalJsonValue}): React.ReactNode {
  if(value===null)return <span className="text-muted-foreground">기록 없음</span>;
  if(Array.isArray(value))return <ul className="space-y-2 pl-3">{value.map((item,index)=><li key={index}><MaterialValue value={item}/></li>)}</ul>;
  if(typeof value==="object")return <dl className="space-y-2">{Object.entries(value).map(([key,item])=><div key={key} className="border-l pl-3"><dt className="text-xs font-medium text-muted-foreground">{labels[key] ?? key}</dt><dd className="break-words"><MaterialValue value={item}/></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}
export function HistoricalMaterials({materials}:{materials:readonly HistoricalContentMaterial[]}) {
  if(!materials.length)return null;
  return <section aria-label="이전 사이트 검토 자료" className="space-y-3 rounded-lg border p-3 text-sm">
    <h3 className="font-semibold">이전 사이트 검토 자료</h3>
    <p className="text-muted-foreground">원래 검토와 수집 기록입니다. 현재 검토 내용과 비교할 수 있습니다.</p>
    {materials.map(material=><details key={`${material.sourceSite}:${material.sourceRecordId}`} className="space-y-2">
      <summary className="cursor-pointer font-medium">{material.sourceSite} · {kinds[material.kind]}</summary>
      <MaterialValue value={material.values}/>
    </details>)}
  </section>;
}
