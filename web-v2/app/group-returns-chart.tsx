"use client";
import { useMemo, useState } from "react";
import type { ReturnGroup } from "@/lib/portfolio-groups";

// Stable identities across chart, legend and holdings; direct labels supplement color.
const sectorStyles:Record<string,{color:string;label:string}>={
  "Communication Services":{color:"#56b4ff",label:"Comm. services"},
  "Consumer Discretionary":{color:"#ffab40",label:"Cons. discretionary"},
  "Consumer Staples":{color:"#74df70",label:"Cons. staples"},
  "Energy":{color:"#c58aff",label:"Energy"},
  "Financials":{color:"#ff667d",label:"Financials"},
  "Healthcare":{color:"#34e0cd",label:"Healthcare"},
  "Industrials":{color:"#f5df4d",label:"Industrials"},
  "Technology":{color:"#f4f5f7",label:"Technology"},
  "Utilities":{color:"#ff8bd4",label:"Utilities"},
  "Materials":{color:"#a6bdff",label:"Materials"},
  "Real Estate":{color:"#d5b08a",label:"Real estate"},
};
export function groupStyle(name:string){const palette=["#56b4ff","#ffab40","#74df70","#c58aff","#ff667d","#34e0cd","#f5df4d","#f4f5f7","#ff8bd4","#a6bdff"];const hash=[...name].reduce((n,c)=>n*31+c.charCodeAt(0),0)>>>0;return sectorStyles[name]??{color:name==="Long"?"#34e0cd":name==="Short"?"#ff667d":palette[hash%palette.length],label:name};}
export type GroupMeasure = "contribution" | "within";

function idleIntervals(group: ReturnGroup | undefined) {
  const intervals: {start:number; end:number}[] = [];
  if (!group) return intervals;
  for (let i=1; i<group.held.length; i++) {
    if (group.held[i] || group.curve[i]===null) continue;
    const last=intervals.at(-1);
    if (last?.end===i-1) last.end=i;
    else intervals.push({start:i-1,end:i});
  }
  return intervals;
}

