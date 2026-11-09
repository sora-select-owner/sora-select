/* SORA SELECT ZIP importer core. No remote network access or ZIP dependency. */
(function(root){'use strict';
 const decoder=new TextDecoder('utf-8');
 const LIMITS={zip:160*1024*1024,entries:180,entry:15*1024*1024,total:130*1024*1024};
 function fail(s){throw Error(s)}
 function pathOk(s){return !!s&&!s.startsWith('/')&&!s.includes('\\')&&!s.split('/').includes('..')&&!s.includes('\0')}
 async function readZip(file){
  if(file.size>LIMITS.zip)fail('ZIP 文件超过 160MB，请分批导出');
  const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);
  const u16=p=>v.getUint16(p,true),u32=p=>v.getUint32(p,true);
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(i)===0x06054b50){end=i;break}}
  if(end<0)fail('找不到 ZIP 目录，文件可能损坏');
  const count=u16(end+10),dirSize=u32(end+12),dirOffset=u32(end+16);
  if(count>LIMITS.entries||count===0)fail('ZIP 文件数量不符合限制（1～180）');
  if(dirOffset+dirSize>bytes.length)fail('ZIP 目录越界');
  const entries=new Map();let cursor=dirOffset,total=0;
  for(let i=0;i<count;i++){
   if(cursor+46>bytes.length||u32(cursor)!==0x02014b50)fail('ZIP 中央目录损坏');
   const flags=u16(cursor+8),method=u16(cursor+10),compressed=u32(cursor+20),size=u32(cursor+24);
   const nameLen=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32),offset=u32(cursor+42);
   if(cursor+46+nameLen+extra+comment>bytes.length)fail('ZIP 文件名越界');
   const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLen));
   cursor+=46+nameLen+extra+comment;
   if(!pathOk(name)||name.endsWith('/'))continue;
   if(flags&1)fail('不支持加密 ZIP');
   if(method!==0&&method!==8)fail('不支持 ZIP 压缩格式 '+method);
   if(size>LIMITS.entry||compressed>LIMITS.entry)fail('ZIP 内单个文件超过15MB：'+name);
   total+=size;if(total>LIMITS.total)fail('ZIP 解压总大小超过130MB');
   if(offset+30>bytes.length||u32(offset)!==0x04034b50)fail('ZIP 本地文件头损坏');
   const localName=u16(offset+26),localExtra=u16(offset+28),start=offset+30+localName+localExtra;
   if(start+compressed>bytes.length)fail('ZIP 内容越界');
   if(entries.has(name))fail('ZIP 包含重复路径：'+name);
   entries.set(name,{name,method,size,compressed,bytes:bytes.subarray(start,start+compressed)});
  }
  async function extract(name){const e=entries.get(name);if(!e)return null;
   let out=e.bytes;
   if(e.method===8){if(typeof DecompressionStream==='undefined')fail('浏览器不支持 ZIP 压缩解码，请使用新版 Edge');
    const stream=new Blob([out]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    out=new Uint8Array(await new Response(stream).arrayBuffer());}
   if(out.length!==e.size)fail('ZIP 解压大小不匹配：'+name);
   return out;
  }
  return {names:[...entries.keys()],extract};
 }
 function cleanName(s){const t=String(s||'').trim();return /^(拼多多商城|拼多多|商品详情|商品详情页|Pinduoduo)$/i.test(t)?'':t.slice(0,200)}
 function num(x){const n=Number(x);return Number.isFinite(n)&&n>0&&n<100000?n:null}
 function getPrices(data){const list=[];
  const add=(label,value,context)=>{const n=num(value);if(n!==null&&!list.some(p=>p.label===label&&p.cny===n&&p.context===context))list.push({label:String(label||'未标注'),cny:n,context})};
  for(const p of data.pagePrices||[]){add(p.label||p.kind,p.cny??p.amountCNY??p.value,'商品页参考价')}
  for(const v of data.variants||[]){for(const [k,n] of Object.entries(v.visiblePrices||{}))add(k,n,'规格页参考价');for(const [k,n] of Object.entries(v.rawVisiblePrices||{}))add(k,n,'规格页未核实价');for(const p of v.priceEvidence||[])add(p.label,p.cny,'规格页价格线索')}
  return list.slice(0,100);
 }
 function variants(data){const raw=Array.isArray(data.variants)?data.variants:[],groups=Array.isArray(data.specGroups)?data.specGroups:[];
  const rows=raw.slice(0,100).map(v=>{
   const specs=v.specs&&typeof v.specs==='object'?v.specs:{};
   const labels=Object.values(specs).filter(Boolean).map(String);
   const selection=String(v.selection||v.selectedText||'').split(/懂生活|更懂优惠|超高性价比/)[0].trim();
   const color=labels[0]||selection||'',size=labels.slice(1).join(' / ');
   const evidence=[];
   for(const [k,n] of Object.entries(v.visiblePrices||{})){if(num(n)!==null)evidence.push({label:k,cny:Number(n)})}
   for(const [k,n] of Object.entries(v.rawVisiblePrices||{})){if(num(n)!==null&&!evidence.some(p=>p.label===k&&p.cny===Number(n)))evidence.push({label:k,cny:Number(n)})}
   for(const p of v.priceEvidence||[]){if(num(p.cny)!==null&&!evidence.some(x=>x.label===p.label&&x.cny===Number(p.cny)))evidence.push({label:p.label||'未标注',cny:Number(p.cny)})}
   return {color,size,evidence,sourceImage:v.image||v.sourceImage||null,raw:v};
  });
  if(!rows.length&&groups.length===1&&Array.isArray(groups[0].options)){
   for(const opt of groups[0].options.slice(0,60))rows.push({color:String(opt),size:'',evidence:[],sourceImage:null,raw:null});
  }
  // Inline-safe captured one selected option; recover other visible option labels only as unpriced candidates.
  if(!groups.length&&raw.length===1&&typeof raw[0].rawText==='string'){
   const lines=raw[0].rawText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   const headings=new Set(['型号','颜色','颜色分类','规格','尺码','款式','套餐','尺寸']);
   const idx=lines.findIndex(x=>headings.has(x));
   if(idx>=0){let count=0;for(let i=idx+1;i<lines.length&&count<40;i++){
    const s=lines[i];if(headings.has(s)||/^(已拼|已享|确定|确认|立即购买)/.test(s))break;
    if(s.length>1&&s.length<100&&!rows.some(r=>r.color===s))rows.push({color:s,size:'',evidence:[],sourceImage:null,raw:null});count++;
   }}
  }
  return rows;
 }
 function mimeOf(b){if(b.length<12)return null;
  if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
  if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return 'image/png';
  if(String.fromCharCode(...b.subarray(0,4))==='RIFF'&&String.fromCharCode(...b.subarray(8,12))==='WEBP')return 'image/webp';
  return null;
 }
 async function parse(file){
  const isZip=/\.zip$/i.test(file.name)||file.type==='application/zip';let data,archive=null,warning=[];
  if(isZip){archive=await readZip(file);const jsonName=archive.names.find(n=>/(^|\/)product\.json$/i.test(n))||archive.names.find(n=>/\.json$/i.test(n)&&!/image_mapping|sku_diagnostics/i.test(n));
   if(!jsonName)fail('ZIP 中找不到 product.json');const raw=await archive.extract(jsonName);
   if(raw.length>4*1024*1024)fail('product.json 超过4MB');data=JSON.parse(decoder.decode(raw));
  }else{if(file.size>4*1024*1024)fail('JSON 文件超过4MB');data=JSON.parse(await file.text())}
  if(!data||typeof data!=='object'||!Array.isArray(data.images)&&!Array.isArray(data.variants))fail('无法识别的 SORA 商品数据');
  const sourceId=String(data.goodsId||'');const sourceUrl=String(data.url||'');
  const mapping=Array.isArray(data.imageMapping)?data.imageMapping:Array.isArray(data.zipSummary?.imageFileMap)?data.zipSummary.imageFileMap:[];
  let extraMap=[];
  if(archive&&archive.names.includes('image_mapping.json')){try{const m=JSON.parse(decoder.decode(await archive.extract('image_mapping.json')));extraMap=Array.isArray(m)?m:Array.isArray(m.images)?m.images:[]}catch{warning.push('image_mapping.json 读取失败，已尝试从图片文件恢复')}}
  const mapped=[...mapping,...extraMap];const photos=[],seen=new Set();
  if(archive){
   const paths=archive.names.filter(n=>/^images\//i.test(n)&&/\.(jpe?g|png|webp)$/i.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
   for(const name of paths){const raw=await archive.extract(name),mime=mimeOf(raw);
    if(!mime){warning.push('跳过非有效图片：'+name);continue}
    if(raw.length>5*1024*1024){warning.push('图片超过5MB，未导入：'+name);continue}
    const row=mapped.find(x=>x.file===name);
    const photo={file:name,sourceUrl:row?.url||'',blob:new Blob([raw],{type:mime}),mime,selected:true};
    photos.push(photo);seen.add(row?.url||name);
   }
  }
  const urls=[...(data.images||[]),...mapped.map(x=>x.url)].filter(x=>typeof x==='string'&&/^https:\/\//.test(x));
  for(const url of urls){if(seen.has(url))continue;seen.add(url);photos.push({file:'',sourceUrl:url,blob:null,mime:null,selected:false})}
  if(!photos.length)warning.push('没有找到商品图片；可以使用后台原有的照片上传功能');
  if(!archive)warning.push('JSON 不包含图片文件。远程图片仅供参考，无法直接上传为商品图片。请导入采集器 ZIP。');
  if(!cleanName(data.name||data.title))warning.push('商品名称未正确采集，请在预览中填写真实名称');
  return {data,photos,prices:getPrices(data),rows:variants(data),name:cleanName(data.name||data.title),goodsId:sourceId,url:sourceUrl,warnings:warning};
 }
 root.SoraZipCore={parse,readZip,mimeOf,variants,getPrices};
})(typeof window!=='undefined'?window:globalThis);
