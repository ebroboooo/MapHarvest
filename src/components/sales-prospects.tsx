"use client";

import { useEffect, useState } from "react";

const STATUSES = ["New", "Contacted", "Interested", "Demo booked", "Won", "Not interested", "Do not contact"] as const;
type Status = typeof STATUSES[number];
type Prospect = {
  id: string; name: string; area: string; phone: string; source: string;
  fit: string; status: Status; notes: string;
};
const KEY = "mapharvest-loungelink-prospects-v1";
function valid(value: unknown): value is Prospect {
  if (!value || typeof value !== "object") return false;
  const p = value as Prospect;
  return [p.id,p.name,p.area,p.phone,p.source,p.fit,p.notes].every(v=>typeof v==="string") &&
    !!p.id && !!p.name && /^https:\/\//i.test(p.source) &&
    STATUSES.includes(p.status) && p.phone.replace(/\D/g,"").length >= 7;
}
const identity = (p: Prospect) => p.phone.replace(/\D/g,"") + "|" + p.name.trim().toLowerCase();
export function SalesProspects() {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [ready,setReady] = useState(false);
  const [message,setMessage] = useState("");
  useEffect(()=>{
    try { const stored=JSON.parse(localStorage.getItem(KEY)||"[]"); if(Array.isArray(stored))setRows(stored.filter(valid)); }
    catch { setMessage("Saved prospect data could not be read."); }
    setReady(true);
  },[]);
  useEffect(()=>{
    if(ready)try{localStorage.setItem(KEY,JSON.stringify(rows));}catch{setMessage("Unable to save locally; export your list.");}
  },[rows,ready]);
  const importFile=async (file: File)=>{
    try {
      if(file.size>2_000_000)throw Error("File too large");
      const data:unknown=JSON.parse(await file.text());
      if(!Array.isArray(data)||!data.every(valid))throw Error("Invalid prospect JSON");
      const unique=new Map(rows.map(p=>[identity(p),p]));
      for(const p of data)if(!unique.has(identity(p)))unique.set(identity(p),{...p,status:"New",notes:""});
      const next=[...unique.values()];
      setRows(next);
      setMessage("Imported "+(next.length-rows.length)+" new prospects. Existing sales notes preserved.");
    }catch(e){setMessage(e instanceof Error?e.message:"Import failed");}
  };
  const update=(id:string,changes:Partial<Pick<Prospect,"status"|"notes">>)=>setRows(prev=>prev.map(p=>p.id===id?{...p,...changes}:p));
  function download(){
    const url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;a.download="loungelink-prospects.json";a.click();URL.revokeObjectURL(url);
  }
  return <section className="mt-8 rounded-[28px] border border-ink-900/10 bg-white p-6 shadow-panel space-y-4">
    <h2 className="text-xl font-semibold text-ink-950">LoungeLink sales workspace</h2>
    <p className="text-sm text-ink-700">Import manually verified public business listings from permitted sources. A listed phone is not a verified buyer. Confirm the venue rents gaming rooms, and ask whether the manager needs a POS. Respect opt-outs; no automatic messaging.</p>
    <div className="flex flex-wrap gap-3 items-center">
      <label className="text-sm font-medium">Import prospects <input className="block mt-1" type="file" accept=".json,application/json" disabled={!ready} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value="";}}/></label>
      <button type="button" disabled={!rows.length} onClick={download} className="rounded-xl bg-ink-950 text-white px-4 py-2 text-sm disabled:opacity-50">Export prospect tracker</button>
    </div>
    {message&&<p role="status" className="text-sm text-ink-700">{message}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
      {[["Prospects",rows.length],["Contacted / progressed",rows.filter(p=>!["New","Do not contact"].includes(p.status)).length],["Interested / demo",rows.filter(p=>["Interested","Demo booked"].includes(p.status)).length],["Won",rows.filter(p=>p.status==="Won").length]].map(([label,count])=><div key={label} className="rounded-xl border p-3"><div className="text-xs">{label}</div><strong>{count}</strong></div>)}
    </div>
    {!rows.length?<p className="text-sm text-ink-700">Import a prospect list to start tracking.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{["Business / fit","Public contact","Status","Notes"].map(h=><th key={h} className="p-2 border-b">{h}</th>)}</tr></thead>
      <tbody>{rows.map(p=><tr key={p.id} className="border-b align-top">
        <td className="p-2 min-w-[190px]"><strong>{p.name}</strong><div>{p.area}</div><div className="text-xs text-ink-700">{p.fit}</div></td>
        <td className="p-2 whitespace-nowrap"><div>{p.phone}</div><a href={p.source} target="_blank" rel="noreferrer" className="underline text-tide-700">Public listing</a></td>
        <td className="p-2"><select className="border rounded p-1" value={p.status} onChange={e=>update(p.id,{status:e.target.value as Status})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></td>
        <td className="p-2"><textarea className="border rounded p-1 min-w-[160px]" rows={2} value={p.notes} onChange={e=>update(p.id,{notes:e.target.value})}/></td>
      </tr>)}</tbody>
    </table></div>}
    <p className="text-xs text-ink-700">Saved in this browser only. Export regularly. Use public business channels and do not contact declined prospects again.</p>
  </section>;
}
