import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";
import { api } from "../api";

const SEV_COLORS = { critical:"#ef4444", high:"#f97316", medium:"#eab308", low:"#3b82f6" };
const SRC_LABELS = {
  hibp:"HIBP", breach:"BreachDirectory", paste:"Paste Sites",
  telegram:"Telegram", leaklookup:"Leak-Lookup", leakcheck:"LeakCheck", intelx:"IntelX",
};
const SRC_COLORS = {
  hibp:"#6366f1", breach:"#a855f7", paste:"#64748b",
  telegram:"#0ea5e9", leaklookup:"#f97316", leakcheck:"#f59e0b", intelx:"#3b82f6",
};

function shortDate(str) {
  const d = new Date(str); return `${d.getMonth()+1}/${d.getDate()}`;
}
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl px-4 py-3 text-xs shadow-2xl">
      <p className="text-zinc-400 font-mono mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background:p.color }} />
          <span className="text-zinc-400 capitalize w-16">{p.name}</span>
          <span className="font-mono font-semibold" style={{ color:p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
async function generatePDF(report, trendDays, compPeriod) {
  const { default: jsPDF }       = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");
  if (!report) return;

  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W=210, H=297, M=15, CW=W-M*2;
  const now      = new Date();
  const dateStr  = now.toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
  const { global_stats: gs, comparisons, targets } = report;
  const comp = comparisons[compPeriod];
  const periodLabel = compPeriod==="week" ? "This Week vs Last Week" : "This Month vs Last Month";
  const RISK = gs.critical>0 ? {label:"CRITICAL",r:239,g:68, b:68 }
             : gs.high>0     ? {label:"HIGH",     r:249,g:115,b:22 }
             : gs.medium>0   ? {label:"MEDIUM",   r:234,g:179,b:8  }
             :                 {label:"LOW",       r:59, g:130,b:246};

  // ── helpers ──────────────────────────────────────────────────────────────
  const F=(sz,w="normal")=>{doc.setFontSize(sz);doc.setFont("helvetica",w);};
  const C=(r,g,b)=>doc.setTextColor(r,g,b);
  const FC=(r,g,b)=>doc.setFillColor(r,g,b);
  const SK=(r,g,b,lw=0.25)=>{doc.setDrawColor(r,g,b);doc.setLineWidth(lw);};
  const T=(t,x,y,opt)=>doc.text(t,x,y,opt);
  const HL=(y,r=229,g=231,b=235)=>{SK(r,g,b,0.25);doc.line(M,y,W-M,y);};

  function FR(x,y,w,h,r,g,b,a=1){
    const bld=(c)=>Math.round(c+(255-c)*(1-a));
    FC(a<1?bld(r):r, a<1?bld(g):g, a<1?bld(b):b);
    doc.rect(x,y,w,h,"F");
  }
  function BR(x,y,w,h,fr,fg,fb,dr,dg,db,a=1){
    FR(x,y,w,h,fr,fg,fb,a);
    SK(dr,dg,db,0.3); doc.rect(x,y,w,h,"S");
  }
  function pageHdr(section) {
    FR(0,0,W,13,248,249,250);
    SK(229,231,235,0.25); doc.line(0,13,W,13);
    F(6.5,"normal"); C(156,163,175);
    T("BREACH TOWER  ›  "+section.toUpperCase(), M, 9);
    const dw=doc.getTextWidth(dateStr); T(dateStr,W-M-dw,9);
  }
  function secTitle(title,y,subtitle="") {
    FR(M,y-1,3,10,239,68,68);
    F(15,"bold"); C(17,24,39); T(title,M+7,y+7);
    if(subtitle){ F(8,"normal"); C(107,114,128); T(subtitle,M+7,y+13); }
    HL(y+(subtitle?15:11));
    return y+(subtitle?20:16);
  }

  // load logo
  let logo=null;
  try {
    const r=await fetch("/logo-128.png");
    const b=await r.blob();
    logo=await new Promise(res=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.readAsDataURL(b);});
  } catch{}

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ═══════════════════════════════════════════════════════════════════════════
  FR(0,0,W,H,9,9,11);
  FR(0,0,4,H,239,68,68);
  FR(0,H-52,W,52,15,15,18);

  if(logo) doc.addImage(logo,"PNG",M+0.5,19,10,10);
  F(10,"bold"); C(255,255,255); T("BREACH TOWER",M+14,26);
  F(6.5,"normal"); C(113,113,122); T("THREAT INTELLIGENCE  ·  SMB EDITION",M+14,32);
  SK(39,39,46,0.35); doc.line(M,39,W-M,39);

  F(6.5,"bold"); C(239,68,68); T("EXECUTIVE SECURITY REPORT",M,54);
  F(30,"bold"); C(255,255,255);
  T("Dark Web",M,70); T("Exposure",M,86);
  F(30,"bold"); C(239,68,68); T("Intelligence",M,102);
  F(30,"bold"); C(255,255,255); T("Report",M,118);

  F(8.5,"normal"); C(161,161,170);
  const dl=doc.splitTextToSize("Comprehensive analysis of credential exposure, breach findings, and threat intelligence gathered from continuous dark web monitoring across all configured targets.",CW-10);
  T(dl,M,132);

  SK(39,39,46,0.4); doc.line(M,H-48,W-M,H-48);
  F(6,"normal"); C(113,113,122); T("REPORT DATE",M,H-41);
  F(9,"bold"); C(212,212,216); T(dateStr,M,H-35);
  F(6,"normal"); C(113,113,122); T("OVERALL RISK",W-M-40,H-41);
  FR(W-M-42,H-33,44,9,RISK.r,RISK.g,RISK.b);
  F(8,"bold"); C(255,255,255);
  const rlw=doc.getTextWidth(RISK.label); T(RISK.label,W-M-42+(44-rlw)/2,H-27);
  F(6,"normal"); C(55,55,65);
  T("CONFIDENTIAL  ·  Breach Tower Threat Intelligence",W/2-28,H-10);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr("Executive Summary");
  let cy=secTitle("Executive Summary",18);

  // Risk box
  BR(M,cy,CW,20,255,245,245,RISK.r,RISK.g,RISK.b,0.9);
  FR(M,cy,3,20,RISK.r,RISK.g,RISK.b);
  F(6,"bold"); C(RISK.r,RISK.g,RISK.b); T("RISK ASSESSMENT",M+6,cy+5.5);
  F(8.5,"normal"); C(55,65,81);
  const sl=doc.splitTextToSize(
    `Breach Tower detected ${gs.total} total alerts — ${gs.critical} critical and ${gs.high} high severity findings. `+
    `${gs.unacknowledged} alerts remain open. Overall exposure risk: ${RISK.label}.`,CW-12);
  T(sl,M+6,cy+11); cy+=26;

  // Stats grid
  F(6.5,"bold"); C(107,114,128); T("ALERT SUMMARY",M,cy); cy+=5;
  const statDefs=[
    {l:"Total Alerts",v:gs.total,          fr:249,fg:250,fb:251,dr:209,dg:213,db:219,vr:17, vg:24, vb:39 },
    {l:"Critical",    v:gs.critical,        fr:255,fg:241,fb:242,dr:252,dg:165,db:165,vr:185,vg:28, vb:28 },
    {l:"High",        v:gs.high,            fr:255,fg:247,fb:237,dr:253,dg:186,db:116,vr:194,vg:65, vb:12 },
    {l:"Medium",      v:gs.medium,          fr:255,fg:251,fb:235,dr:252,dg:211,db:77, vr:161,vg:98, vb:7  },
    {l:"Low",         v:gs.low,             fr:239,fg:246,fb:255,dr:147,dg:197,db:253,vr:29, vg:78, vb:216},
    {l:"Open",        v:gs.unacknowledged,  fr:245,fg:243,fb:255,dr:196,dg:181,db:253,vr:109,vg:40, vb:217},
  ];
  const cw3=(CW-4)/3;
  statDefs.forEach((s,i)=>{
    const col=i%3,row=Math.floor(i/3);
    const sx=M+col*(cw3+2),sy=cy+row*24;
    BR(sx,sy,cw3,22,s.fr,s.fg,s.fb,s.dr,s.dg,s.db);
    F(5.5,"bold"); C(120,130,145); T(s.l.toUpperCase(),sx+4,sy+6);
    F(22,"bold"); C(s.vr,s.vg,s.vb); T(String(s.v),sx+4,sy+19);
  });
  cy+=54;

  // Comparison table
  F(6.5,"bold"); C(107,114,128); T("PERIOD COMPARISON — "+periodLabel.toUpperCase(),M,cy); cy+=4;
  FR(M,cy,CW,7,243,244,246); SK(229,231,235,0.3); doc.rect(M,cy,CW,7,"S");
  const tcols=[M+3,M+72,M+112,M+155];
  ["Metric","Current Period","Previous Period","Change"].forEach((h,i)=>{
    F(6,"bold"); C(107,114,128); T(h,tcols[i],cy+5);
  });
  cy+=7;
  [
    {l:"Total Alerts",   cur:comp.current_total,    prev:comp.previous_total,    d:comp.delta_total   },
    {l:"Critical Alerts",cur:comp.current_critical, prev:comp.previous_critical, d:comp.delta_critical},
    {l:"High Alerts",    cur:comp.current_high,     prev:comp.previous_high,     d:comp.delta_high    },
  ].forEach((row,i)=>{
    if(i%2===1) FR(M,cy,CW,8,249,250,251);
    SK(240,241,243,0.2); doc.line(M,cy+8,M+CW,cy+8);
    F(8,"bold"); C(17,24,39); T(row.l,tcols[0],cy+5.5);
    F(8,"bold"); C(17,24,39); T(String(row.cur),tcols[1],cy+5.5);
    F(8,"normal"); C(107,114,128); T(String(row.prev),tcols[2],cy+5.5);
    const up=row.d>0,dn=row.d<0;
    F(8,"bold"); C(up?185:dn?22:107, up?28:dn?163:114, up?28:dn?74:128);
    T(`${up?"(+)":dn?"(-)":"(-)"} ${Math.abs(row.d)}`,tcols[3],cy+5.5);
    cy+=8;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — 30/60/90 TREND CHARTS (captured from DOM)
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr("Exposure Trend Analysis");
  cy=secTitle("Exposure Trend Analysis",18,"Daily alert counts by severity across three time windows");

  for (const d of ["30","60","90"]) {
    const el=document.getElementById(`pdf-trend-${d}`);
    if(!el) continue;
    const canvas=await html2canvas(el,{backgroundColor:"#ffffff",scale:2.5,logging:false,useCORS:true});
    const ch=(canvas.height/canvas.width)*CW;
    if(cy+ch+14>H-22){ doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr("Exposure Trend Analysis"); cy=18; }
    F(7,"bold"); C(55,65,81); T(`${d}-DAY TREND`,M,cy); cy+=3;
    doc.addImage(canvas.toDataURL("image/png"),"PNG",M,cy,CW,ch);
    cy+=ch+8;
  }

  // Severity key
  if(cy+24>H-22){ doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr("Exposure Trend Analysis"); cy=18; }
  F(6.5,"bold"); C(107,114,128); T("SEVERITY LEGEND",M,cy); cy+=5;
  const sevDefs=[
    {l:"CRITICAL",desc:"Immediate action required",  r:239,g:68, b:68, fr:255,fg:241,fb:242,dr:252,dg:165,db:165},
    {l:"HIGH",    desc:"Investigate within 24h",     r:249,g:115,b:22, fr:255,fg:247,fb:237,dr:253,dg:186,db:116},
    {l:"MEDIUM",  desc:"Address within the week",    r:234,g:179,b:8,  fr:255,fg:251,fb:235,dr:252,dg:211,db:77 },
    {l:"LOW",     desc:"Monitor and track",          r:59, g:130,b:246, fr:239,fg:246,fb:255,dr:147,dg:197,db:253},
  ];
  const sw=(CW-6)/4;
  sevDefs.forEach((s,i)=>{
    const sx=M+i*(sw+2);
    BR(sx,cy,sw,18,s.fr,s.fg,s.fb,s.dr,s.dg,s.db);
    FC(s.r,s.g,s.b); doc.circle(sx+5,cy+6.5,2.2,"F");
    F(7,"bold"); C(s.r,s.g,s.b); T(s.l,sx+10,cy+7.5);
    F(5.5,"normal"); C(120,130,145); T(doc.splitTextToSize(s.desc,sw-13),sx+4,cy+12.5);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4 — COMPARISON CHART
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr("Period Comparison");
  cy=secTitle("Period Comparison",18,periodLabel);
  const barEl=document.getElementById("pdf-bar-chart");
  if(barEl){
    const c2=await html2canvas(barEl,{backgroundColor:"#ffffff",scale:2.5,logging:false,useCORS:true});
    const bh=(c2.height/c2.width)*CW;
    doc.addImage(c2.toDataURL("image/png"),"PNG",M,cy,CW,bh);
    cy+=bh+8;
  }
  // numeric delta row
  FR(M,cy,CW,1,229,231,235);
  const dw3=(CW-4)/3;
  [{l:"Total",cur:comp.current_total,prev:comp.previous_total,d:comp.delta_total},
   {l:"Critical",cur:comp.current_critical,prev:comp.previous_critical,d:comp.delta_critical},
   {l:"High",cur:comp.current_high,prev:comp.previous_high,d:comp.delta_high},
  ].forEach((row,i)=>{
    const sx=M+i*(dw3+2),sy=cy+4;
    BR(sx,sy,dw3,22,249,250,251,229,231,235);
    F(5.5,"bold"); C(120,130,145); T(row.l.toUpperCase(),sx+4,sy+5.5);
    F(18,"bold"); C(17,24,39); T(String(row.cur),sx+4,sy+17);
    const up=row.d>0,dn=row.d<0;
    F(7,"bold"); C(up?185:dn?22:107,up?28:dn?163:114,up?28:dn?74:128);
    const chgStr=`${up?"(+)":dn?"(-)":"~"}${Math.abs(row.d)}`;
    T(chgStr,sx+dw3-doc.getTextWidth(chgStr)-3,sy+17);
  });
  cy+=32;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGES 5+ — PER-TARGET BREAKDOWN
  // ═══════════════════════════════════════════════════════════════════════════
  for (const tgt of targets) {
    doc.addPage(); FR(0,0,W,H,255,255,255);
    pageHdr(`Target: ${tgt.label}`);
    cy=18;

    // target header band
    FR(M,cy,CW,22,17,24,39);
    FR(M,cy,4,22,239,68,68);
    F(11,"bold"); C(255,255,255); T(tgt.label,M+8,cy+8);
    F(7,"normal"); C(156,163,175);
    T(`${tgt.total_alerts} alerts  ·  ${tgt.open_alerts} open  ·  First seen ${tgt.first_seen}  ·  Last seen ${tgt.last_seen}`,M+8,cy+16);
    cy+=28;

    // severity pills row
    const sevPills=[
      {l:"CRITICAL",v:tgt.severity.CRITICAL,r:239,g:68, b:68, fr:255,fg:241,fb:242,dr:252,dg:165,db:165},
      {l:"HIGH",    v:tgt.severity.HIGH,    r:249,g:115,b:22, fr:255,fg:247,fb:237,dr:253,dg:186,db:116},
      {l:"MEDIUM",  v:tgt.severity.MEDIUM,  r:234,g:179,b:8,  fr:255,fg:251,fb:235,dr:252,dg:211,db:77 },
      {l:"LOW",     v:tgt.severity.LOW,     r:59, g:130,b:246, fr:239,fg:246,fb:255,dr:147,dg:197,db:253},
    ];
    const pw=(CW-6)/4;
    sevPills.forEach((s,i)=>{
      const sx=M+i*(pw+2);
      BR(sx,cy,pw,16,s.fr,s.fg,s.fb,s.dr,s.dg,s.db);
      F(5.5,"bold"); C(120,130,145); T(s.l,sx+4,cy+6);
      F(14,"bold"); C(s.r,s.g,s.b); T(String(s.v),sx+4,cy+13.5);
    });
    cy+=22;

    // Breached websites
    if(tgt.websites_breached?.length){
      F(6.5,"bold"); C(107,114,128); T("BREACH SOURCES DETECTED",M,cy); cy+=4;
      const siteCols=3, siteW=(CW-4)/siteCols;
      tgt.websites_breached.forEach((site,i)=>{
        const col=i%siteCols,row=Math.floor(i/siteCols);
        const sx=M+col*(siteW+2),sy=cy+row*8;
        FR(sx,sy,siteW,6.5,243,244,246);
        SK(229,231,235,0.25); doc.rect(sx,sy,siteW,6.5,"S");
        F(6.5,"normal"); C(55,65,81);
        T(doc.splitTextToSize(site,siteW-4)[0],sx+3,sy+4.5);
      });
      const rows=Math.ceil(tgt.websites_breached.length/siteCols);
      cy+=rows*8+6;
    }

    // Source breakdown table
    F(6.5,"bold"); C(107,114,128); T("BREAKDOWN BY INTELLIGENCE SOURCE",M,cy); cy+=4;
    FR(M,cy,CW,7,243,244,246); SK(229,231,235,0.3); doc.rect(M,cy,CW,7,"S");
    const stcols=[M+3,M+52,M+78,M+104,M+130,M+156];
    ["Source","Total","Critical","High","Medium","Low"].forEach((h,i)=>{
      F(6,"bold"); C(107,114,128); T(h,stcols[i],cy+5);
    });
    cy+=7;

    Object.entries(tgt.by_source).sort((a,b)=>b[1].total-a[1].total).forEach(([src,data],i)=>{
      if(cy+8>H-22){ doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr(`Target: ${tgt.label}`); cy=18; }
      if(i%2===1) FR(M,cy,CW,8,249,250,251);
      SK(243,244,246,0.2); doc.line(M,cy+8,M+CW,cy+8);
      const srcColor=SRC_COLORS[src]||"#6b7280";
      const [sr,sg,sb]=srcColor.startsWith("#")?[
        parseInt(srcColor.slice(1,3),16),parseInt(srcColor.slice(3,5),16),parseInt(srcColor.slice(5,7),16)
      ]:[107,114,128];
      FC(sr,sg,sb); doc.circle(stcols[0]+2,cy+4,1.5,"F");
      F(7.5,"bold"); C(17,24,39); T(SRC_LABELS[src]||src.toUpperCase(),stcols[0]+6,cy+5.5);
      F(8,"bold"); C(17,24,39); T(String(data.total),stcols[1],cy+5.5);
      F(7.5,"normal");
      C(185,28,28); T(String(data.critical||0),stcols[2],cy+5.5);
      C(194,65,12); T(String(data.high||0),    stcols[3],cy+5.5);
      C(161,98,7);  T(String(data.medium||0),  stcols[4],cy+5.5);
      C(29,78,216); T(String(data.low||0),     stcols[5],cy+5.5);
      cy+=8;
    });
    cy+=4;

    // Sample findings
    F(6.5,"bold"); C(107,114,128); T("SAMPLE FINDINGS",M,cy); cy+=4;
    const allSamples=Object.values(tgt.by_source).flatMap(d=>d.samples)
      .sort((a,b)=>{const o={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};return (o[a.severity]??4)-(o[b.severity]??4);})
      .slice(0,6);

    allSamples.forEach((s)=>{
      const sevColors={CRITICAL:[185,28,28,255,241,242,252,165,165],HIGH:[194,65,12,255,247,237,253,186,116],MEDIUM:[161,98,7,255,251,235,252,211,77],LOW:[29,78,216,239,246,255,147,197,253]};
      const sc=sevColors[s.severity]||[107,114,128,249,250,251,229,231,235];
      const lines=doc.splitTextToSize(s.data_found||"",CW-20);
      const bxH=5+lines.length*4+4;
      if(cy+bxH>H-22){ doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr(`Target: ${tgt.label}`); cy=18; }
      BR(M,cy,CW,bxH,sc[3],sc[4],sc[5],sc[6],sc[7],sc[8]);
      FR(M,cy,3,bxH,sc[0],sc[1],sc[2]);
      F(6,"bold"); C(sc[0],sc[1],sc[2]); T(s.severity,M+6,cy+4.5);
      F(6,"normal"); C(107,114,128);
      T(new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),M+CW-doc.getTextWidth("Jan 1, 2026")-2,cy+4.5);
      F(7,"normal"); C(55,65,81); T(lines,M+6,cy+9);
      cy+=bxH+2;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL PAGE — RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage(); FR(0,0,W,H,255,255,255); pageHdr("Recommendations");
  cy=secTitle("Recommendations",18,"Prioritized actions based on current exposure findings");
  const recs=[
    {p:"IMMEDIATE",   r:185,g:28, b:28, fr:255,fg:241,fb:242,dr:252,dg:165,db:165,
     title:"Remediate Critical & High Severity Alerts",
     body:"Immediately reset all exposed credentials. Review every impacted account for unauthorized access. Rotate API keys, OAuth tokens, and service account passwords. Notify affected users."},
    {p:"SHORT-TERM",  r:154,g:52, b:18, fr:255,fg:247,fb:237,dr:253,dg:186,db:116,
     title:"Enable Multi-Factor Authentication Everywhere",
     body:"Enforce MFA on all monitored accounts and internal systems. Even with exposed credentials, MFA prevents unauthorized access in the majority of cases."},
    {p:"ONGOING",     r:30, g:64, b:175,fr:239,fg:246,fb:255,dr:147,dg:197,db:253,
     title:"Continuous Monitoring & Alert Assignment",
     body:"Assign all open alerts to specific analysts using Breach Tower's assignment feature. Track remediation actions with notes. Review trend data weekly for unusual spikes."},
    {p:"BEST PRACTICE",r:21,g:128,b:61, fr:240,fg:253,fb:244,dr:134,dg:239,db:172,
     title:"Enforce Strong Password Policy & Credential Hygiene",
     body:"Mandate a password manager across the organisation. Require minimum 16-character unique passwords per service. Rotate all credentials discovered in breach databases immediately. Conduct phishing simulations quarterly."},
  ];
  recs.forEach((rec)=>{
    const lines=doc.splitTextToSize(rec.body,CW-14);
    const bxH=7+5+lines.length*4.5+5;
    if(cy+bxH>H-22){doc.addPage();FR(0,0,W,H,255,255,255);pageHdr("Recommendations");cy=18;}
    BR(M,cy,CW,bxH,rec.fr,rec.fg,rec.fb,rec.dr,rec.dg,rec.db);
    FR(M,cy,3,bxH,rec.r,rec.g,rec.b);
    F(6,"bold"); C(rec.r,rec.g,rec.b); T(rec.p,M+7,cy+6);
    F(9,"bold"); C(17,24,39); T(rec.title,M+7+doc.getTextWidth(rec.p)+6,cy+6);
    F(8,"normal"); C(75,85,99); T(lines,M+7,cy+12);
    cy+=bxH+4;
  });

  // ── Footer on every content page (skip page 1 cover) ────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    // footer background strip
    FR(0, H-14, W, 14, 248, 249, 250);
    SK(229, 231, 235, 0.3); doc.line(0, H-14, W, H-14);
    // logo
    if (logo) doc.addImage(logo, "PNG", M, H-11.5, 6, 6);
    // brand text
    F(6.5, "bold"); C(55, 65, 81);
    T("Breach Tower", M + 8, H - 7.5);
    F(6, "normal"); C(156, 163, 175);
    T("Threat Intelligence Platform", M + 34, H - 7.5);
    // confidential badge
    const conf = "CONFIDENTIAL";
    const cw = doc.getTextWidth(conf) + 6;
    FR(W/2 - cw/2, H - 12, cw, 7, 239, 68, 68, 0.08);
    SK(239, 68, 68, 0.2); doc.rect(W/2 - cw/2, H - 12, cw, 7, "S");
    F(5.5, "bold"); C(185, 28, 28);
    T(conf, W/2, H - 7.5, { align: "center" });
    // page number
    F(6, "normal"); C(156, 163, 175);
    T(`${i} / ${totalPages}`, W - M, H - 7.5, { align: "right" });
  }

  doc.save(`breach-tower-report-${now.toISOString().slice(0,10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [report,    setReport]    = useState(null);
  const [trendDays, setTrendDays] = useState("30");
  const [compPeriod,setCompPeriod]= useState("week");
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try { setReport(await api.getFullReport()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleExport() {
    setExporting(true);
    try { await generatePDF(report, trendDays, compPeriod); }
    finally { setExporting(false); }
  }

  const gs   = report?.global_stats;
  const comp = report?.comparisons?.[compPeriod];
  const trends = report?.trends?.[trendDays] || [];
  const periodLabel = compPeriod==="week" ? "This week vs last week" : "This month vs last month";
  const barData = comp ? [
    {name:"Current",  Critical:comp.current_critical, High:comp.current_high, Other:Math.max(0,comp.current_total-comp.current_critical-comp.current_high)},
    {name:"Previous", Critical:comp.previous_critical,High:comp.previous_high,Other:Math.max(0,comp.previous_total-comp.previous_critical-comp.previous_high)},
  ] : [];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Reports</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Granular exposure analysis across all targets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting||loading}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all disabled:opacity-40 shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {exporting?"Generating PDF…":"Export PDF"}
          </button>
          <button onClick={load}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-[#111113] border border-[#1c1c1f] rounded-xl p-4 flex items-center gap-3">
          <span className="text-xs text-zinc-500 font-medium">Trend:</span>
          {["30","60","90"].map((d)=>(
            <button key={d} onClick={()=>setTrendDays(d)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${trendDays===d?"bg-red-600 text-white":"bg-[#1c1c1f] text-zinc-400 hover:bg-[#27272a]"}`}>
              {d}d
            </button>
          ))}
        </div>
        <div className="bg-[#111113] border border-[#1c1c1f] rounded-xl p-4 flex items-center gap-3">
          <span className="text-xs text-zinc-500 font-medium">Comparison:</span>
          {["week","month"].map((p)=>(
            <button key={p} onClick={()=>setCompPeriod(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${compPeriod===p?"bg-red-600 text-white":"bg-[#1c1c1f] text-zinc-400 hover:bg-[#27272a]"}`}>
              {p==="week"?"Weekly":"Monthly"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-600 text-sm py-10">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse"/>Loading report data…
        </div>
      )}

      {!loading && gs && (
        <>
          {/* Global stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              {l:"Total",    v:gs.total,          c:"text-zinc-200",  bg:"bg-[#111113]"},
              {l:"Critical", v:gs.critical,        c:"text-red-400",   bg:"bg-[#111113]"},
              {l:"High",     v:gs.high,            c:"text-orange-400",bg:"bg-[#111113]"},
              {l:"Medium",   v:gs.medium,          c:"text-amber-400", bg:"bg-[#111113]"},
              {l:"Low",      v:gs.low,             c:"text-blue-400",  bg:"bg-[#111113]"},
              {l:"Open",     v:gs.unacknowledged,  c:"text-violet-400",bg:"bg-[#111113]"},
            ].map((s)=>(
              <div key={s.l} className={`${s.bg} border border-[#1c1c1f] rounded-xl p-4`}>
                <p className="text-xs text-zinc-500 mb-1">{s.l}</p>
                <p className={`text-2xl font-semibold font-mono ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          {/* Trend charts — all 3 rendered for PDF capture, show selected */}
          <div className="bg-[#111113] border border-[#1c1c1f] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">Exposure Trend</h2>
                <p className="text-xs text-zinc-500">Daily alert counts by severity</p>
              </div>
              <div className="flex gap-1">
                {["30","60","90"].map((d)=>(
                  <button key={d} onClick={()=>setTrendDays(d)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${trendDays===d?"bg-red-600 text-white":"bg-[#1c1c1f] text-zinc-400 hover:bg-[#27272a]"}`}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mb-3 flex-wrap">
              {Object.entries(SEV_COLORS).map(([sev,color])=>(
                <div key={sev} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-semibold"
                  style={{background:color+"18",borderColor:color+"45",color}}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{background:color}}/>
                  {sev.charAt(0).toUpperCase()+sev.slice(1)}
                </div>
              ))}
            </div>
            {/* Visible chart — dark themed */}
            <div style={{background:"#09090b",padding:"10px 6px 2px",borderRadius:8,border:"1px solid #1c1c1f"}}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trends} margin={{top:4,right:8,left:-20,bottom:0}}>
                  <defs>{Object.entries(SEV_COLORS).map(([k,color])=>(
                    <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0.03}/>
                    </linearGradient>
                  ))}</defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false}/>
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{fill:"#52525b",fontSize:10}} axisLine={false} tickLine={false} interval={Math.floor(trends.length/8)}/>
                  <YAxis allowDecimals={false} tick={{fill:"#52525b",fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  {Object.entries(SEV_COLORS).map(([k,color])=>(
                    <Area key={k} type="monotone" dataKey={k} stroke={color} strokeWidth={2} fill={`url(#g-${k})`} dot={false} activeDot={{r:3,fill:color,stroke:"none"}}/>
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Hidden charts for PDF capture — all 3 time windows */}
            <div style={{position:"fixed",left:"-9999px",top:0,width:800,pointerEvents:"none",zIndex:-1}}>
              {["30","60","90"].map((d)=>(
                <div key={d} id={`pdf-trend-${d}`} style={{background:"#ffffff",padding:"12px 8px 4px",borderRadius:8,width:800}}>
                  <ResponsiveContainer width={800} height={200}>
                    <AreaChart data={report.trends[d]} margin={{top:4,right:8,left:-20,bottom:0}}>
                      <defs>{Object.entries(SEV_COLORS).map(([k,color])=>(
                        <linearGradient key={k} id={`ph-${d}-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={color} stopOpacity={0.35}/>
                          <stop offset="95%" stopColor={color} stopOpacity={0.02}/>
                        </linearGradient>
                      ))}</defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{fill:"#9ca3af",fontSize:10}} axisLine={false} tickLine={false} interval={Math.floor((report.trends[d]||[]).length/8)}/>
                      <YAxis allowDecimals={false} tick={{fill:"#9ca3af",fontSize:10}} axisLine={false} tickLine={false}/>
                      {Object.entries(SEV_COLORS).map(([k,color])=>(
                        <Area key={k} type="monotone" dataKey={k} stroke={color} strokeWidth={2} fill={`url(#ph-${d}-${k})`} dot={false}/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>

          {/* Comparison */}
          {comp && (
            <div className="bg-[#111113] border border-[#1c1c1f] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">Period Comparison</h2>
                  <p className="text-xs text-zinc-500">{periodLabel}</p>
                </div>
                <div className="flex gap-1">
                  {["week","month"].map((p)=>(
                    <button key={p} onClick={()=>setCompPeriod(p)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${compPeriod===p?"bg-red-600 text-white":"bg-[#1c1c1f] text-zinc-400 hover:bg-[#27272a]"}`}>
                      {p==="week"?"Weekly":"Monthly"}
                    </button>
                  ))}
                </div>
              </div>
              {/* Visible bar chart — dark themed */}
              <div style={{background:"#09090b",padding:"10px 6px 2px",borderRadius:8,border:"1px solid #1c1c1f"}}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} margin={{top:4,right:8,left:-20,bottom:0}} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false}/>
                    <XAxis dataKey="name" tick={{fill:"#a1a1aa",fontSize:12,fontWeight:600}} axisLine={false} tickLine={false}/>
                    <YAxis allowDecimals={false} tick={{fill:"#52525b",fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:"#111113",border:"1px solid #27272a",borderRadius:8,fontSize:11,color:"#e4e4e7"}}/>
                    <Legend wrapperStyle={{fontSize:"11px",paddingTop:"8px",color:"#71717a"}} iconType="circle" iconSize={7}/>
                    <Bar dataKey="Critical" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={52}/>
                    <Bar dataKey="High"     fill="#f97316" radius={[4,4,0,0]} maxBarSize={52}/>
                    <Bar dataKey="Other"    fill="#3f3f46" radius={[4,4,0,0]} maxBarSize={52}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Hidden white bar chart for PDF capture only */}
              <div style={{position:"fixed",left:"-9999px",top:0,pointerEvents:"none",zIndex:-1}}>
                <div id="pdf-bar-chart" style={{background:"#ffffff",padding:"10px 6px 2px",borderRadius:8,width:800}}>
                  <BarChart width={800} height={200} data={barData} margin={{top:4,right:8,left:-20,bottom:0}} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                    <XAxis dataKey="name" tick={{fill:"#374151",fontSize:12,fontWeight:600}} axisLine={false} tickLine={false}/>
                    <YAxis allowDecimals={false} tick={{fill:"#9ca3af",fontSize:10}} axisLine={false} tickLine={false}/>
                    <Legend wrapperStyle={{fontSize:"11px",paddingTop:"8px",color:"#6b7280"}} iconType="circle" iconSize={7}/>
                    <Bar dataKey="Critical" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={52}/>
                    <Bar dataKey="High"     fill="#f97316" radius={[4,4,0,0]} maxBarSize={52}/>
                    <Bar dataKey="Other"    fill="#d1d5db" radius={[4,4,0,0]} maxBarSize={52}/>
                  </BarChart>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  {l:"Total",    cur:comp.current_total,    prev:comp.previous_total,    d:comp.delta_total   },
                  {l:"Critical", cur:comp.current_critical, prev:comp.previous_critical, d:comp.delta_critical},
                  {l:"High",     cur:comp.current_high,     prev:comp.previous_high,     d:comp.delta_high    },
                ].map((row)=>(
                  <div key={row.l} className="bg-[#09090b] border border-[#1c1c1f] rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">{row.l}</p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-semibold font-mono text-zinc-200">{row.cur}</span>
                      <span className={`text-xs font-mono font-semibold mb-0.5 ${row.d>0?"text-red-400":row.d<0?"text-emerald-400":"text-zinc-500"}`}>
                        {row.d>0?"↑":row.d<0?"↓":"↔"} {Math.abs(row.d)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-0.5">prev: {row.prev}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-target breakdown */}
          {report.targets?.map((tgt)=>(
            <div key={tgt.id} className="bg-[#111113] border border-[#1c1c1f] rounded-xl overflow-hidden">
              {/* Target header */}
              <div className="bg-[#0d0d0f] border-b border-[#1c1c1f] px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white font-mono">{tgt.label}</span>
                    {tgt.open_alerts>0 && (
                      <span className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-md">
                        {tgt.open_alerts} open
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600">
                    {tgt.total_alerts} total alerts · First seen {tgt.first_seen} · Last seen {tgt.last_seen}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    {l:"Critical",v:tgt.severity.CRITICAL,c:"text-red-400",   bg:"bg-red-500/10",   bd:"border-red-500/20"  },
                    {l:"High",    v:tgt.severity.HIGH,    c:"text-orange-400",bg:"bg-orange-500/10",bd:"border-orange-500/20"},
                    {l:"Medium",  v:tgt.severity.MEDIUM,  c:"text-amber-400", bg:"bg-amber-500/10", bd:"border-amber-500/20" },
                    {l:"Low",     v:tgt.severity.LOW,     c:"text-blue-400",  bg:"bg-blue-500/10",  bd:"border-blue-500/20"  },
                  ].map((s)=>(
                    <div key={s.l} className={`${s.bg} border ${s.bd} rounded-lg px-3 py-1.5 text-center min-w-[52px]`}>
                      <p className={`text-lg font-semibold font-mono ${s.c}`}>{s.v}</p>
                      <p className="text-[10px] text-zinc-600">{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Breached websites */}
                {tgt.websites_breached?.length>0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Breach Sources Detected</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tgt.websites_breached.map((site)=>(
                        <span key={site} className="text-xs font-mono text-zinc-300 bg-[#09090b] border border-[#27272a] px-2 py-0.5 rounded-md">{site}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source breakdown table */}
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">By Intelligence Source</p>
                  <div className="border border-[#1c1c1f] rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#0d0d0f] border-b border-[#1c1c1f]">
                          <th className="text-left px-3 py-2 text-zinc-500 font-semibold">Source</th>
                          <th className="text-right px-3 py-2 text-zinc-500 font-semibold">Total</th>
                          <th className="text-right px-3 py-2 text-red-500/70 font-semibold">Crit</th>
                          <th className="text-right px-3 py-2 text-orange-500/70 font-semibold">High</th>
                          <th className="text-right px-3 py-2 text-amber-500/70 font-semibold">Med</th>
                          <th className="text-right px-3 py-2 text-blue-500/70 font-semibold">Low</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(tgt.by_source).sort((a,b)=>b[1].total-a[1].total).map(([src,data],i)=>(
                          <tr key={src} className={i%2===0?"bg-[#111113]":"bg-[#0d0d0f]"}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{background:SRC_COLORS[src]||"#6b7280"}}/>
                                <span className="font-semibold text-zinc-300">{SRC_LABELS[src]||src}</span>
                              </div>
                            </td>
                            <td className="text-right px-3 py-2 font-mono font-semibold text-zinc-200">{data.total}</td>
                            <td className="text-right px-3 py-2 font-mono text-red-400">{data.critical||0}</td>
                            <td className="text-right px-3 py-2 font-mono text-orange-400">{data.high||0}</td>
                            <td className="text-right px-3 py-2 font-mono text-amber-400">{data.medium||0}</td>
                            <td className="text-right px-3 py-2 font-mono text-blue-400">{data.low||0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sample findings */}
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Sample Findings</p>
                  <div className="space-y-1.5">
                    {Object.values(tgt.by_source).flatMap(d=>d.samples)
                      .sort((a,b)=>{const o={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};return(o[a.severity]??4)-(o[b.severity]??4);})
                      .slice(0,5)
                      .map((s,i)=>{
                        const sc={CRITICAL:"text-red-400 bg-red-500/10 border-red-500/20",HIGH:"text-orange-400 bg-orange-500/10 border-orange-500/20",MEDIUM:"text-amber-400 bg-amber-500/10 border-amber-500/20",LOW:"text-blue-400 bg-blue-500/10 border-blue-500/20"};
                        return (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[#09090b] border border-[#1c1c1f] rounded-lg">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${sc[s.severity]||sc.LOW}`}>{s.severity}</span>
                            <span className="text-xs text-zinc-400 font-mono leading-relaxed flex-1">{s.data_found}</span>
                            <span className="text-[10px] text-zinc-700 shrink-0">{new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
