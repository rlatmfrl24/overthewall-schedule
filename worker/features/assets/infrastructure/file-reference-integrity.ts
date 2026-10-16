export const currentFileIndexSql=(alias:string)=>`EXISTS(SELECT 1 FROM asset_file_reference_inputs raw WHERE raw.row_table=${alias}.row_table AND raw.row_id=json_extract(${alias}.row_key,'$[0]') AND raw.row_key=${alias}.row_key AND raw.field=${alias}.field AND raw.raw_url=${alias}.raw_url)`;
export const currentRowFileIndexSql=(indexed:string,table:string,row:string)=>table==="notices"
  ? `(${indexed}.field='thumbnail_url' AND ${indexed}.raw_url=${row}.thumbnail_url OR ${indexed}.field LIKE 'image_urls.%' AND ${indexed}.raw_url=json_extract(${row}.image_urls,'$['||substr(${indexed}.field,12)||']'))`
  : `${indexed}.field='${table==="member_profile_images"?"image_url":"thumbnail_url"}' AND ${indexed}.raw_url=${row}.${table==="member_profile_images"?"image_url":"thumbnail_url"}`;

/** The manifest may classify references only for its selected owning row. */
export function selectedFileRowSql(table:string,row:string,plan="t.plan_json",site="t.local_site") {
  const selected=(uid:string)=>`EXISTS(SELECT 1 FROM json_each(${plan},'$.members') member WHERE iif(${site}=json_extract(${plan},'$.sourceSite'),json_extract(member.value,'$.uid'),json_extract(member.value,'$.targetUid'))=${uid})`;
  const decision=(disposition:string)=>`EXISTS(SELECT 1 FROM json_each(${plan},'$.classifications') decision WHERE json_extract(decision.value,'$.table')='${table}' AND json_extract(decision.value,'$.key')=json_array(${row}.id) AND json_extract(decision.value,'$.disposition')='${disposition}')`;
  const owner=table==="notices"?`(${selected(`${row}.publisher_member_uid`)} OR EXISTS(SELECT 1 FROM json_each(${row}.related_member_uids) related WHERE ${selected("related.value")}))`:selected(`${row}.member_uid`);
  return `((${decision("include")} OR ${owner}) AND NOT ${decision("exclude")})`;
}
