"use client";

import { useEffect, useState } from "react";

const STATUSES = ["New", "Contacted", "Interested", "Demo booked", "Won", "Not interested", "Do not contact"] as const;
type Status = typeof STATUSES[number];
type Prospect = {
  id: string; name: string; area: string; phone: string; source: string;
  fit: string; status: Status; notes: string; whatsappConsent?: string;
};
const KEY = "mapharvest-loungelink-prospects-v1";
function valid(value: unknown): value is Prospect {
  if (!value || typeof value !== "object") return false;
  const p = value as Prospect;
  return [p.id,p.name,p.area,p.phone,p.source,p.fit,p.notes].every(v=>typeof v==="string") &&
    !!p.id && !!p.name && /^https:\/\//i.test(p.source) &&
    STATUSES.includes(p.status) && p.phone.replace(/\D/g,"").length >= 7 &&
    (p.whatsappConsent === undefined || typeof p.whatsappConsent === "string");
}
const identity = (p: Prospect) => p.phone.replace(/\D/g,"").replace(/^20(?=1\d{9}$)/,"0") + "|" + p.name.trim().toLowerCase();
function egyptWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const local = digits.replace(/^0020/, "0").replace(/^20(?=1\d{9}$)/, "0");
  return /^01[0125]\d{8}$/.test(local) ? "20" + local.slice(1) : null;
}

function canOpenWhatsApp(p: Prospect) {
  return !!egyptWhatsAppNumber(p.phone) && !!p.whatsappConsent?.trim() &&
    !["Not interested", "Do not contact", "Won"].includes(p.status);
}

export function SalesProspects() {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [ready,setReady] = useState(false);
  const [message,setMessage] = useState("");
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [draft,setDraft] = useState("");
  const selected = rows.find(p=>p.id===selectedId);
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
      const ids=new Set(rows.map(p=>p.id));
      for(const p of data)if(!unique.has(identity(p))&&!ids.has(p.id)){unique.set(identity(p),p);ids.add(p.id);}
      const next=[...unique.values()];
      setRows(next);
      setMessage("Imported "+(next.length-rows.length)+" new prospects. Existing sales notes preserved.");
    }catch(e){setMessage(e instanceof Error?e.message:"Import failed");}
  };
  const update=(id:string,changes:Partial<Pick<Prospect,"status"|"notes"|"whatsappConsent">>)=>setRows(prev=>prev.map(p=>p.id===id?{...p,...changes}:p));
  function download(){
    const url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;a.download="loungelink-prospects.json";a.click();URL.revokeObjectURL(url);
  }
  return <section className="mt-8 rounded-[28px] border border-ink-900/10 bg-white p-6 shadow-panel space-y-4">
    <h2 className="text-xl font-semibold text-ink-950">LoungeLink sales workspace</h2>
    <p className="text-sm text-ink-700">Import manually verified public business listings from permitted sources. A listed phone is not a verified buyer. Confirm the venue rents gaming rooms, and ask whether the manager needs a POS. Respect opt-outs; no automatic messaging. WhatsApp requires permission from the recipient before sending marketing messages. Public phone listings alone are not consent.</p>
    <div className="flex flex-wrap gap-3 items-center">
      <label className="text-sm font-medium">Import prospects <input className="block mt-1" type="file" accept=".json,application/json" disabled={!ready} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value="";}}/></label>
      <button type="button" disabled={!rows.length} onClick={download} className="rounded-xl bg-ink-950 text-white px-4 py-2 text-sm disabled:opacity-50">Export prospect tracker</button>
    </div>
    {message&&<p role="status" className="text-sm text-ink-700">{message}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
      {[["Prospects",rows.length],["Contacted / progressed",rows.filter(p=>!["New","Do not contact"].includes(p.status)).length],["Interested / demo",rows.filter(p=>["Interested","Demo booked"].includes(p.status)).length],["Won",rows.filter(p=>p.status==="Won").length]].map(([label,count])=><div key={label} className="rounded-xl border p-3"><div className="text-xs">{label}</div><strong>{count}</strong></div>)}
    </div>
    {!rows.length?<p className="text-sm text-ink-700">Import a prospect list to start tracking.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{["Business / fit","Public contact","Status","Notes","WhatsApp"].map(h=><th key={h} className="p-2 border-b">{h}</th>)}</tr></thead>
      <tbody>{rows.map(p=><tr key={p.id} className="border-b align-top">
        <td className="p-2 min-w-[190px]"><strong>{p.name}</strong><div>{p.area}</div><div className="text-xs text-ink-700">{p.fit}</div></td>
        <td className="p-2 whitespace-nowrap"><div>{p.phone}</div><a href={p.source} target="_blank" rel="noreferrer" className="underline text-tide-700">Public listing</a></td>
        <td className="p-2"><select className="border rounded p-1" value={p.status} onChange={e=>update(p.id,{status:e.target.value as Status})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></td>
        <td className="p-2"><textarea className="border rounded p-1 min-w-[160px]" rows={2} value={p.notes} onChange={e=>update(p.id,{notes:e.target.value})}/></td>
        <td className="p-2 min-w-[210px]">
          <label className="block text-xs">WhatsApp permission (how / when granted)
            <input className="w-full border rounded p-1 mt-1" value={p.whatsappConsent??""} placeholder="Not granted" maxLength={300} disabled={["Do not contact","Not interested","Won"].includes(p.status)} onChange={e=>update(p.id,{whatsappConsent:e.target.value})}/>
          </label>
          <button type="button" disabled={!canOpenWhatsApp(p)} className="mt-2 rounded-lg bg-emerald-700 text-white px-3 py-2 text-xs disabled:opacity-40" onClick={()=>{
            setSelectedId(p.id);
            setDraft("أهلاً بحضرتك، شكراً لسماحكم بالتواصل بخصوص LoungeLink POS لـ "+p.name+". السيستم بيساعد في إدارة وقت اللعب والغرف والحسابات والمخزون والمصروفات، من غير اشتراك شهري إجباري. لو مناسب لحضرتك، ممكن نرتب ديمو مجاني؟");
          }}>Prepare WhatsApp draft</button>
          {!egyptWhatsAppNumber(p.phone)&&<p className="text-xs">Egyptian mobile number required; verify separately.</p>}
        </td>
      </tr>)}</tbody>
    </table></div>}
    {selected && <section className="rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold">WhatsApp draft — {selected.name}</h3>
      <p className="text-xs">Review recipient and message. Opening a chat does not send anything or update the sales status.</p>
      <textarea dir="auto" className="w-full rounded border p-2 text-sm" rows={5} maxLength={1500} value={draft} onChange={e=>setDraft(e.target.value)}/>
      <div className="flex flex-wrap gap-2 items-center">
        {canOpenWhatsApp(selected)&&draft.trim()&&<a className="rounded-lg bg-emerald-700 px-3 py-2 text-white text-sm" href={"https://wa.me/"+egyptWhatsAppNumber(selected.phone)+"?text="+encodeURIComponent(draft)} target="_blank" rel="noopener noreferrer">Open WhatsApp — review and send</a>}
        <button type="button" className="border rounded px-3 py-2 text-sm" onClick={()=>{setSelectedId(null);setDraft("");}}>Close</button>
      </div>
    </section>}
    <p className="text-xs text-ink-700">Saved in this browser only. Export regularly. Use public business channels and do not contact declined prospects again.</p>
  </section>;
}
