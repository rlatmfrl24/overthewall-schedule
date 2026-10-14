/** SQLite normalization of relative ASCII asset paths. It strips query/fragment,
 * decodes once, and resolves dot segments, preserving absolute URL authorities. Values
 * are SQL expressions supplied by owning repositories, never user SQL. */
export function urlPathSql(value: string): string {
  return `(WITH RECURSIVE
    d(r,v) AS (SELECT substr(x,1,min(instr(x||'?','?'),instr(x||'#','#'))-1),'' FROM (SELECT trim(${value}) x WHERE substr(trim(${value}),1,1)='/' AND substr(trim(${value}),1,2)<>'//') UNION ALL SELECT substr(r,iif(r GLOB '%[0-9A-Fa-f][0-9A-Fa-f]*',4,2)),v||iif(r GLOB '%[0-9A-Fa-f][0-9A-Fa-f]*',char((instr('0123456789ABCDEF',upper(substr(r,2,1)))-1)*16+instr('0123456789ABCDEF',upper(substr(r,3,1)))-1),substr(r,1,1)) FROM d WHERE r<>''),
    s(r,a) AS (SELECT substr(replace(substr(v,1,min(instr(v||'?','?'),instr(v||'#','#'))-1),char(92),'/'),2)||'/',json_array() FROM d WHERE r='' UNION ALL SELECT substr(r,instr(r,'/')+1),
      CASE substr(r,1,instr(r,'/')-1) WHEN '.' THEN iif(instr(r,'/')=length(r),json_insert(a,'$[#]',''),a)
        WHEN '..' THEN iif(instr(r,'/')=length(r),json_insert(json_remove(a,'$[#-1]'),'$[#]',''),json_remove(a,'$[#-1]'))
        ELSE json_insert(a,'$[#]',substr(r,1,instr(r,'/')-1)) END FROM s WHERE r<>'')
    SELECT '/'||COALESCE(group_concat(value,'/'),'') FROM s,json_each(a) WHERE r='')`.replace(/\s+/g," ");
}

export const fileOriginSql=(raw:string)=>`(SELECT iif(instr(v,'://')>0,substr(v,1,instr(v,'://')+1+instr(substr(v,instr(v,'://')+3)||'/','/')),iif(substr(v,1,2)='//',substr(v,1,1+instr(substr(v,3)||'/','/')),NULL)) FROM (SELECT trim(${raw}) v))`;
export const filePathSql=(raw:string)=>urlPathSql(`(SELECT iif(origin IS NULL,value,substr(value,length(origin)+1)) FROM (SELECT trim(${raw}) value,${fileOriginSql(raw)} origin))`);
