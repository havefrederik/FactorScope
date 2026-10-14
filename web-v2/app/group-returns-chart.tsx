"use client";
import { useState } from "react";
import type { ReturnGroup } from "@/lib/portfolio-groups";

export const groupColors=["#a9b8c9","#c5ac83","#92aa98","#ad99b8","#bd8c8b","#93b4ae","#b7b493","#a49484","#9b9fc1","#9aafa3","#bb9ba9"];
const pct=(value:number)=>`${value>=0?"+":""}${(value*100).toFixed(2)}%`;
export default function GroupReturnsChart({dates,groups,selectedGroup,onSelectGroup,selectedDate,onSelectDate}:{dates:string[];groups:ReturnGroup[];selectedGroup:string|null;onSelectGroup:(name:string|null)=>void;selectedDate:string;onSelectDate:(date:string)=>void}){
  const [hover,setHover]=useState<number|null>(null);
  const width=900,height=400,left=52,right=96,top=20,bottom=34;
  const values=groups.flatMap(group=>group.curve.filter((value):value is number=>value!==null).map(value=>value-1));
  const low=Math.min(0,...values),high=Math.max(.01,...values),padding=(high-low)*.07,min=low-padding,max=high+padding;
  const x=(i:number)=>left+i/Math.max(1,dates.length-1)*(width-left-right),y=(value:number)=>top+(max-value)/(max-min)*(height-top-bottom);
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  const dateTicks=[...new Set(Array.from({length:6},(_,i)=>Math.round(i*(dates.length-1)/5)))];
  const indexes=[...new Set([...Array.from({length:Math.min(400,dates.length)},(_,i)=>Math.round(i*(dates.length-1)/Math.max(1,Math.min(400,dates.length)-1))),dates.length-1])];
  const selectedIndex=Math.max(0,dates.indexOf(selectedDate));
  const inspectIndex=hover??selectedIndex;
  const labels=groups.map((group,i)=>({group,i,value:group.curve.at(-1),top:group.curve.at(-1)!==null?y(group.curve.at(-1)!-1):0})).filter(label=>label.value!==null).sort((a,b)=>a.top-b.top);
  labels.forEach((label,i)=>{label.top=Math.max(top,label.top,i?labels[i-1].top+16:top);});
  if(labels.length&&labels.at(-1)!.top>height-bottom){labels.at(-1)!.top=height-bottom;for(let i=labels.length-2;i>=0;i--)labels[i].top=Math.min(labels[i].top,labels[i+1].top-16);}
  function indexAt(event:React.PointerEvent<SVGSVGElement>|React.MouseEvent<SVGSVGElement>){const rect=event.currentTarget.getBoundingClientRect();const svgX=(event.clientX-rect.left)/rect.width*width;return Math.max(0,Math.min(dates.length-1,Math.round((svgX-left)/(width-left-right)*(dates.length-1))));}
  return <div className="group-return-workspace">
    <div className="group-return-legend" aria-label="Highlight a sector">{groups.map((group,i)=><button key={group.name} aria-pressed={selectedGroup===group.name} className={selectedGroup===group.name?"active":""} onClick={()=>onSelectGroup(selectedGroup===group.name?null:group.name)}><i style={{background:groupColors[i%groupColors.length]}}/>{group.name}</button>)}{selectedGroup&&<button onClick={()=>onSelectGroup(null)}>Show all</button>}</div>
    <div className="group-return-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Cumulative gross sector returns from dated portfolio holdings. Use the holdings date control for keyboard date selection." onPointerMove={event=>setHover(indexAt(event))} onPointerLeave={()=>setHover(null)} onClick={event=>onSelectDate(dates[indexAt(event)])}>
        {ticks.map(tick=><g key={tick}><line className="group-gridline" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text x={left-8} y={y(tick)+4} textAnchor="end">{(tick*100).toFixed(0)}%</text></g>)}
        <line className="group-zero" x1={left} x2={width-right} y1={y(0)} y2={y(0)}/>
        {dateTicks.map(i=><g key={i}><line className="group-gridline" x1={x(i)} x2={x(i)} y1={top} y2={height-bottom}/><text x={x(i)} y={height-8} textAnchor={i===0?"start":i===dates.length-1?"end":"middle"}>{new Date(`${dates[i]}T00:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"2-digit",timeZone:"UTC"})}</text></g>)}
        {groups.map((group,i)=><polyline key={group.name} points={indexes.filter(j=>group.curve[j]!==null).map(j=>`${x(j)},${y(group.curve[j]!-1)}`).join(" ")} fill="none" stroke={groupColors[i%groupColors.length]} strokeWidth={selectedGroup===group.name?2.6:1.6} opacity={!selectedGroup||selectedGroup===group.name?1:.18} vectorEffect="non-scaling-stroke"><title>{`${group.name}: ${group.curve.at(-1)===null?"Incomplete prices":pct(group.curve.at(-1)!-1)}`}</title></polyline>)}
        {labels.map(({group,i,value,top:labelY})=><g key={group.name} opacity={!selectedGroup||selectedGroup===group.name?1:.25}><line x1={width-right} x2={width-right+9} y1={y(value!-1)} y2={labelY} stroke={groupColors[i%groupColors.length]} vectorEffect="non-scaling-stroke"/><text className="group-end-label" x={width-right+12} y={labelY+4} style={{fill:groupColors[i%groupColors.length]}}>{pct(value!-1)}</text></g>)}
        <line className="group-date-guide" x1={x(inspectIndex)} x2={x(inspectIndex)} y1={top} y2={height-bottom}/>
        {groups.filter(group=>!selectedGroup||group.name===selectedGroup).map(group=>group.curve[inspectIndex]!==null&&<circle key={group.name} cx={x(inspectIndex)} cy={y(group.curve[inspectIndex]!-1)} r="3" fill={groupColors[groups.indexOf(group)%groupColors.length]}/>)}
      </svg>
      {hover!==null&&<div className="group-return-tooltip"><strong>{dates[hover]}</strong>{groups.filter(group=>!selectedGroup||group.name===selectedGroup).map(group=><span key={group.name}><i style={{background:groupColors[groups.indexOf(group)%groupColors.length]}}/>{group.name}<b>{group.curve[hover]===null?"—":pct(group.curve[hover]!-1)}</b></span>)}</div>}
    </div>
    <p className="group-return-caption">Gross sector returns · click the chart to inspect holdings on a date. Each sector starts at $1; transfers between sectors do not count as returns.</p>
    {groups.some(group=>group.incomplete)&&<p className="group-return-caption">Some sector paths stop where allocated securities lack aligned prices.</p>}
  </div>;
}