export default function GroupReturnsChart({dates,groups,measure,selectedGroup,onSelectGroup,selectedDate,onSelectDate}:{dates:string[];groups:ReturnGroup[];measure:GroupMeasure;selectedGroup:string|null;onSelectGroup:(name:string|null)=>void;selectedDate:string;onSelectDate:(date:string)=>void}){
  const [hover,setHover]=useState<number|null>(null);
  const width=900,height=400,left=62,right=140,top=20,bottom=34;
  const unit=measure==="contribution"?" pp":"%";
  const format=(value:number)=>`${value>=0?"+":""}${(value*100).toFixed(2)}${unit}`;
  const series=useMemo(()=>groups.map(group=>({
    ...group, points:measure==="contribution"?group.contribution:group.curve.map(v=>v===null?null:v-1)
  })),[groups,measure]);
  const {min,max}=useMemo(()=>{
    let low=0,high=.01;
    for(const group of series) for(const value of group.points) if(value!==null){low=Math.min(low,value);high=Math.max(high,value);}
    const padding=(high-low)*.07;
    return {min:low-padding,max:high+padding};
  },[series]);
  const idle=useMemo(()=>idleIntervals(groups.find(group=>group.name===selectedGroup)),[groups,selectedGroup]);
  const x=(i:number)=>left+i/Math.max(1,dates.length-1)*(width-left-right),y=(value:number)=>top+(max-value)/(max-min)*(height-top-bottom);
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  const dateTicks=[...new Set(Array.from({length:6},(_,i)=>Math.round(i*(dates.length-1)/5)))];
  const indexes=[...new Set([...Array.from({length:Math.min(400,dates.length)},(_,i)=>Math.round(i*(dates.length-1)/Math.max(1,Math.min(400,dates.length)-1))),dates.length-1])];
  const selectedIndex=Math.max(0,dates.indexOf(selectedDate));
  const inspectIndex=Math.min(hover??selectedIndex,dates.length-1);
  const labelGroups=selectedGroup?series.filter(g=>g.name===selectedGroup):series.length>10?[...series].sort((a,b)=>(b.points.at(-1)??-Infinity)-(a.points.at(-1)??-Infinity)).slice(0,8):series;
  const labels=labelGroups.flatMap(group=>{
    const value=group.points.at(-1);
    return value==null?[]:[{group,value,top:y(value)}];
  }).sort((a,b)=>a.top-b.top);
  labels.forEach((label,i)=>{label.top=Math.max(top,label.top,i?labels[i-1].top+27:top);});
  if(labels.length&&labels.at(-1)!.top>height-bottom){labels.at(-1)!.top=height-bottom;for(let i=labels.length-2;i>=0;i--)labels[i].top=Math.min(labels[i].top,labels[i+1].top-27);}
  function indexAt(event:React.PointerEvent<SVGSVGElement>|React.MouseEvent<SVGSVGElement>){const rect=event.currentTarget.getBoundingClientRect();const svgX=(event.clientX-rect.left)/rect.width*width;return Math.max(0,Math.min(dates.length-1,Math.round((svgX-left)/(width-left-right)*(dates.length-1))));}
  return <div className="group-return-workspace">
    <div className="group-return-legend" aria-label="Highlight a return group">{groups.map(group=><button key={group.name} aria-pressed={selectedGroup===group.name} className={selectedGroup===group.name?"active":""} onClick={()=>onSelectGroup(selectedGroup===group.name?null:group.name)}><svg width="25" height="10" viewBox="0 0 25 10" aria-hidden="true"><line x1="0" x2="25" y1="5" y2="5" stroke={groupStyle(group.name).color} strokeWidth="1.5"/></svg>{group.name}</button>)}{selectedGroup&&<button onClick={()=>onSelectGroup(null)}>Show all</button>}</div>
    <div className="group-return-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={measure==="contribution"?"Cumulative contributions to portfolio return in percentage points":"Cumulative returns within groups in percent"} onPointerMove={event=>setHover(indexAt(event))} onPointerLeave={()=>setHover(null)} onClick={event=>onSelectDate(dates[indexAt(event)])}>
        {ticks.map(tick=><g key={tick}><line className="group-gridline" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text x={left-8} y={y(tick)+4} textAnchor="end">{Number((tick*100).toFixed(max-min<.05?2:0))}{unit}</text></g>)}
        <line className="group-zero" x1={left} x2={width-right} y1={y(0)} y2={y(0)}/>
        {dateTicks.map(i=><g key={i}><line className="group-gridline" x1={x(i)} x2={x(i)} y1={top} y2={height-bottom}/><text x={x(i)} y={height-8} textAnchor={i===0?"start":i===dates.length-1?"end":"middle"}>{new Date(`${dates[i]}T00:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"2-digit",timeZone:"UTC"})}</text></g>)}
        {idle.map(({start,end})=><g key={start} className="group-idle-band"><title>{`${selectedGroup} · No holdings during sessions ${dates[start+1]} through ${dates[end]}`}</title><rect x={x(start)} y={top} width={x(end)-x(start)} height={height-bottom-top}/>{x(end)-x(start)>85&&<text x={(x(start)+x(end))/2} y={top+15} textAnchor="middle">No holdings</text>}</g>)}
        {series.map(group=><polyline key={group.name} points={indexes.filter(j=>group.points[j]!=null).map(j=>`${x(j)},${y(group.points[j]!)}`).join(" ")} fill="none" stroke={groupStyle(group.name).color} strokeWidth={selectedGroup===group.name?1.75:1.25} opacity={!selectedGroup||selectedGroup===group.name?1:.18} vectorEffect="non-scaling-stroke"><title>{`${group.name} · ${group.points.at(-1)==null?"Incomplete prices":format(group.points.at(-1)!)}`}</title></polyline>)}
        {labels.map(({group,value,top:labelY})=><g key={group.name}><line x1={width-right} x2={width-right+9} y1={y(value)} y2={labelY} stroke={groupStyle(group.name).color} vectorEffect="non-scaling-stroke"/><text className="group-end-label" x={width-right+12} y={labelY-3} style={{fill:groupStyle(group.name).color}}><tspan className="group-end-name" x={width-right+12}>{groupStyle(group.name).label}</tspan><tspan x={width-right+12} dy="13">{format(value)}</tspan></text></g>)}
        <line className="group-date-guide" x1={x(inspectIndex)} x2={x(inspectIndex)} y1={top} y2={height-bottom}/>
        {series.filter(group=>!selectedGroup||group.name===selectedGroup).map(group=>group.points[inspectIndex]!=null&&<circle key={group.name} cx={x(inspectIndex)} cy={y(group.points[inspectIndex]!)} r="3" fill={groupStyle(group.name).color}/>)}
      </svg>
      {hover!==null&&<div className="group-return-tooltip"><strong>{dates[inspectIndex]}</strong>{series.filter(group=>!selectedGroup||group.name===selectedGroup).map(group=><span key={group.name}><i style={{background:groupStyle(group.name).color}}/>{group.name}<b>{group.points[inspectIndex]==null?"Unavailable":<>{format(group.points[inspectIndex]!)}{!group.held[inspectIndex]&&<small>No holdings</small>}</>}</b></span>)}</div>}
    </div>
    <p className="group-return-caption">{measure==="contribution"?"Cumulative contribution before trading costs, in percentage points.":"Cumulative return on $1 in each group, before trading costs."} Select a group to see periods without holdings. Click a date to inspect positions.</p>
    {groups.some(group=>group.incomplete)&&<p className="group-return-caption">Some group paths stop where allocated securities lack aligned prices.</p>}
  </div>;
}
