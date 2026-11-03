/* DocCheck core: PDF text layout, contract + BL parsing and checks. Pure functions (no DOM). */
const DC = (function(){
"use strict";
const up = s => String(s||'').toUpperCase();
const N = s => up(s).replace(/[^A-Z0-9]/g,'');
const num = s => { if(s==null) return null; const n = +String(s).replace(/,/g,''); return isFinite(n)?n:null; };
const fmt = (n,d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});

/* ---------- PDF items -> layout text (pdf.js textContent items) ---------- */
function layoutFromItems(items, pageWidth){
  const rows=[]; const CW = Math.max(3.2, (pageWidth||595)/190); // ~190 columns per page width
  for(const it of items){ if(!it.str || !it.str.trim()) { if(it.str&&rows.length){} continue; }
    const x=it.transform[4], y=it.transform[5], h=Math.abs(it.transform[3])||8;
    let row=rows.find(r=>Math.abs(r.y-y)<Math.max(2,h*0.35)); if(!row){row={y,items:[]};rows.push(row);} row.items.push({x,s:it.str,w:it.width||0}); }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>{ r.items.sort((a,b)=>a.x-b.x); let line='', end=null, cw=CW;
    for(const t of r.items){ const s=t.s; const charW = t.w&&s.length? t.w/s.length : CW;
      if(end===null){ line=' '.repeat(Math.max(0,Math.round(t.x/CW))) + s.replace(/^\s+/,''); }
      else { const gap=(t.x-end)/Math.max(1,(charW+cw)/2);
        if(gap<0.35) line+=s; else if(gap<1.8) line=(line.endsWith(' ')?line:line+' ')+s.replace(/^\s+/,'');
        else { const col=Math.max(line.replace(/\s+$/,'').length+2, Math.round(t.x/CW)); line=line.replace(/\s+$/,'').padEnd(col,' ')+s.replace(/^\s+/,''); } }
      end=t.x+(t.w||s.length*charW); cw=charW; }
    return line.replace(/\s+$/,''); }).join('\n');
}

/* ---------- reference data ---------- */
const GRADES = [
 {re:/\bHMS\b|HEAVY MELT/i, name:'HMS', hs:['7204.49','7204.41']},
 {re:/\bLMS\b|LIGHT MELT/i, name:'LMS bundles', hs:['7204.41','7204.49']},
 {re:/SHRED/i, name:'Shredded', hs:['7204.49']},
 {re:/\bRAILS?\b|R50|R65/i, name:'Used rails', hs:['7204.49','7302.10']},
 {re:/CAST IRON|\bPNS\b|ISRI 252/i, name:'Cast iron', hs:['7204.10']},
 {re:/STAINLESS|\bSS ?304\b|\b316\b/i, name:'Stainless steel', hs:['7204.21','7204.29']},
 {re:/SECONDARY.*\bHR\b|\bHR COIL|HOT ROLLED|\bHRC\b/i, name:'Secondary HR coils / sheets', hs:['7208']},
 {re:/\bCR\b.*COIL|COLD ROLLED/i, name:'Secondary CR', hs:['7209']},
 {re:/ZINC|ZAMAK|\bSAVES?\b/i, name:'Zinc die cast', hs:['7902.00']},
 {re:/ZORBA|TENSE|TAINT|TABOR|ALUMIN/i, name:'Aluminium scrap', hs:['7602.00']},
 {re:/COPPER|BIRCH|CLIFF|BERRY|CANDY|MILLBERRY/i, name:'Copper scrap', hs:['7404.00']},
 {re:/BRASS|HONEY/i, name:'Brass scrap', hs:['7404.00']},
 {re:/TURNING|BORING/i, name:'Turnings', hs:['7204.41']},
];
const gradeOf = s => GRADES.find(g=>g.re.test(s||''))||null;
const hsFits = (hs,g) => { const h=N(hs); return g.hs.some(x=>h.startsWith(N(x).slice(0,4)) && (N(x).length<=4 || h.startsWith(N(x).slice(0,6)) || h.length<6)); };
const INCOTERMS=['CFR','CNF','C&F','CIF','FOB','EXW','FCA','FAS','CPT','CIP','DAP','DPU','DDP'];
const PORTS=['PORT QASIM','KARACHI','MUNDRA','NHAVA SHEVA','JNPT','KANDLA','PIPAVAV','HAZIRA','CHENNAI','KOLKATA','VIZAG','VISAKHAPATNAM','TUTICORIN','COCHIN','CHITTAGONG','JEBEL ALI','DUBAI','SHARJAH','KHALIFA','DAMMAM','JEDDAH','SOHAR','BINGAZI','BENGHAZI','MISURATA','TRIPOLI','KHOMS','DURBAN','CAPE TOWN','PORT ELIZABETH','MOMBASA','DAR ES SALAAM','TEMA','LAGOS','APAPA','ROTTERDAM','ANTWERP','HAMBURG','FELIXSTOWE','SOUTHAMPTON','LE HAVRE','VALENCIA','GENOA','NEW YORK','SAVANNAH','HOUSTON','SINGAPORE','PORT KLANG','HO CHI MINH','BUSAN'];

