// HAA(S) membership submission proxy. Configure HAAS_APPS_SCRIPT_URL and HAAS_SUBMISSION_SECRET in Vercel.
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.HAAS_APPS_SCRIPT_URL||!process.env.HAAS_SUBMISSION_SECRET)return res.status(503).json({error:'Applications are not yet connected. Please use the original Google Form.'});
  try{
    const a=req.body?.application;
    if(!a||!a.consent)return res.status(400).json({error:'Please complete the declaration.'});
    const required=['f0','f1','f2','f3','f4','f5','f6','f7','f8','f11','f12','f13','f14','f15'];
    if(required.some(k=>!String(a[k]||'').trim()))return res.status(400).json({error:'Please complete all required fields.'});
    if(!/^[0-9]{3}[A-Za-z]$/.test(a.f2))return res.status(400).json({error:'Invalid NRIC last four characters.'});
    if(!a.photo||!/^image\/(jpeg|png|webp)$/.test(a.photo.type)||!a.photo.data||a.photo.data.length>4200000)return res.status(400).json({error:'Upload a JPG, PNG or WebP photo under 3 MB.'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    let upstream;
    try{upstream=await fetch(process.env.HAAS_APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret:process.env.HAAS_SUBMISSION_SECRET,application:a}),redirect:'follow',signal:controller.signal})}finally{clearTimeout(timer)}
    const raw=await upstream.text();let result;try{result=JSON.parse(raw)}catch{return res.status(502).json({error:'Google Sheets connection returned an unexpected response.'})}
    if(!upstream.ok||!result.ok)return res.status(502).json({error:'Submission was not confirmed. Please contact HAA(S) before retrying to avoid duplicates.'});
    return res.status(200).json({ok:true});
  }catch(err){console.error('Membership submission error',err);return res.status(502).json({error:'Unable to confirm submission. Please contact HAA(S) before retrying to avoid duplicates.'})}
}