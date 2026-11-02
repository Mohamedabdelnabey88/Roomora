export type RequestFilters = {
  scope: "active" | "completed" | "all";
  status: string;
  query: string;
  quickFilter: "active" | "approvals" | "late" | "completed" | null;
  dateMode: "all" | "today" | "yesterday" | "month" | "custom";
  dateFrom: string;
  dateTo: string;
};

export function riyadhDateKey(now: Date) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const read=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function requestFilterQuery(filters: RequestFilters, today: string) {
  const parameters=new URLSearchParams({paged:"1",page_size:"25",scope:filters.scope});
  if(filters.status!=="all")parameters.set("status",filters.status);
  if(filters.query.trim())parameters.set("q",filters.query.trim());
  if(filters.quickFilter==="late")parameters.set("late","1");
  let from="",to="";
  if(filters.dateMode==="today")from=to=today;
  if(filters.dateMode==="yesterday"){
    const date=new Date(today+"T12:00:00Z");date.setUTCDate(date.getUTCDate()-1);from=to=date.toISOString().slice(0,10);
  }
  if(filters.dateMode==="month"){
    from=today.slice(0,7)+"-01";
    const date=new Date(from+"T12:00:00Z");date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);to=date.toISOString().slice(0,10);
  }
  if(filters.dateMode==="custom"){
    from=filters.dateFrom;to=filters.dateTo;
    if(!from&&!to)return {query:"",error:"حدد بداية الفترة أو نهايتها"};
    if(from&&to&&from>to)return {query:"",error:"تاريخ البداية يجب أن يسبق تاريخ النهاية"};
  }
  if(from)parameters.set("from",from);
  if(to)parameters.set("to",to);
  return {query:parameters.toString(),error:""};
}
