import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile,writeFile,rm } from "node:fs/promises";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("shared holdings view presents uploaded snapshots without inventing history or allocation weights",async()=>{
  const directory=await mkdtemp(new URL("../.holdings-render-",import.meta.url));
  try{
    const source=await readFile(new URL("../app/portfolio-holdings.tsx",import.meta.url),"utf8");
    await writeFile(`${directory}/holdings.mjs`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText);
    const {default:Holdings}=await import(`${directory}/holdings.mjs`);
    const base={positions:[{ticker:"A",value:100},{ticker:"B",value:-25},{ticker:"CASH",value:25}],total:100,onSelectTicker:()=>{}};
    const snapshot=renderToStaticMarkup(React.createElement(Holdings,base));
    assert.match(snapshot,/Portfolio positions/);assert.match(snapshot,/-25\.00%/);
    assert.doesNotMatch(snapshot,/aria-label="Holdings history date"|Allocation weight|Last allocation|monthly/i);
    const history=renderToStaticMarkup(React.createElement(Holdings,{...base,history:{dates:["2025-01-15","2025-01-16"],selectedDate:"2025-01-16",onSelectDate:()=>{}},allocation:{date:"2025-01-15",weights:{A:.8,B:-.2,CASH:.4}}}));
    assert.match(history,/aria-label="Holdings history date"/);assert.match(history,/Allocation weight/);assert.match(history,/80\.00%/);assert.match(history,/2025-01-15/);assert.doesNotMatch(history,/monthly/i);
    const nearZero=renderToStaticMarkup(React.createElement(Holdings,{...base,positions:[{ticker:"A",value:100},{ticker:"CASH",value:-1e-10}]}));
    assert.doesNotMatch(nearZero,/-0\.00%|\-\$0/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