/* ---------- India IDs ---------- */
const B36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstinCheck(g){ let s=0; for(let i=0;i<14;i++){ const p=B36.indexOf(g[i])*(i%2?2:1); s+=Math.floor(p/36)+p%36; } return B36[(36-s%36)%36]; }
const GST_STATE={'01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','26':'Dadra & Nagar Haveli and Daman & Diu','27':'Maharashtra','29':'Karnataka','30':'Goa','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','36':'Telangana','37':'Andhra Pradesh'};
function pinState(pin){ const p=+String(pin).slice(0,2), p3=+String(pin).slice(0,3);
  if(p===11)return'Delhi'; if(p>=12&&p<=13)return'Haryana'; if(p>=14&&p<=16)return p3===160?'Chandigarh':'Punjab'; if(p===17)return'Himachal Pradesh'; if(p>=18&&p<=19)return'Jammu & Kashmir';
  if(p3>=244&&p3<=263)return p3>=246&&p3<=263?'Uttarakhand':'Uttar Pradesh'; if(p>=20&&p<=28)return'Uttar Pradesh'; if(p>=30&&p<=34)return'Rajasthan'; if(p>=36&&p<=39)return p3===396?'Gujarat / Dadra & Nagar Haveli':'Gujarat';
  if(p>=40&&p<=44)return p3===403?'Goa':'Maharashtra'; if(p>=45&&p<=48)return'Madhya Pradesh'; if(p===49)return'Chhattisgarh'; if(p>=50&&p<=50)return'Telangana'; if(p>=51&&p<=53)return'Andhra Pradesh';
  if(p>=56&&p<=59)return'Karnataka'; if(p>=60&&p<=64)return p3===605?'Tamil Nadu / Puducherry':'Tamil Nadu'; if(p>=67&&p<=69)return'Kerala'; if(p>=70&&p<=74)return'West Bengal'; if(p>=75&&p<=77)return'Odisha';
  if(p===78)return'Assam'; if(p===79)return'North East'; if(p>=80&&p<=85)return p>=82&&p<=83||p3>=814&&p3<=835?'Jharkhand':'Bihar'; return null; }
const CITY_STATE={AHMEDABAD:'Gujarat',SURAT:'Gujarat',VADODARA:'Gujarat',RAJKOT:'Gujarat',BHAVNAGAR:'Gujarat',GANDHIDHAM:'Gujarat',MUNDRA:'Gujarat',KUTCH:'Gujarat',MUMBAI:'Maharashtra',PUNE:'Maharashtra',THANE:'Maharashtra',NAGPUR:'Maharashtra',LUDHIANA:'Punjab',MANDI:'Punjab',DELHI:'Delhi',CHENNAI:'Tamil Nadu',KOLKATA:'West Bengal',HOWRAH:'West Bengal',RAIPUR:'Chhattisgarh',INDORE:'Madhya Pradesh',JAIPUR:'Rajasthan',HYDERABAD:'Telangana',BANGALORE:'Karnataka',BENGALURU:'Karnataka',KANPUR:'Uttar Pradesh',GHAZIABAD:'Uttar Pradesh',FARIDABAD:'Haryana',GURGAON:'Haryana',GURUGRAM:'Haryana'};
const STATES=['GUJARAT','MAHARASHTRA','PUNJAB','DELHI','TAMIL NADU','WEST BENGAL','CHHATTISGARH','MADHYA PRADESH','RAJASTHAN','TELANGANA','KARNATAKA','UTTAR PRADESH','HARYANA','KERALA','ODISHA','ANDHRA PRADESH','BIHAR','JHARKHAND','GOA','UTTARAKHAND','HIMACHAL PRADESH','ASSAM'];
const titleCase=s=>s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

/* ---------- ISO 6346 ---------- */
const ISO=(()=>{const v={};let n=10;for(const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){if(n%11===0)n++;v[c]=n++;}return v;})();
const isoDigit=s=>{let t=0;for(let i=0;i<10;i++){const ch=s[i];t+=(/\d/.test(ch)?+ch:ISO[ch])*2**i;}return t%11%10;};
const isoValid=c=>/^[A-Z]{4}\d{7}$/.test(c)&&isoDigit(c)===+c[10];

/* ---------- helpers for layout text ---------- */
const chunks = line => { const out=[]; const re=/\S+(?: \S+)*/g; let m; while((m=re.exec(line))) out.push({s:m[0],i:m.index}); return out; }; // split on 2+ spaces
function valueUnder(lines, li, labelIdx){ for(let k=li+1;k<Math.min(lines.length,li+4);k++){ const cs=chunks(lines[k]); if(!cs.length) continue;
  let best=null,bd=1e9; for(const c of cs){ const d=Math.abs(c.i-labelIdx); if(d<bd){bd=d;best=c;} } if(best&&bd<=30) return best.s; } return null; }
function blockAfter(lines, labelRe, stopRe, maxLines=7){
  const i=lines.findIndex(l=>labelRe.test((chunks(l)[0]||{}).s||'')); if(i<0) return '';
  const first=chunks(lines[i]); const rest=(first[0].s.replace(labelRe,'').replace(/^[\s:(complete name and address)]*$/i,'').trim());
  const out=[]; if(rest && !/complete name/i.test(rest) && !/^[,:]/.test(rest)) out.push(rest.replace(/^\(.*?\)\s*/,''));
  const limit = first[0].i + 60;
  for(let k=i+1;k<lines.length && out.length<maxLines;k++){ const cs=chunks(lines[k]); if(!cs.length){ if(out.length) { if(k+1<lines.length && chunks(lines[k+1]).length && !stopRe.test(chunks(lines[k+1])[0].s)) continue; break; } else continue; }
    const c=cs[0]; if(c.i>limit) continue; if(stopRe.test(c.s)) break; out.push(c.s); }
  return out.join('\n');
}

