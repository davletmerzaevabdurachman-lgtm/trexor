"use client";
import { useState } from "react";
export function CodeBlock({lang,code}:{lang:string;code:string}){
 const[ok,setOk]=useState(false);
 const copy=()=>{navigator.clipboard.writeText(code);setOk(true);setTimeout(()=>setOk(false),1200)};
 return <div className="code"><div className="codebar"><span>{lang||"text"}</span><button className="mini" onClick={copy}>{ok?"Kopiert":"Kopieren"}</button></div><pre>{code}</pre></div>
}
const inline=(t:string)=>t.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p,i)=>p.length>2&&p.startsWith("`")?<code key={i}>{p.slice(1,-1)}</code>:p.length>4&&p.startsWith("**")?<strong key={i}>{p.slice(2,-2)}</strong>:p);
export function Markdown({text,onOpenCode}:{text:string;onOpenCode:()=>void}){
 return <>{text.split(/(```[\s\S]*?(?:```|$))/g).map((p,i)=>{
  if(p.startsWith("```")){const m=p.match(/^```(\w*)\n?([\s\S]*?)(```)?$/);const lang=m?.[1]??"",code=(m?.[2]??"").replace(/\n$/,"");if(lang==="html")return <button key={i} className="filecard" onClick={onOpenCode}><b>index.html</b><small>{m?.[3]?"aktualisiert":"wird geschrieben …"}</small></button>;return <CodeBlock key={i} lang={lang} code={code}/>}
  return p.trim()?p.trim().split(/\n{2,}/).map((para,j)=><p key={i+"-"+j}>{inline(para)}</p>):null
 })}</>
}