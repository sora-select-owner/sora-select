/* SORA SELECT local ZIP-to-draft workflow. Depends on existing admin.html form. */
(function(){'use strict';
 const by=id=>document.getElementById(id),ui=by('soraZipImport');if(!ui)return;
 let parsed=null,urls=[],photoElements=[],variantRows=[],mainPhoto=-1;
 const msg=(s,err=false)=>{by('soraZipStatus').textContent=s;by('soraZipStatus').className=err?'error':'success'};
 const make=(tag,txt,cls)=>{const el=document.createElement(tag);if(txt!==undefined)el.textContent=txt;if(cls)el.className=cls;return el};
 function cleanup(){urls.forEach(x=>URL.revokeObjectURL(x));urls=[];photoElements=[];variantRows=[];mainPhoto=-1}
 const money=n=>Number.isFinite(n)?'¥'+n.toLocaleString('ja-JP'):'未設定';
 function rate(){const r=Number(by('soraZipRate').value),m=Number(by('soraZipMarkup').value);if(!(r>0&&r<1000&&m>=1&&m<=100))throw Error('汇率应大于0、倍率应不小于1');return {r,m}}
 function toYen(cny){const {r,m}=rate();return Math.ceil(Number(cny)*r*m)}
 function showPhotoChoices(){
  const grid=by('soraZipPhotos');grid.replaceChildren();photoElements=[];
  parsed.photos.forEach((p,i)=>{
   const tile=make('div',undefined,'sora-import-photo');const img=make('img');img.alt='图片 '+(i+1);
   img.src=p.preview;img.referrerPolicy='no-referrer';img.loading='lazy';tile.append(img);
   const file=make('small',(i+1)+' · '+(p.blob?'ZIP 内真实图片':'仅远程链接（不能自动上传）'));tile.append(file);
   const check=make('input');check.type='checkbox';check.checked=!!p.selected&&!!p.blob;check.disabled=!p.blob;check.setAttribute('aria-label','保留图片 '+(i+1));
   const label=make('label');label.append(check,document.createTextNode(' 保留'));tile.append(label);
   const radio=make('input');radio.type='radio';radio.name='soraZipMain';radio.value=String(i);radio.checked=i===mainPhoto;radio.disabled=!p.blob;
   const rl=make('label');rl.append(radio,document.createTextNode(' 主图'));tile.append(rl);
   check.onchange=()=>{p.selected=check.checked;if(!p.selected&&mainPhoto===i){const next=parsed.photos.findIndex(x=>x.selected&&x.blob);mainPhoto=next;showPhotoChoices()}updateCounts()};
   radio.onchange=()=>{if(radio.checked){p.selected=true;mainPhoto=i;showPhotoChoices();updateCounts()}};
   photoElements.push({check,radio});grid.append(tile);
  });updateCounts();
 }
 function updateCounts(){const total=parsed?.photos.filter(p=>p.selected&&p.blob).length||0;by('soraZipPhotoCount').textContent='已选 '+total+' 张真实图片；其余图片不会上传。'+(mainPhoto<0?' 尚未指定主图。':' 主图：第 '+(mainPhoto+1)+' 张。')}
 function getPhotoOptions(sel,chosen){sel.replaceChildren();sel.append(new Option('不关联／使用商品主图',''));
  parsed.photos.forEach((p,i)=>{if(p.blob&&p.selected)sel.append(new Option('图片 '+(i+1)+' · '+p.file,String(i)))});
  if(chosen!==undefined)sel.value=String(chosen);if(!sel.value&&chosen!==''&&chosen!==undefined)sel.value='';
 }
 function buildRow(initial={}){
  const row=make('div',undefined,'sora-import-variant');const a=make('input'),b=make('input'),p=make('input'),pick=make('select'),img=make('select'),del=make('button','删除','secondary');
  a.placeholder='型号／颜色';a.value=initial.color||'';a.maxLength=120;
  b.placeholder='尺码／其他';b.value=initial.size||'';b.maxLength=120;
  p.type='number';p.min='0';p.step='1';p.placeholder='日元售价（可手填）';p.value=initial.yen??'';
  const prices=initial.evidence?.length?initial.evidence:parsed.prices;
  pick.append(new Option('选择人民币价格线索（不自动认定）',''));
  prices.forEach((v,i)=>pick.append(new Option(v.label+' ¥'+v.cny+'（'+(initial.evidence?.length?'当前规格':'商品页')+'）',String(i))));
  pick.onchange=()=>{if(pick.value!==''){try{p.value=toYen(prices[Number(pick.value)].cny)}catch(e){msg(e.message,true)}}};
  const photoLabel=initial.sourceImage?parsed.photos.findIndex(x=>x.sourceUrl&&x.sourceUrl===initial.sourceImage):-1;
  getPhotoOptions(img,photoLabel>=0?String(photoLabel):'');
  const group=make('div',undefined,'sora-import-variant-controls');group.append(a,b,p,pick,img,del);row.append(group);
  const evidence=make('small','价格线索不是最终采购价；运费、关税、平台费用未计入。');row.append(evidence);
  del.type='button';del.onclick=()=>{variantRows=variantRows.filter(x=>x.row!==row);row.remove();updateVariantCount()};
  variantRows.push({row,a,b,p,pick,img,prices});by('soraZipVariants').append(row);updateVariantCount();
 }
 function updateVariantCount(){by('soraZipVariantCount').textContent='规格行：'+variantRows.length+'（没有准确价格可以留空，保存为非公开草稿）'}
 function refreshVariantImages(){for(const r of variantRows){const old=r.img.value;getPhotoOptions(r.img,old)}}
 function render(result){cleanup();parsed=result;
  by('soraZipName').value=result.name;
  by('soraZipSource').textContent='商品ID：'+(result.goodsId||'未识别')+'　来源：'+(result.url||'未识别');
  const warnings=by('soraZipWarnings');warnings.replaceChildren();for(const w of result.warnings){const el=make('p','⚠ '+w);warnings.append(el)}
  by('soraZipPrices').replaceChildren();if(result.prices.length){for(const p of result.prices){by('soraZipPrices').append(make('span',p.label+' ¥'+p.cny+' ['+p.context+']','sora-import-pill'))}}
  else by('soraZipPrices').textContent='未采集到可信的价格；请手动填写日元售价。';
  result.photos.forEach(p=>{p.preview=p.blob?URL.createObjectURL(p.blob):p.sourceUrl;if(p.blob)urls.push(p.preview)});
  mainPhoto=result.photos.findIndex(x=>x.blob&&x.selected);showPhotoChoices();
  by('soraZipVariants').replaceChildren();variantRows=[];result.rows.forEach(v=>buildRow(v));
  by('soraZipReview').classList.remove('hidden');by('soraZipApply').disabled=false;
  msg('读取成功：'+result.photos.filter(p=>p.blob).length+' 张 ZIP 真实图片，'+result.rows.length+' 个规格候选。请先检查商品名、照片和售价。');
 }
 by('soraZipRead').onclick=async()=>{
  const file=by('soraZipFile').files[0];if(!file)return msg('请先选择 ZIP 或 JSON 文件。',true);
  by('soraZipRead').disabled=true;by('soraZipApply').disabled=true;msg('正在本地读取资料包，不会上传到服务器……');
  try{render(await window.SoraZipCore.parse(file))}catch(e){cleanup();parsed=null;by('soraZipReview').classList.add('hidden');msg('导入失败：'+e.message,true)}finally{by('soraZipRead').disabled=false}
 };
 by('soraZipAddVariant').onclick=()=>{if(parsed)buildRow({})};
 by('soraZipSelectAll').onclick=()=>{if(!parsed)return;parsed.photos.forEach(p=>{p.selected=!!p.blob});if(mainPhoto<0)mainPhoto=parsed.photos.findIndex(p=>p.blob);showPhotoChoices();refreshVariantImages()};
 by('soraZipSelectNone').onclick=()=>{if(!parsed)return;parsed.photos.forEach(p=>p.selected=false);mainPhoto=-1;showPhotoChoices();refreshVariantImages()};
 by('soraZipPhotos').addEventListener('change',()=>setTimeout(refreshVariantImages,0));
 by('soraZipApply').onclick=()=>{
  if(!parsed)return;
  try{
   const name=by('soraZipName').value.trim();if(!name||name.length>200)throw Error('请填写正确的商品名称（最多200字）');
   if(by('productId').value&&!confirm('当前正在编辑已存在商品。确定要切换为新商品草稿吗？'))return;
   const selected=parsed.photos.map((p,i)=>({...p,index:i})).filter(p=>p.blob&&p.selected);
   if(selected.length>60)throw Error('一次最多选择60张图片');
   if(selected.length&&!by('soraZipRights').checked)throw Error('请确认你有权将选中照片用于销售页面');
   if(selected.length&&(!selected.some(x=>x.index===mainPhoto)))throw Error('请指定一张选中照片作为主图');
   const rows=variantRows.map(v=>({color:v.a.value.trim(),size:v.b.value.trim(),yen:v.p.value.trim(),photo:v.img.value}));
   for(const r of rows){if(!r.color&&!r.size)throw Error('规格名称不能为空，请删除无效规格行');if(r.yen!==''&&(!Number.isInteger(Number(r.yen))||Number(r.yen)<0))throw Error('规格售价必须是非负整数')}
   const seen=new Set();for(const r of rows){const k=r.color+'|'+r.size;if(seen.has(k))throw Error('有重复规格，请先合并');seen.add(k)}
   const toFile=(p)=>new File([p.blob],p.file.split('/').pop()||('sora_'+p.index+'.jpg'),{type:p.mime});
   const main=selected.find(p=>p.index===mainPhoto),others=selected.filter(p=>p.index!==mainPhoto);
   const mainDt=new DataTransfer();if(main)mainDt.items.add(toFile(main));
   const galleryDt=new DataTransfer();others.forEach(p=>galleryDt.items.add(toFile(p)));
   // Reuse the existing, tested Supabase upload pipeline in admin.html.
   clearForm();
   by('productName').value=name;
   const yen=by('soraZipBaseYen').value.trim();
   const validPrices=rows.map(r=>Number(r.yen)).filter((v,i)=>rows[i].yen!==''&&Number.isInteger(v)&&v>=0);
   const base=yen!==''?Number(yen):(validPrices.length?Math.min(...validPrices):0);
   if(!Number.isInteger(base)||base<0)throw Error('商品基础售价必须是非负整数');
   by('productPrice').value=base;
   by('productDescription').value='【商品情報：翻訳・仕様・販売条件を要確認】\n'+name+'\n仕入れ参考：'+parsed.url+'\n※中国サイトの表示価格は決済価格ではありません。送料・税・販売条件を確認してください。';
   by('productPublished').checked=false;by('stockStatus').value='out';
   by('productImage').files=mainDt.files;by('productImage').dispatchEvent(new Event('change',{bubbles:true}));
   by('galleryFiles').files=galleryDt.files;by('galleryFiles').dispatchEvent(new Event('change',{bubbles:true}));
   const index=new Map(others.map((p,i)=>[String(p.index),i]));
   variantDrafts=rows.map(r=>({key:crypto.randomUUID(),color:r.color,size:r.size,price_yen:r.yen===''?0:Number(r.yen),image_url:index.has(r.photo)?'__pending_'+index.get(r.photo):'',available:false}));
   renderGalleryEditor();renderVariantRows();
   msg('已填入后台商品表单：'+selected.length+' 张图片、'+rows.length+' 个规格。图片尚未上传。请检查售价与配图，再点击原有的「商品を保存」；默认非公开、停售。');
   by('productForm').scrollIntoView({behavior:'smooth'});
  }catch(e){msg('应用失败：'+e.message,true)}
 };
 window.addEventListener('beforeunload',cleanup);
})();