/* ============ CONTRACT ============ */
const FIELD_LABELS=[['grade',/^MATERIAL GRADE$|^MATERIAL$|^GRADE$/],['quantity',/^QUANTITY$/],['quality',/^QUALITY$/],['origin',/^ORIGIN$/],['price',/^PRICE$|^RATE$/],['loading',/^AVERAGE LOADING$/],['packing',/^PACKING$/],['shipment',/^SHIPMENT$/],['payment',/^PAYMENT( TERMS)?$/],['value',/^VALUE$|^AMOUNT$/],['hs',/^H\.? ?S\.? ?CODE$/]];
function parseContract(text){
  const t=text.replace(/\r/g,''), U=up(t), lines=t.split('\n');
  const c={raw:t};
  c.kind = /PURCHASE CONTRACT/.test(U)?'purchase':/SALES? CONTRACT/.test(U)?'sales':null;
  c.no = (U.match(/CONTRACT\s*NO\.?\s*:?\s*([A-Z0-9][A-Z0-9\/\-]+)/)||[])[1]||null;
  c.date = (U.match(/\bDATE\s*:?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/)||[])[1]||null;
  // letterhead: lines above the title
  const ti=lines.findIndex(l=>/(PURCHASE|SALES?) CONTRACT/i.test(l));
  const head=lines.slice(0,Math.max(0,ti)).map(l=>l.trim()).filter(Boolean);
  c.letterhead = head.length? head[0] : null;
  // parties: header line with SELLER: and BUYER:
  const pi=lines.findIndex(l=>/SELLER\s*:/i.test(l)&&/BUYER\s*:/i.test(l));
  c.seller={name:'',addr:[]}; c.buyer={name:'',addr:[]};
  if(pi>=0){ const L=lines[pi], si=L.search(/SELLER\s*:/i), bi=L.search(/BUYER\s*:/i); const split=Math.max(si,bi); const leftIs = si<bi?'seller':'buyer', rightIs = leftIs==='seller'?'buyer':'seller';
    const col={seller:[],buyer:[]};
    for(let k=pi+1;k<lines.length;k++){ const l=lines[k]; if(/WE HEREBY|^\s*(MATERIAL|QUANTITY)/i.test(l)) break; if(!l.trim()) continue;
      const left=l.slice(0,split-2).trim(), right=l.slice(split-2).trim();
      if(left && !/^OUR REF/i.test(left)) col[leftIs].push(left); if(right && !/^OUR REF/i.test(right)) col[rightIs].push(right); else if(/OUR REF/i.test(l)) c.ourRef=l.replace(/.*OUR REF\s*[-:]?\s*/i,'').trim(); }
    for(const k of ['seller','buyer']){ c[k].name=col[k][0]||''; c[k].addr=col[k].slice(1); } }
  else { // stacked layout: "SELLER: NAME" then address lines, then "BUYER: NAME" then address lines
    for(const k of ['seller','buyer']){ const re=new RegExp('^\\s*'+k+'\\s*:\\s*(.*)$','i'); const i=lines.findIndex(l=>re.test(l)); if(i<0) continue;
      c[k].name=lines[i].match(re)[1].trim();
      for(let j=i+1;j<lines.length&&j<i+5;j++){ const l=lines[j].trim(); if(!l) continue; if(/^(SELLER|BUYER)\s*:|WE HEREBY|^(MATERIAL|QUANTITY)/i.test(l)) break; c[k].addr.push(l); } } }
  // field table: LABEL   value
  c.f={};
  for(const l of lines){ const cs=chunks(l); if(cs.length<2) continue; const lab=up(cs[0].s).replace(/\s+/g,' ').trim();
    for(const [k,re] of FIELD_LABELS) if(re.test(lab) && !c.f[k]){ c.f[k]=cs.slice(1).map(x=>x.s).join(' '); } }
  // continuation line for quality etc. (line with only a value chunk indented)
  for(let k=0;k<lines.length;k++){ const cs=chunks(lines[k]); if(cs.length===2 && up(cs[0].s)==='QUALITY'){ const nx=chunks(lines[k+1]||''); const nx2=chunks(lines[k+2]||''); const cont = nx.length===1&&nx[0].i>20?nx[0].s:(nx.length===0&&nx2.length===1&&nx2[0].i>20?nx2[0].s:''); if(cont) c.f.quality+=' '+cont; } }
  const q=up(c.f.quantity), p=up(c.f.price), v=up(c.f.value);
  c.qty = num((q.match(/([\d,]+(?:\.\d+)?)\s*(?:MT|M\.T|TONS?|TONNES?)/)||[])[1]);
  c.containers = num((q.match(/(\d+)\s*X\s*(?:20|40)/)||[])[1]);
  c.boxSize = (q.match(/X\s*(20|40)/)||[])[1]||null;
  c.tolPct = num((q.match(/(?:\+\/-|±|\+-|PLUS\/MINUS)\s*(\d+(?:\.\d+)?)\s*%/)||[])[1]);
  c.currency = (p.match(/\b(USD|EUR|AED|SGD|US\$)\b/)||[])[1]||(p.includes('$')?'USD':null);
  c.rate = num((p.match(/(?:USD|EUR|AED|SGD|US\$|\$)\s*([\d,]+(?:\.\d+)?)/)||[])[1]);
  c.rateUnit = /PER\s*M\.?T|\/\s*M\.?T|\bPMT\b|PER\s*TON/.test(p)?'per MT':/PER\s*LOT|LUMPSUM|LUMP SUM/.test(p)?'lot':null;
  const im=p.match(new RegExp('\\b('+INCOTERMS.map(x=>x.replace('&','\\&')).join('|')+')\\b\\s*(.*)$'));
  c.incoterm = im? im[1].replace(/CNF|C&F/,'CFR'):null; c.incotermRaw = im?im[1]:null; c.port = im? im[2].replace(/[.,]\s*$/,'').trim():null;
  c.value = num((v.match(/(?:USD|EUR|AED|SGD|US\$|\$)\s*([\d,]+(?:\.\d+)?)/)||[])[1]);
  c.loadingMT = num((up(c.f.loading).match(/([\d.]+)\s*MT/)||[])[1]);
  c.payPcts = (up(c.f.payment).match(/(\d+(?:\.\d+)?)\s*%/g)||[]).map(x=>parseFloat(x));
  c.weightTolPct = num((U.match(/WEIGHT TOLERANCE[^.\d]*?(\d+(?:\.\d+)?)\s*%/)||[])[1]);
  c.freeDays = num((U.match(/(\d+)\s*DAYS FREE TIME|FREE TIME[^.]*?(\d+)\s*DAYS/)||[]).slice(1).find(Boolean));
  c.claimDays = num((U.match(/WITHIN\s*(\d+)\s*DAYS FROM THE RECEIPT/)||[])[1]);
  c.clauses = {
    documents:/DOCUMENT(ATION|S)\s*:|FOLLOWING DOCUMENTS|BILL OF LADING/.test(U),
    hazard:/ARMS|AMMUNITION|EXPLOSIVE|RADIO ?ACTIVE/.test(U),
    forceMajeure:/FORCE MAJEURE/.test(U), arbitration:/ARBITRATION|GOVERNED/.test(U),
    qualityQuantity:/QUALITY\s*&\s*QUANTITY|INSPECTOR|SURVEYOR/.test(U),
    deadFreight:/DEAD FREIGHT/.test(U), freeTime:/FREE TIME/.test(U), signBy:/DULY SIGNED/.test(U),
  };
  c.counterparty = c.kind==='purchase'? c.seller : c.kind==='sales'? c.buyer : null;
  c.ourEntity = c.kind==='purchase'? c.buyer : c.kind==='sales'? c.seller : null;
  return c;
}
function checkContract(c, others=[]){
  const R=[]; const add=(st,t,d,fix)=>R.push({st,t,d,fix});
  const cur=c.currency||'USD';
  // value arithmetic
  if(c.qty!=null && c.rate!=null && c.value!=null){
    const calc=c.qty*c.rate, diff=c.value-calc, pct=Math.abs(diff)/Math.max(1,c.value);
    if(pct<=0.005) add('pass','Value = quantity × rate',`${fmt(c.qty,3)} MT × ${cur} ${fmt(c.rate)} = ${cur} ${fmt(calc)}. Matches.`);
    else add('fail','Value does not equal quantity × rate',`${fmt(c.qty,3)} MT × ${cur} ${fmt(c.rate)} = ${cur} ${fmt(calc)}, but the contract says ${cur} ${fmt(c.value)} (difference ${cur} ${fmt(diff)}). The value implies ${cur} ${fmt(c.value/c.qty)} per MT.`,`Correct either the rate or the value so that quantity × rate = value.`);
  } else add('warn','Could not check the value',`Missing ${[c.qty==null&&'quantity',c.rate==null&&'rate',c.value==null&&'value'].filter(Boolean).join(', ')}.`);
  if(c.rate!=null && !c.rateUnit) add('warn','Rate unit not stated',`Price line reads "${c.f.price}". It does not say per MT, so it can be argued as a lump sum.`,'Write the price as "USD xxx PER MT CFR <port>".');
  if(c.incotermRaw && /CNF|C&F/.test(c.incotermRaw)) add('warn','"CNF" used instead of "CFR"','Incoterms 2020 name is CFR. Banks and buyers usually accept CNF, but LCs are checked word for word.','Use CFR (Incoterms 2020).');
  if(!c.incoterm) add('fail','No Incoterm in the price','Price must name the delivery term (CFR, CIF, FOB…) and the port.','Add the Incoterm and named port to the price line.');
  else if(!c.port) add('warn','No named port after the Incoterm','');
  else add('pass','Price term',`${c.incoterm} ${c.port}`);
  // loading
  if(c.containers && c.loadingMT && c.qty){ const exp=c.containers*c.loadingMT, d=Math.abs(exp-c.qty)/c.qty;
    d<=0.05? add('pass','Containers × average loading fits quantity',`${c.containers} × ${c.loadingMT} MT = ${fmt(exp,1)} MT vs ${fmt(c.qty,2)} MT.`)
    : add('warn','Containers × average loading does not fit quantity',`${c.containers} × ${c.loadingMT} MT = ${fmt(exp,1)} MT, but quantity is ${fmt(c.qty,2)} MT (${(d*100).toFixed(1)}% apart).`,'Check the number of containers or the average loading.'); }
  if(c.containers && c.qty && !c.loadingMT){ const per=c.qty/c.containers; (per>28||per<15)?add('warn','Unusual load per container',`${fmt(per,1)} MT per ${c.boxSize||20}' box.`):0; }
  // tolerance
  if(c.tolPct==null) add('warn','No quantity tolerance','Without "+/- x%" the exact quantity is binding.','Add a quantity tolerance, e.g. (+/- 10%) at seller\'s option.');
  else add('pass','Quantity tolerance',`±${c.tolPct}%${c.weightTolPct!=null?`; weight-claim tolerance ${c.weightTolPct}%`:''}`);
  // payment
  if(c.payPcts.length){ const s=c.payPcts.reduce((a,b)=>a+b,0); s===100?add('pass','Payment terms add up to 100%',c.f.payment):add('fail','Payment percentages do not add up',`${c.f.payment}: ${c.payPcts.join(' + ')} = ${s}%.`,'Make the payment percentages total 100%.'); }
  else if(c.f.payment) add('pass','Payment terms',c.f.payment); else add('fail','No payment terms','');
  // HS
  const g=gradeOf((c.f.grade||'')+' '+(c.f.quality||''));
  if(c.f.hs){ if(g){ hsFits(c.f.hs,g)?add('pass','HS code fits the material',`${c.f.hs} for ${g.name}.`):add('warn','HS code may not fit the material',`${c.f.hs} given for ${c.f.grade}. ${g.name} is usually ${g.hs.join(' or ')}.`,`Confirm the HS code (usually ${g.hs.join(' or ')} for ${g.name}).`);} else add('pass','HS code stated',c.f.hs); }
  else if(c.kind==='sales') add('warn','No HS code','Buyers need it for the import declaration.', g?`Add the HS code (usually ${g.hs.join(' or ')}).`:'Add the HS code.');
  // parties
  if(c.seller.name && c.buyer.name && N(c.seller.name)===N(c.buyer.name)) add('fail','Seller and buyer are the same','');
  if(c.counterparty && !c.counterparty.addr.length) add('warn','Counterparty address missing','');
  // cross contract address duplicates
  const addrKey=p=>N(p.addr.join(' '));
  if(c.counterparty && c.counterparty.addr.length){ const k=addrKey(c.counterparty);
    for(const o of others){ if(o===c) continue; for(const p of [o.seller,o.buyer]){ if(p && p.addr.length && addrKey(p)===k && N(p.name)!==N(c.counterparty.name))
      add('fail','Address copied from another party',`${c.counterparty.name}'s address is identical to ${p.name}'s on contract ${o.no||'(unnumbered)'}: "${c.counterparty.addr.join(', ').replace(/,\s*,/g,',')}".`,`Confirm ${c.counterparty.name}'s correct address.`); } } }
  // clauses
  const want = c.kind==='sales'? ['documents','hazard','forceMajeure','arbitration','qualityQuantity','freeTime'] : ['documents','hazard','forceMajeure','arbitration','qualityQuantity','deadFreight'];
  const NAMES={documents:'Documents list',hazard:'No arms / explosives / radioactive clause',forceMajeure:'Force majeure',arbitration:'Arbitration / governing law',qualityQuantity:'Quality & quantity (inspection)',deadFreight:'Dead freight',freeTime:'Free time at destination'};
  const miss=want.filter(k=>!c.clauses[k]);
  miss.length? add(miss.includes('documents')||miss.includes('hazard')?'warn':'warn','Missing clauses',miss.map(k=>NAMES[k]).join(', ')+'.', miss.includes('documents')&&c.kind==='purchase'?'Add a documents clause so the supplier must send BL, invoice, packing/weight list, certificate of origin and loading photos.':'Add: '+miss.map(k=>NAMES[k]).join(', ')+'.')
    : add('pass','Standard clauses present',want.map(k=>NAMES[k]).join(', '));
  if(!c.f.shipment) add('warn','No shipment period','');
  if(!c.no) add('warn','No contract number','');
  return R;
}

