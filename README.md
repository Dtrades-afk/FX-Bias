<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Weekly Fundamental Bias</title>
<style>
:root{color-scheme:dark;--bg:#0a1220;--card:#0f1b2e;--card2:#0c1627;--line:#1f3150;--ink:#e6edf7;--mute:#8aa0bd;--hd:#6aa2ff;--vbr:#c0213f;--br:#f0445b;--n:#8a97a8;--b:#3b82f6;--vb:#22c3ee}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}
main{max-width:1100px;margin:0 auto;padding:22px 16px 48px}
h1{font:700 30px/1.1 system-ui,sans-serif;letter-spacing:.02em;text-transform:uppercase;margin:0}
h2{font-size:18px;margin:0 0 10px}
.sub{color:var(--hd);font-size:18px;margin:4px 0}
.meta{color:var(--mute);font-size:13px;margin:0 0 18px}.warn{color:var(--br)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;margin-bottom:22px}
.card,section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
section{margin-bottom:16px}
.top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.top b{font-size:20px}.top small{color:var(--mute);border-left:1px solid var(--line);padding-left:10px}
.gw{position:relative;width:170px;margin:8px auto 0}.gw svg{display:block;width:100%}
.lvl{position:absolute;left:0;right:0;bottom:0;text-align:center;font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.badge{display:block;margin:10px auto;width:70%;text-align:center;border-radius:8px;padding:6px;font-weight:700;color:#fff;text-transform:uppercase}
.why{background:var(--card2);border-radius:8px;padding:10px 12px;font-size:14px}
.why h3{margin:0 0 4px;font-size:15px;color:var(--hd);text-transform:uppercase}.why ul{margin:0;padding-left:18px}.why li{margin-bottom:3px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.chip{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:999px;padding:4px 12px;font:inherit;cursor:pointer}
.chip[aria-pressed=true]{background:var(--b);border-color:var(--b)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:460px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}th{font-size:13px;color:var(--mute)}
.legend{display:flex;flex-wrap:wrap;gap:16px;align-items:center;color:var(--mute);font-size:13px}
.legend i{display:inline-block;width:26px;height:14px;border-radius:4px;vertical-align:middle;margin-right:6px}
li{margin-bottom:6px}a{color:var(--hd)}
:focus-visible{outline:2px solid var(--hd);outline-offset:2px}
</style>
</head>
<body>
<main>
<h1>Weekly fundamental bias</h1>
<div class="sub">Key pairs &amp; commodities</div>
<p class="meta" id="meta">Loading the latest data…</p>
<div class="cards" id="cards"></div>
<section><h2>All pairs</h2><div class="chips" id="filters"></div>
<div class="scroll"><table><thead><tr><th>Pair</th><th>Bias</th><th>Gap</th></tr></thead><tbody id="pairs"></tbody></table></div></section>
<section><h2>Currencies and metals</h2>
<div class="scroll"><table><thead><tr><th>Name</th><th>Score</th><th>Rates</th><th>Inflation</th><th>COT</th><th>News</th></tr></thead><tbody id="cur"></tbody></table></div>
<p class="meta">Inputs: +1 supportive, 0 flat, −1 negative, a dash means no data.</p></section>
<section><h2>Headlines</h2><ul id="news"></ul></section>
<section><h2>Scorecard</h2>
<p class="meta">How past readings compared with what price did over the next 5 trading days. Each day you open the site, its readings are saved in this browser.</p>
<div id="score"><p class="meta">Checking saved readings…</p></div>
<button class="chip" onclick="exportLog()">Download log (CSV)</button>
<p class="meta">Prices are ECB daily reference rates from Frankfurter, not your broker’s prices. Gold and silver are logged but not checked, because no price source is connected for them. The log lives only in this browser, so it grows only on days you open the site on this device. Small samples can mislead.</p></section>
<section class="legend" id="legend"></section>
</main>
<script>
// Edit this list to change which pairs appear as cards at the top.
const WATCH=["XAU/USD","XAG/USD","EUR/USD","GBP/USD","GBP/JPY","EUR/GBP"];
const NAMES={"XAU/USD":"Gold (XAU/USD)","XAG/USD":"Silver (XAG/USD)"};
const COL={"Very bullish":"var(--vb)","Bullish":"var(--b)","Neutral":"var(--n)","Bearish":"var(--br)","Very bearish":"var(--vbr)"};
let D=null,filt="All";
const f=v=>v===null||v===undefined?"–":(Math.round(v*100)/100);
const sg=n=>(n>0?"+":"")+n;
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
async function load(){
  try{
    const r=await fetch("/api/bias"+location.search);
    if(!r.ok)throw new Error(r.status===401?"This site needs an access key. Add ?key=YOUR_KEY to the address.":"The server returned "+r.status);
    D=await r.json();render();logReadings();scorecard();
  }catch(e){document.getElementById("meta").innerHTML="<span class='warn'>Couldn’t load data: "+esc(e.message)+"</span>"}
}
function why(p){
  const[b,q]=p.pair.split("/"),cb=D.currencies[b].comps,cq=D.currencies[q].comps;
  const W={rates:["falling","flat","rising"],infl:["cooling","flat","heating up"],cot:["cutting longs","flat","adding longs"]};
  const L={rates:"Rates",infl:"Inflation",cot:"Positioning"},out=[];
  for(const k of["rates","infl","cot"]){
    const parts=[];
    [[b,cb],[q,cq]].forEach(([c,m])=>{if(m[k]!==null&&m[k]!==undefined)parts.push(c+" "+W[k][Math.sign(m[k])+1]+(k==="cot"&&Math.abs(m[k])===0.5?" (crowded)":"")+(k==="cot"&&D.currencies[c].cotPct!=null?" (52w pct "+D.currencies[c].cotPct+")":""))});
    if(parts.length)out.push(L[k]+": "+parts.join(", "));
  }
  const ns=[[b,cb.news],[q,cq.news]].filter(x=>x[1]!==null&&x[1]!==undefined);
  if(ns.length)out.push("News tone: "+ns.map(x=>x[0]+" "+sg(f(x[1]))).join(", "));
  out.push("Gap "+sg(p.gap)+" (scores "+b+" "+D.currencies[b].score+", "+q+" "+D.currencies[q].score+")");
  return out;
}
function card(p){
  const c=COL[p.level],pct=Math.max(4,Math.min(100,(p.gap+100)/2));
  const arc="M10 62 A50 50 0 0 1 110 62";
  return "<div class='card'><div class='top'><b>"+esc(NAMES[p.pair]||p.pair)+"</b><small>"+(p.pair.startsWith("XA")?"Commodity":"Forex")+"</small></div>"+
  "<div class='gw'><svg viewBox='0 0 120 70' role='img' aria-label='"+esc(p.level)+"'><path d='"+arc+"' pathLength='100' fill='none' stroke='var(--line)' stroke-width='12'/>"+
  "<path d='"+arc+"' pathLength='100' fill='none' stroke='"+c+"' stroke-width='12' stroke-dasharray='"+pct+" 100'/></svg><div class='lvl' style='color:"+c+"'>"+esc(p.level)+"</div></div>"+
  "<span class='badge' style='background:"+c+"'>"+esc(p.level)+"</span>"+
  "<div class='why'><h3>Why?</h3><ul>"+why(p).map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul></div></div>";
}
function render(){
  const bad=Object.entries(D.status).filter(([,v])=>v!=="ok");
  document.getElementById("meta").innerHTML="Updated "+new Date(D.updated).toLocaleString()+(bad.length?"<br><span class='warn'>Missing inputs: "+bad.map(([k,v])=>esc(k+" ("+v+")")).join("; ")+". Scores use the inputs that did load.</span>":"");
  document.getElementById("cards").innerHTML=WATCH.map(w=>D.pairs.find(p=>p.pair===w)).filter(Boolean).map(card).join("");
  const fl=document.getElementById("filters");fl.innerHTML="";
  ["All","Very bullish","Bullish","Neutral","Bearish","Very bearish"].forEach(x=>{const b=document.createElement("button");b.className="chip";b.textContent=x;b.setAttribute("aria-pressed",x===filt);b.onclick=()=>{filt=x;render()};fl.appendChild(b)});
  const rows=D.pairs.filter(p=>filt==="All"||p.level===filt).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap));
  document.getElementById("pairs").innerHTML=rows.length?rows.map(p=>"<tr><td>"+p.pair+"</td><td style='color:"+COL[p.level]+"'><b>"+p.level+"</b></td><td>"+sg(p.gap)+"</td></tr>").join(""):"<tr><td colspan='3'>No pairs at this level right now.</td></tr>";
  document.getElementById("cur").innerHTML=Object.entries(D.currencies).sort((a,b)=>b[1].score-a[1].score).map(([c,v])=>"<tr><td>"+c+"</td><td><b>"+v.score+"</b></td><td>"+f(v.comps.rates)+"</td><td>"+f(v.comps.infl)+"</td><td>"+f(v.comps.cot)+(v.cotPct!=null?" (pct "+v.cotPct+")":"")+"</td><td>"+f(v.comps.news)+"</td></tr>").join("");
  document.getElementById("news").innerHTML=D.headlines.length?D.headlines.map(h=>"<li>"+(h.c?"<b>"+h.c+" "+sg(h.s)+"</b> ":"")+(h.url?"<a href='"+encodeURI(h.url)+"' target='_blank' rel='noopener'>"+esc(h.headline)+"</a>":esc(h.headline))+" <span class='meta'>"+esc(h.source||"")+"</span></li>").join(""):"<li class='meta'>No headlines loaded. Add the news keys to enable them.</li>";
  document.getElementById("legend").innerHTML=Object.entries(COL).map(([k,v])=>"<span><i style='background:"+v+"'></i>"+k+"</span>").join("")+"<span>Bias is based on macro data, positioning and news inputs. For informational purposes only.</span>";
}
const LOGKEY="fxbias-log-v1",H=5,APIS=["https://api.frankfurter.dev/v1","https://api.frankfurter.app"];
function getLog(){try{return JSON.parse(localStorage.getItem(LOGKEY))||[]}catch(e){return[]}}
function logReadings(){
  try{
    const d=D.updated.slice(0,10),log=getLog(),have=new Set(log.filter(x=>x.d===d).map(x=>x.p));
    D.pairs.forEach(p=>{if(!have.has(p.pair))log.push({d,p:p.pair,l:p.level,g:p.gap})});
    localStorage.setItem(LOGKEY,JSON.stringify(log));
  }catch(e){}
}
async function series(start,end){
  for(const base of APIS){
    try{const r=await fetch(base+"/"+start+".."+end+"?from=USD&to=EUR,GBP,JPY,AUD,NZD,CAD,CHF");if(r.ok)return(await r.json()).rates}catch(e){}
  }
  throw new Error("price source unavailable");
}
async function scorecard(){
  const el=document.getElementById("score"),log=getLog().filter(x=>!x.p.startsWith("XA"));
  if(!log.length){el.innerHTML="<p class='meta'>No readings saved yet. One is saved for each day you open the site.</p>";return}
  const days=[...new Set(log.map(x=>x.d))].sort();
  let R;
  try{R=await series(days[0],new Date().toISOString().slice(0,10))}
  catch(e){el.innerHTML="<p class='meta warn'>Couldn’t load prices to check readings ("+esc(e.message)+"). "+log.length+" readings are saved.</p>";return}
  const ds=Object.keys(R).sort(),at=(i,c)=>c==="USD"?1:R[ds[i]][c],S={};
  let done=0;
  log.forEach(x=>{
    let i=-1;ds.forEach((v,k)=>{if(v<=x.d)i=k});
    if(i<0||i+H>=ds.length)return;
    const[b,q]=x.p.split("/"),ret=((at(i+H,q)/at(i+H,b))/(at(i,q)/at(i,b))-1)*100;
    const dir=x.l.toLowerCase().includes("bullish")?1:x.l.toLowerCase().includes("bearish")?-1:0;
    const s=S[x.l]=S[x.l]||{n:0,hit:0,sum:0,abs:0};
    s.n++;done++;s.abs+=Math.abs(ret);
    if(dir){s.sum+=dir*ret;if(dir*ret>0)s.hit++}
  });
  if(!done){el.innerHTML="<p class='meta'>Collecting data: "+log.length+" readings saved from "+days.length+" day(s). Results appear once a reading is "+H+" trading days old.</p>";return}
  const rows=["Very bullish","Bullish","Neutral","Bearish","Very bearish"].filter(l=>S[l]).map(l=>{
    const s=S[l],dir=l!=="Neutral";
    return "<tr><td style='color:"+COL[l]+"'><b>"+l+"</b></td><td>"+s.n+"</td><td>"+(dir?Math.round(s.hit/s.n*100)+"%":"–")+"</td><td>"+(dir?sg(+(s.sum/s.n).toFixed(2))+"%":"avg move "+(s.abs/s.n).toFixed(2)+"%")+"</td></tr>";
  }).join("");
  el.innerHTML="<div class='scroll'><table><thead><tr><th>Reading</th><th>Checked</th><th>Right direction</th><th>Avg return in bias direction</th></tr></thead><tbody>"+rows+"</tbody></table></div>";
}
function exportLog(){
  const csv="date,pair,level,gap\n"+getLog().map(x=>[x.d,x.p,x.l,x.g].join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="fx-bias-log.csv";a.click();
}
load();
</script>
</body>
</html>
