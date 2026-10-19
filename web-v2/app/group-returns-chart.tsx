"use client";
import { useState } from "react";
import type { ReturnGroup } from "@/lib/portfolio-groups";

// Stable identities across chart, legend and holdings; patterns supplement color.
const sectorStyles:Record<string,{color:string;dash:string;label:string}>={
  "Communication Services":{color:"#56b4ff",dash:"",label:"Comm. services"},
  "Consumer Discretionary":{color:"#ffab40",dash:"8 3",label:"Cons. discretionary"},
  "Consumer Staples":{color:"#74df70",dash:"3 3",label:"Cons. staples"},
  "Energy":{color:"#c58aff",dash:"8 3 2 3",label:"Energy"},
  "Financials":{color:"#ff667d",dash:"",label:"Financials"},
  "Healthcare":{color:"#34e0cd",dash:"8 3",label:"Healthcare"},
  "Industrials":{color:"#f5df4d",dash:"",label:"Industrials"},
  "Technology":{color:"#f4f5f7",dash:"",label:"Technology"},
  "Utilities":{color:"#ff8bd4",dash:"3 3",label:"Utilities"},
  "Materials":{color:"#a6bdff",dash:"8 3 2 3",label:"Materials"},
  "Real Estate":{color:"#d5b08a",dash:"10 4",label:"Real estate"},
};
export function groupStyle(name:string){return sectorStyles[name]??{color:"#c3ccd5",dash:"4 3",label:name};}
const pct=(value:number)=>`${value>=0?"+":""}${(value*100).toFixed(2)}%`;
export default function GroupReturnsChart({dates,groups,selectedGroup,onSelectGroup,selectedDate,onSelectDate}:{dates:string[];groups:ReturnGroup[];selectedGroup:string|null;onSelectGroup:(name:string|null)=>void;selectedDate:string;onSelectDate:(date:string)=>void}){
  const [hover,setHover]=useState<number|null>(null);
  const width=900,height=400,left=52,right=140,top=20,bottom=34;
  const values=groups.flatMap(group=>group.curve.filter((value):value is number=>value!==null).map(value=>value-1));
  const low=Math.min(0,...values),high=Math.max(.01,...values),padding=(high-low)*.07,min=low-padding,max=high+padding;
  const x=(i:number)=>left+i/Math.max(1,dates.length-1)*(width-left-right),y=(value:number)=>top+(max-value)/(max-min)*(height-top-bottom);
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  const dateTicks=[...new Set(Array.from({length:6},(_,i)=>Math.round(i*(dates.length-1)/5)))];
  const indexes=[...new Set([...Array.from({length:Math.min(400,dates.length)},(_,i)=>Math.round(i*(dates.length-1)/Math.max(1,Math.min(400,dates.length)-1))),dates.length-1])];
  const selectedIndex=Math.max(0,dates.indexOf(selectedDate));
  const inspectIndex=hover??selectedIndex;
  const labels=groups.map((group,i)=>({group,i,value:group.curve.at(-1),top:group.curve.at(-1)!==null?y(group.curve.at(-1)!-1):0})).filter(label=>label.value!==null).sort((a,b)=>a.top-b.top);
  labels.forEach((label,i)=>{label.top=Math.max(top,label.top,i?labels[i-1].top+27:top);});
  if(labels.length&&labels.at(-1)!.top>height-bottom){labels.at(-1)!.top=height-bottom;for(let i=labels.length-2;i>=0;i--)labels[i].top=Math.min(labels[i].top,labels[i+1].top-27);}
  function indexAt(event:React.PointerEvent<SVGSVGElement>|React.MouseEvent<SVGSVGElement>){const rect=event.currentTarget.getBoundingClientRect();const svgX=(event.clientX-rect.left)/rect.width*width;return Math.max(0,Math.min(dates.length-1,Math.round((svgX-left)/(width-left-right)*(dates.length-1))));}
  return <div className="group-return-workspace">
    <div className="group-return-legend" aria-label="Highlight a sector">{groups.map((group,i)=><button key={group.name} aria-pressed={selectedGroup===group.name} className={selectedGroup===group.name?"active":""} onClick={()=>onSelectGroup(selectedGroup===group.name?null:group.name)}><svg width="25" height="10" viewBox="0 0 25 10" aria-hidden="true"><line x1="0" x2="25" y1="5" y2="5" stroke={groupStyle(group.name).color} strokeWidth="2.5" strokeDasharray={groupStyle(group.name).dash}/></svg>{group.name}</button>)}{selectedGroup&&<button onClick={()=>onSelectGroup(null)}>Show all</button>}</div>
    <div className="group-return-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Cumulative gross sector returns from dated portfolio holdings. Use the holdings date control for keyboard date selection." onPointerMove={event=>setHover(indexAt(event))} onPointerLeave={()=>setHover(null)} onClick={event=>onSelectDate(dates[indexAt(event)])}>
        {ticks.map(tick=><g key={tick}><line className="group-gridline" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text x={left-8} y={y(tick)+4} textAnchor="end">{(tick*100).toFixed(0)}%</text></g>)}
        <line className="group-zero" x1={left} x2={width-right} y1={y(0)} y2={y(0)}/>
        {dateTicks.map(i=><g key={i}><line className="group-gridline" x1={x(i)} x2={x(i)} y1={top} y2={height-bottom}/><text x={x(i)} y={height-8} textAnchor={i===0?"start":i===dates.length-1?"end":"middle"}>{new Date(`${dates[i]}T00:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"2-digit",timeZone:"UTC"})}</text></g>)}
        {groups.map((group,i)=><polyline key={group.name} points={indexes.filter(j=>group.curve[j]!==null).map(j=>`${x(j)},${y(group.curve[j]!-1)}`).join(" ")} fill="none" stroke={groupStyle(group.name).color} strokeWidth={selectedGroup===group.name?3:2} strokeDasharray={groupStyle(group.name).dash} opacity={!selectedGroup||selectedGroup===group.name?1:.18} vectorEffect="non-scaling-stroke"><title>{`${group.name}: ${group.curve.at(-1)===null?"Incomplete prices":pct(group.curve.at(-1)!-1)}`}</title></polyline>)}
        {labels.map(({group,i,value,top:labelY})=><g key={group.name} opacity={!selectedGroup||selectedGroup===group.name?1:.25}><line x1={width-right} x2={width-right+9} y1={y(value!-1)} y2={labelY} stroke={groupStyle(group.name).color} vectorEffect="non-scaling-stroke"/><text className="group-end-label" x={width-right+12} y={labelY-3} style={{fill:groupStyle(group.name).color}}><tspan className="group-end-name" x={width-right+12}>{groupStyle(group.name).label}</tspan><tspan x={width-right+12} dy="13">{pct(value!-1)}</tspan></text></g>)}
        <line className="group-date-guide" x1={x(inspectIndex)} x2={x(inspectIndex)} y1={top} y2={height-bottom}/>
        {groups.filter(group=>!selectedGroup||group.name===selectedGroup).map(group=>group.curve[inspectIndex]!==null&&<circle key={group.name} cx={x(inspectIndex)} cy={y(group.curve[inspectIndex]!-1)} r="3" fill={groupStyle(group.name).color}/>)}
      </svg>
      {hover!==null&&<div className="group-return-tooltip"><strong>{dates[hover]}</strong>{groups.filter(group=>!selectedGroup||group.name===selectedGroup).map(group=><span key={group.name}><i style={{background:groupStyle(group.name).color}}/>{group.name}<b>{group.curve[hover]===null?"—":pct(group.curve[hover]!-1)}</b></span>)}</div>}
    </div>
    <p className="group-return-caption">Gross sector returns · select a sector in the legend to isolate it; click the chart to inspect holdings on a date. Each sector starts at $1; transfers between sectors do not count as returns.</p>
    {groups.some(group=>group.incomplete)&&<p className="group-return-caption">Some sector paths stop where allocated securities lack aligned prices.</p>}
  </div>;
}