/* ============ BL / WAYBILL ============ */
function parseBL(text){
  const t=text.replace(/\r/g,''), U=up(t), lines=t.split('\n');
  const b={raw:t};
  const cut=U.search(/ADDITIONAL CLAUSES|RECEIVED BY THE CARRIER|1\.\s*DEFINITION|CLAUSE PARAMOUNT|TERMS AND CONDITIONS OF THE CONTRACT/); const H = cut>0? U.slice(0,cut) : U; b.head=H;
  b.waybill = /SEA\s*WAYBILL|\bWAYBILL\b|NON[- ]?NEGOTIABLE/.test(U) && !/ORIGINAL BILL OF LADING/.test(U);
  b.carrier = (H.match(/\b(CMA CGM|MAERSK|MSC|HAPAG|HMM|EVERGREEN|COSCO|OCEAN NETWORK EXPRESS|YANG MING|ZIM|OOCL|PIL|WAN HAI|ESL|EMIRATES SHIPPING)\b/)||[])[1]||null;
  b.blno = null; for(let i=0;i<lines.length&&!b.blno;i++){ const L=up(lines[i]); const m=L.search(/WAYBILL NUMBER|B\/L NO|BL NO\.|BILL OF LADING NO/); if(m>=0){ const v=valueUnder(lines,i,m); if(v&&/\d{5,}/.test(v)) b.blno=v.split(/\s+/).pop(); } }
  const stop=/^(CONSIGNEE|NOTIFY|PRE[- ]?CARRIAGE|VESSEL|OCEAN VESSEL|PLACE OF|PORT OF|MARKS|CONTAINER|EXPORT|FORWARDING|ALSO NOTIFY|POINT AND|ONWARD)/i;
  b.shipper = blockAfter(lines,/^SHIPPER(\/EXPORTER)?(\s*\(.*)?$/i,stop);
  b.consignee = blockAfter(lines,/^CONSIGNEE(\s*\(.*)?$/i,stop);
  b.notify = blockAfter(lines,/^NOTIFY PARTY.*$/i,stop);
  // ports via label alignment
  for(let i=0;i<lines.length;i++){ const L=up(lines[i]);
    const grab=(re,key)=>{ const m=L.search(re); if(m>=0 && !b[key]){ const v=valueUnder(lines,i,m); if(v && v.length<60 && !/^(PORT|PLACE|VESSEL)/i.test(v)) b[key]=v; } };
    grab(/PORT OF LOADING/,'pol'); grab(/PORT OF DISCHARGE/,'pod'); grab(/(FINAL )?PLACE OF DELIVERY/,'delivery'); grab(/OCEAN VESSEL|^\s*VESSEL\b/,'vessel'); }
  if(!b.pol||!b.pod){ const found=[]; PORTS.forEach(p=>{const re=new RegExp('(^|[^/A-Z])'+p+'\\b'); const m=H.match(re); if(m) found.push([m.index,p]);}); found.sort((a,c)=>a[0]-c[0]); if(!b.pol&&found[0]) b.pol=found[0][1]; if(!b.pod&&found.length>1) b.pod=found[found.length-1][1]; }
  // containers + per-container weights
  b.containers=[]; const seen=new Set();
  for(const l of lines){ if(/BOOKING|B\/L NO|WAYBILL NUMBER/i.test(l)) continue; const m=up(l).match(/\b([A-Z]{4}\d{7})\b/); if(!m||seen.has(m[1])||!/U$|J$|Z$/.test(m[1].slice(3,4))) continue; seen.add(m[1]);
    const after=up(l).slice(up(l).indexOf(m[1])+11); const nums=(after.match(/\b\d{1,3}(?:,\d{3})*\.\d{1,3}\b|\b\d{4,6}(?:\.\d{1,3})?\b/g)||[]).map(x=>+x.replace(/,/g,''));
    const w=(after.match(/WEIGHT\s*:?\s*([\d.,]+)\s*MT/)||[])[1]; b.containers.push({no:m[1],kg: w? +w.replace(/,/g,'')*1000 : (nums.find(n=>n>=1000&&n<=40000)??null)}); }
  b.statedCount = num((U.match(/TOTAL\s*:?\s*(\d+)\s*CONTAINER/)||U.match(/\((\d+)\)\s*CONTAINER/)||U.match(/\b(\d+)\s*X\s*20'?\s*(?:DC|GP|ST|FT)?\s*CONTAINER/)||[])[1]);
  b.netMT = (()=>{ const m=U.match(/TOTAL NET WEIGHT\s*:?\s*([\d,]+\.?\d*)\s*(MT|KGS?)/)||U.match(/NET WEIGHT\s*:?\s*([\d,]+\.?\d*)\s*(MT|KGS?)/); if(m){const n=num(m[1]);return m[2]==='MT'?n:n/1000;}
    const w=U.match(/WEIGHT\s*:\s*([\d,]+\.?\d*)\s*MT/); return w?num(w[1]):null; })();
  b.grossKg = num((U.match(/TOTAL[^\n]*?CONTAINER\(S\)[^\n]*?([\d,]{4,}\.\d{3})/)||U.match(/\b([\d,]{4,}\.\d{3})\s*\n?\s*KGS\b/)||[])[1]);
  b.hs = (U.match(/H\.?\s?S\.?\s*CODE\s*[:\-]?\s*([\d.]{4,12})/)||[])[1]||null;
  b.grade = null;
  b.freight = /FREIGHT\s+PREPAID|\bPREPAID\b/.test(H)?'PREPAID':/FREIGHT\s+COLLECT|=\s*COLLECT/.test(H)?'COLLECT':(H.match(/FREIGHT TO BE PAID AT[^\n]*\n[^\n]*?([A-Z][A-Z ]+OFFICE|[A-Z]{4,}[A-Z ]*)/)?'payable at '+titleCase((H.match(/FREIGHT TO BE PAID AT[^\n]*\n\s*(?:\S+(?: \S+)*\s{2,})?([A-Z][A-Z ]+?OFFICE|[A-Z][A-Z ]+?)(?:\s{2,}|$)/m)||[])[1]||'see document'):null);
  b.freeDays = num((U.match(/(\d+)\s*DAYS FREE/)||U.match(/FREE TIME[^\n]*?(\d+)\s*DAYS/)||[])[1]);
  b.originals = (()=>{ const i=U.search(/NUMBER OF ORIGINAL|NO\.? OF ORIGINAL/); if(i<0) return null; const win=U.slice(i,i+900); const m=win.slice(20).match(/\b(ZERO|NIL|NONE|ONE|TWO|THREE)\b|\((\d)\)/); if(!m) return null; return m[2]!=null?+m[2]:{ZERO:0,NIL:0,NONE:0,ONE:1,TWO:2,THREE:3}[m[1]]; })();
  b.onBoard = (U.match(/SHIPPED ON BOARD[^\n]*?(\d{2}[-\s][A-Z]{3}[-\s]\d{4})/)||U.match(/ON BOARD DATE[\s\S]{0,400}?([A-Z]{3}\.?\s?\d{1,2},\s?\d{4})/)||[])[1]||null;
  // India IDs (consignee block first, else whole doc)
  const idText = up(b.consignee+'\n'+b.notify) || U;
  const ids = s => ({ gst:[...new Set((s.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g)||[]))],
    pan:[...new Set([...s.matchAll(/PAN\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*\n?\s*(?:[A-Z]+\s*NO\.?\s*)?([A-Z]{5}\d{4}[A-Z])/g)].map(m=>m[1]))],
    iec:[...new Set([...s.matchAll(/IEC\s*(?:NO\.?|CODE)?\s*[:\-]?\s*([A-Z0-9]{10})\b/g)].map(m=>m[1]))] });
  b.ids = ids(U);
  // PAN value may sit on the next line after "PAN NO." when the line wraps
  if(!b.ids.pan.length){ const m=U.match(/PAN\s*NO\.?\s*\n\s*([A-Z]{5}\d{4}[A-Z])/); if(m) b.ids.pan=[m[1]]; }
  b.pins = [...U.matchAll(new RegExp('('+STATES.join('|')+'|'+Object.keys(CITY_STATE).join('|')+')\\s*[-,]?\\s*(\\d{6})\\b','g'))].map(m=>({place:m[1],pin:m[2]}));
  if(!b.pins.length){ const m=up(b.consignee).match(/\b([1-9]\d{5})\b/); if(m) b.pins=[{place:null,pin:m[1]}]; }
  b.consigneeCity = Object.keys(CITY_STATE).find(c=>up(b.consignee).includes(c))||null;
  b.consigneeStateWord = STATES.find(s=>up(b.consignee).includes(s))||null;
  b.toIndia = /INDIA/.test(up(b.pod+' '+b.delivery+' '+b.consignee)) || /MUNDRA|NHAVA|KANDLA|CHENNAI|KOLKATA|PIPAVAV|HAZIRA/.test(up(b.pod));
  return b;
}
function checkBL(b, c){
  const R=[]; const add=(st,t,d,fix)=>R.push({st,t,d,fix});
  // document type
  if(b.waybill){ const pay=c?up(c.f.payment):''; 
    if(c && /CAD|AGAINST.*DOC|\bDP\b|\bLC\b|L\/C|COPY DOCS/.test(pay)) add('warn','Sea waybill on a documents-against-payment deal',`This is a non-negotiable waybill${b.originals===0?' with zero originals':''}: the carrier releases cargo to the named consignee without any original document. Contract payment is "${c.f.payment}", so holding documents gives no control over the cargo.`,`Confirm payment is received before release, or ask for a negotiable "To Order" BL with 3/3 originals.`);
    else add('pass','Document type',`Sea waybill${b.carrier?' ('+b.carrier+')':''}${b.originals===0?', no originals':''}. Cargo goes to the named consignee on arrival.`); }
  else add('pass','Document type',`Bill of lading${b.originals!=null?`, ${b.originals} original(s)`:''}.`);
  // containers
  const L=b.containers.length;
  if(!L) add('warn','No container numbers found','');
  else { const bad=b.containers.filter(x=>!isoValid(x.no));
    bad.length? add('fail','Container number fails ISO 6346 check digit',bad.map(x=>`${x.no} (check digit should be ${isoDigit(x.no)})`).join(', '),`Container no. ${bad.map(x=>x.no).join(', ')}: please re-check, the check digit is invalid.`)
      : add('pass','Container numbers valid',`All ${L} pass the ISO 6346 check digit: ${b.containers.map(x=>x.no).join(', ')}.`); }
  const stated=b.statedCount; const expected=c&&c.containers;
  if(L){ if(stated!=null && stated!==L) add('fail','Container count does not add up',`Document states ${stated}, but ${L} container numbers are listed.`,`Container count: ${stated} stated vs ${L} listed.`);
    else if(expected && expected!==L) { const tol=c.tolPct||0; add(Math.abs(expected-L)/expected<=tol/100?'warn':'fail','Containers differ from contract',`Contract ${c.no||''}: ${expected} x ${c.boxSize||20}'. Document: ${L}.`, `Containers: ${L} on the BL vs ${expected} in the contract.`); }
    else add('pass','Container count',`${L} container${L>1?'s':''}${stated?' (matches stated total)':''}.`); }
  // weights
  const ws=b.containers.map(x=>x.kg).filter(x=>x!=null);
  if(ws.length===L && L>1){ const sum=ws.reduce((a,x)=>a+x,0); const tot=b.netMT!=null?b.netMT*1000:b.grossKg;
    if(tot) Math.abs(sum-tot)<=1? add('pass','Container weights add up',`Sum of ${L} containers = ${fmt(sum,0)} kg = stated total.`) : add('fail','Container weights do not add up',`Per-container weights sum to ${fmt(sum,0)} kg; total stated ${fmt(tot,0)} kg.`,'Weights: per-container figures do not add up to the total. Please correct.');
    const heavy=b.containers.filter(x=>x.kg>28500); if(heavy.length) add('warn','Container over typical 20\' payload',heavy.map(x=>`${x.no}: ${fmt(x.kg,0)} kg`).join(', ')+'. Check the carrier\'s weight limit.'); }
  if(b.netMT!=null){ if(c&&c.qty){ const tol=(c.tolPct??0)/100, lo=c.qty*(1-tol), hi=c.qty*(1+tol);
      (b.netMT>=lo-1e-9&&b.netMT<=hi+1e-9)? add('pass','Weight within contract tolerance',`${fmt(b.netMT,3)} MT vs ${fmt(c.qty,2)} MT ±${c.tolPct??0}%.`) : add('fail','Weight outside contract tolerance',`${fmt(b.netMT,3)} MT vs allowed ${fmt(lo,2)}–${fmt(hi,2)} MT.`,`Net weight ${fmt(b.netMT,3)} MT is outside the contract quantity ${fmt(c.qty,2)} MT ±${c.tolPct??0}%.`); }
    else add('pass','Net weight',`${fmt(b.netMT,3)} MT.`); }
  else add('warn','Net weight not found','');
  // HS
  const cands=GRADES.filter(x=>x.re.test(b.head||b.raw)); const g = (b.hs && cands.find(x=>hsFits(b.hs,x))) || cands[0] || null; b.grade=g?g.name:null;
  if(b.hs){ g? (hsFits(b.hs,g)?add('pass','HS code fits the goods',`${b.hs} for ${g.name}.`):add('warn','HS code may not fit the goods',`${b.hs} on the document; ${g.name} is usually ${g.hs.join(' or ')}.`,`HS code: please confirm ${b.hs} (usually ${g.hs.join(' or ')} for ${g.name}).`)) : add('pass','HS code',b.hs);
    if(c&&c.f.hs&&N(c.f.hs).slice(0,6)!==N(b.hs).slice(0,6)) add('fail','HS code differs from contract',`Document ${b.hs}; contract ${c.f.hs}.`,`HS code: change ${b.hs} to ${c.f.hs} as per contract.`); }
  else add('warn','No HS code on the document','Most importing countries need it for the declaration.','Please add the HS code to the description.');
  // ports
  b.pol? add('pass','Port of loading',titleCase(b.pol)) : add('warn','Port of loading not found','');
  if(b.pod){ if(c&&c.port){ const ok=N(c.port).includes(N(b.pod).replace(/INDIA|PAKISTAN/g,'').slice(0,6))||N(b.pod).includes(N(c.port).replace(/INDIA|PAKISTAN/g,'').slice(0,6));
      ok? add('pass','Port of discharge matches contract',titleCase(b.pod)) : add('fail','Port of discharge differs from contract',`Document: ${b.pod}. Contract: ${c.port}.`,`Port of discharge: change ${up(b.pod)} to ${up(c.port)} as per contract.`); }
    else add('pass','Port of discharge',titleCase(b.pod)); } else add('warn','Port of discharge not found','');
  // freight
  if(c&&c.incoterm){ const pre=/CFR|CIF|CPT|CIP|DAP|DDP|DPU/.test(c.incoterm);
    if(b.freight==='PREPAID'||b.freight==='COLLECT') (pre===(b.freight==='PREPAID'))?add('pass','Freight term matches Incoterm',`${b.freight} under ${c.incoterm}.`):add('fail','Freight term contradicts Incoterm',`Document ${b.freight}; under ${c.incoterm} it should be ${pre?'PREPAID':'COLLECT'}.`,`Freight: change to FREIGHT ${pre?'PREPAID':'COLLECT'}.`);
    else add('warn','Freight term not clear',`Document says: ${b.freight||'nothing found'}. Under ${c.incoterm} it should read FREIGHT ${pre?'PREPAID':'COLLECT'}.`, `Please show FREIGHT ${pre?'PREPAID':'COLLECT'} on the document.`); }
  else if(b.freight) add('pass','Freight',b.freight);
  // free time vs contract
  if(c&&c.freeDays&&b.freeDays!=null&&b.freeDays<c.freeDays) add('fail','Free time shorter than contract',`Document gives ${b.freeDays} days free at destination; sales contract promises minimum ${c.freeDays} days.`,`Free time: please extend to ${c.freeDays} days at destination as per contract.`);
  else if(b.freeDays!=null) add('pass','Free time at destination',`${b.freeDays} days${c&&c.freeDays?` (contract minimum ${c.freeDays})`:''}.`);
  if(/SHIPPING|LOGISTIC|\bLINES?\b|FREIGHT|FORWARD|CARGO|AGENC/i.test((b.consignee.split('\n')[0]||''))) add('pass','Consignee is a shipping agent / forwarder',`${(b.consignee.split('\n')[0]||'').trim()} receives the cargo. Normal for nominated or switch deliveries; make sure they release only on our instruction.`);
  // consignee vs notify
  const cn=(b.consignee.split('\n')[0]||''), nn=(b.notify.split('\n')[0]||'');
  if(cn&&nn&&!/SAME AS CONSIGNEE/i.test(nn)){ if(N(cn)===N(nn)&&cn.replace(/\s+/g,' ').trim()!==nn.replace(/\s+/g,' ').trim()) add('warn','Consignee and notify spelt differently',`Consignee "${cn.trim()}" vs notify "${nn.trim()}".`,`Notify party: correct the spelling to "${cn.trim()}".`); }
  // India
  if(b.toIndia || b.ids.gst.length || b.ids.iec.length){
    const gst=b.ids.gst[0], pans=[...b.ids.pan,...b.ids.iec.filter(x=>/^[A-Z]{5}\d{4}[A-Z]$/.test(x))];
    if(!gst && b.toIndia) add('warn','No GSTIN for the Indian consignee','Indian customs needs the importer\'s IEC and GSTIN on the BL.','Please add consignee IEC and GSTIN.');
    if(!b.ids.iec.length && b.toIndia) add('warn','No IEC for the Indian consignee','','Please add the consignee\'s IEC number.');
    if(gst){ const ck=gstinCheck(gst); ck===gst[14]? add('pass','GSTIN format and check digit',gst) : add('fail','GSTIN check digit invalid',`${gst}: last character should be ${ck}. The number is mistyped.`,`GSTIN ${gst} has an invalid check digit. Please confirm the consignee's GSTIN.`);
      const gp=gst.slice(2,12); const other=[...new Set(pans)].filter(p=>p!==gp);
      if(pans.length && other.length) add('fail','GSTIN does not match PAN / IEC',`GSTIN contains PAN ${gp}, but the document shows ${[...new Set(pans)].join(' / ')}. Customs matches these; a mismatch holds the Bill of Entry.`,`Consignee IDs: GSTIN ${gst} (PAN ${gp}) does not match PAN/IEC ${other.join(' / ')}. Please confirm the correct numbers.`);
      else if(pans.length) add('pass','GSTIN matches PAN / IEC',gp);
      const gs=GST_STATE[gst.slice(0,2)]; const pinS=b.pins[0]?pinState(b.pins[0].pin):null; const wordS=b.consigneeStateWord?titleCase(b.consigneeStateWord):b.consigneeCity?CITY_STATE[b.consigneeCity]:null;
      if(b.pins[0] && pinS && wordS && !pinS.includes(wordS)) add('fail','PIN code does not match the state',`PIN ${b.pins[0].pin} belongs to ${pinS}, but the address says ${wordS}.`,`Consignee address: PIN ${b.pins[0].pin} is a ${pinS} code; please correct the PIN for ${wordS}.`);
      else if(b.pins[0]&&pinS) add('pass','PIN code',`${b.pins[0].pin} (${pinS}).`);
      if(gs && wordS && !gs.includes(wordS)) add('fail','GSTIN state differs from address',`GSTIN state code ${gst.slice(0,2)} is ${gs}; address is in ${wordS}.`,`GSTIN state code ${gst.slice(0,2)} (${gs}) does not match the address state ${wordS}.`);
    }
  }
  if(!b.onBoard) add('warn','No shipped-on-board date found','Normal on a draft; the final document needs one.');
  return R;
}
return {layoutFromItems,parseContract,checkContract,parseBL,checkBL,gstinCheck,isoValid,isoDigit,pinState,fmt,up,N,gradeOf,GRADES};
})();
if(typeof module!=='undefined') module.exports=DC;
