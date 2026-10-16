const urlCharactersSql=(value:string)=>`replace(replace(replace(replace(${value},char(9),''),char(10),''),char(13),''),char(92),'/')`;

/** Matches URL parsing before the owning single decode, then parses the decoded
 * path again. In particular, a decoded authority must be rejected before dots
 * can erase it. Values are owning SQL expressions, never user SQL. */
export function urlPathSql(value: string): string {
  const segment="substr(r,1,instr(r,'/')-1)";
  const segments=(name:string,input:string,dot:string)=>`${name}(r,a) AS (${input} UNION ALL SELECT substr(r,instr(r,'/')+1),
    CASE ${dot} WHEN '.' THEN iif(instr(r,'/')=length(r),json_insert(a,'$[#]',''),a)
      WHEN '..' THEN iif(instr(r,'/')=length(r),json_insert(json_remove(a,'$[#-1]'),'$[#]',''),json_remove(a,'$[#-1]'))
      ELSE json_insert(a,'$[#]',${segment}) END FROM ${name} WHERE r<>'')`;
  const strip="substr(x,1,min(instr(x||'?','?'),instr(x||'#','#'))-1)";
  // decodeURIComponent rejects malformed escapes and UTF-8 before a later URL
  // parse may remove their segment. Keep that validity through the decode.
  // n=1..3 counts continuations; 4..7 constrain E0/ED/F0/F4's next byte.
  const utf8=`iif(substr(r,1,1)<>'%',iif(n=0,0,-1),iif(r GLOB '%[0-9A-Fa-f][0-9A-Fa-f]*',
    coalesce((SELECT next FROM u WHERE state=d.n AND upper(substr(d.r,2,2)) BETWEEN low AND high),-1),-1))`;
  return `(WITH RECURSIVE u(state,low,high,next) AS (VALUES (0,'00','7F',0),(0,'C2','DF',1),(0,'E0','E0',4),(0,'E1','EC',2),(0,'ED','ED',5),(0,'EE','EF',2),(0,'F0','F0',6),(0,'F1','F3',3),(0,'F4','F4',7),(1,'80','BF',0),(2,'80','BF',1),(3,'80','BF',2),(4,'A0','BF',1),(5,'80','9F',1),(6,'90','BF',2),(7,'80','8F',2)),
    p(x) AS MATERIALIZED (SELECT ${urlCharactersSql(`trim(${value})`)}),
    ${segments("n",`SELECT substr(${strip},2)||'/',json_array() FROM p WHERE substr(x,1,1)='/'`,`replace(lower(${segment}),'%2e','.')`)},
    j(v) AS (SELECT '/'||COALESCE(group_concat(value,'/'),'') FROM n,json_each(a) WHERE r=''),
    d(r,v,n) AS (SELECT v,'',0 FROM j UNION ALL SELECT substr(r,iif(r GLOB '%[0-9A-Fa-f][0-9A-Fa-f]*',4,2)),v||iif(r GLOB '%[0-9A-Fa-f][0-9A-Fa-f]*',char((instr('0123456789ABCDEF',upper(substr(r,2,1)))-1)*16+instr('0123456789ABCDEF',upper(substr(r,3,1)))-1),substr(r,1,1)), ${utf8} FROM d WHERE r<>'' AND n>=0),
    e(x) AS MATERIALIZED (SELECT ${urlCharactersSql("v")} FROM d WHERE r='' AND n=0),
    ${segments("s",`SELECT substr(${strip},2)||'/',json_array() FROM e WHERE substr(x,1,1)='/' AND substr(x,1,2)<>'//'`,segment)}
    SELECT '/'||COALESCE(group_concat(value,'/'),'') FROM s,json_each(a) WHERE r='')`.replace(/\s+/g," ");
}

export const fileOriginSql=(raw:string)=>`(SELECT iif(instr(v,'://')>0,substr(v,1,instr(v,'://')+1+instr(substr(v,instr(v,'://')+3)||'/','/')),iif(substr(v,1,2)='//',substr(v,1,1+instr(substr(v,3)||'/','/')),NULL)) FROM (SELECT trim(${raw}) v))`;
// WHATWG treats a raw /\\ prefix as a new authority. Reject it before dot
// segments can erase the foreign host. An explicit absolute origin is retained
// separately and does not acquire authority from its already-owned pathname.
export const filePathSql=(raw:string)=>urlPathSql(`(SELECT iif(origin IS NULL,iif(substr(${urlCharactersSql("value")},1,2)='//','/',value),substr(value,length(origin)+1)) FROM (SELECT trim(${raw}) value,${fileOriginSql(raw)} origin))`);
