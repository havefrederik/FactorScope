import test from "node:test";
import assert from "node:assert/strict";
import {parseCustomExposures,validateCustomExposureSnapshot} from "../lib/custom-exposures.ts";
const header="ticker,factor,exposure,as_of,unit\n";
test("custom factors are reordered to the optimizer universe and retain dates and units",()=>{
 const factors=parseCustomExposures(header+'BBB,Signal,-.4,2026-10-15,z-score\nAAA,Signal,1.2,2026-10-15,z-score',["AAA","BBB"],"2026-10-16");assert.deepEqual(factors,[{name:"Custom: Signal",group:"Custom",values:[1.2,-.4],asOf:"2026-10-15",unit:"z-score"}]);assert.deepEqual(validateCustomExposureSnapshot(factors,["AAA","BBB"],"2026-10-16"),factors);
});
test("partial, duplicate, future and inconsistent exposure snapshots are rejected",()=>{
 for(const rows of ['AAA,Signal,1,2026-10-15,z-score','AAA,Signal,1,2026-10-17,z-score\nBBB,Signal,2,2026-10-17,z-score','AAA,Signal,1,2026-10-15,z-score\nAAA,Signal,2,2026-10-15,z-score','AAA,Signal,1,2026-10-15,z-score\nBBB,Signal,2,2026-10-14,z-score','AAA,Signal,1,2026-10-15,z-score\nBBB,Signal,2,2026-10-15,beta'])assert.throws(()=>parseCustomExposures(header+rows,["AAA","BBB"],"2026-10-16"));
 assert.throws(()=>validateCustomExposureSnapshot([{name:"Custom: Signal",values:[1],asOf:"2026-10-17",unit:"z-score"}],["AAA","BBB"],"2026-10-16"));
});
