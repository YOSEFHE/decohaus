function decode(s=''){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#039;/g,"'");}
function attrs(tag=''){const out={};const re=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;let m;while((m=re.exec(tag))!==null)out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]??'');return out;}
function strip(s=''){return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
export default async function handler(req,res){
  const base='https://decohaus.ir';
  const paths=['/fa/','/fa/contact/','/en/','/en/contact/'];
  const pages=[];
  for(const path of paths){
    const r=await fetch(base+path,{redirect:'follow',cache:'no-store',headers:{'user-agent':'DecoHaus-Contact-Audit/1.0'}});
    const html=await r.text();
    const anchors=[...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map(m=>{const tag=m[0].match(/<a\b[^>]*>/i)?.[0]||'';const a=attrs(tag);return {href:a.href||null,text:strip(m[0])};});
    pages.push({path,status:r.status,final_url:r.url,tel:anchors.filter(a=>a.href&&a.href.startsWith('tel:')),whatsapp:anchors.filter(a=>a.href&&/(wa\.me|whatsapp\.com)/i.test(a.href))});
  }
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({generated_at_utc:new Date().toISOString(),pages});
}
