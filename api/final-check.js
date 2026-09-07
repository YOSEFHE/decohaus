function decodeEntities(s=''){return s.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#039;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
function attrs(tag=''){const out={}; const re=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g; let m; while((m=re.exec(tag))!==null) out[m[1].toLowerCase()]=decodeEntities(m[2]??m[3]??m[4]??''); return out;}
function strip(s=''){return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
async function fetchText(url){const r=await fetch(url,{redirect:'follow',cache:'no-store',headers:{'user-agent':'DecoHaus-Final-QA/1.0'}}); return {r,text:await r.text()};}
export default async function handler(req,res){
 const base='https://decohaus.ir';
 const paths=['/fa/','/en/','/fa/projects/amirabad/','/fa/projects/gandhi-medical/'];
 const pages=[];
 for(const path of paths){
  const {r,text}=await fetchText(base+path);
  const imgs=[...text.matchAll(/<img\b[^>]*>/gi)].map(m=>{const a=attrs(m[0]); return {src:a.src||null,alt:Object.prototype.hasOwnProperty.call(a,'alt')?a.alt:null,width:a.width||null,height:a.height||null,loading:a.loading||null,tag:m[0].slice(0,300)};});
  const missing=imgs.filter(x=>x.alt===null || x.alt==='');
  const scripts=[...text.matchAll(/<script\b[^>]*src=["'][^"']+["'][^>]*>/gi)].map(m=>({tag:m[0],has_defer:/\bdefer(?:\s|>|=)/i.test(m[0]),has_async:/\basync(?:\s|>|=)/i.test(m[0])}));
  const fontLinks=[...text.matchAll(/<link\b[^>]*fonts\.googleapis\.com[^>]*>/gi)].map(m=>m[0]);
  const heroPreloads=[...text.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*as=["']image["'][^>]*>/gi)].map(m=>m[0]);
  pages.push({path,status:r.status,final_url:r.url,missing_alt_images:missing,scripts,font_links:fontLinks,hero_preloads:heroPreloads});
 }
 const sitemap=(await fetchText(base+'/sitemap.xml')).r.status;
 const robots=await fetchText(base+'/robots.txt');
 res.setHeader('Cache-Control','no-store');
 return res.status(200).json({generated_at_utc:new Date().toISOString(),pages,sitemap_status:sitemap,robots:{status:robots.r.status,text:robots.text}});
}
