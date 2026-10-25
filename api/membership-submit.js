// Server-only membership submission bridge. Public activation is explicitly gated.
const SCRIPT_URL='https://script.google.com/macros/s/AKfycbw4cZhuRXQL9eI9DfoKKa9mu6urZAi_c32pw4zgFVzPIzT_UhJHUmplD6_Z6Rt-fM0x/exec';
const TYPES=new Set(['TEXT','PARAGRAPH_TEXT','MULTIPLE_CHOICE','CHECKBOX','LIST','DATE','FILE_UPLOAD']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(process.env.HAAS_MEMBERSHIP_ENABLED!=='true')return res.status(503).json({error:'Website applications are being tested. Please use the official Google Form.'});
 const secret=process.env.HAAS_SUBMISSION_SECRET;
 if(!secret)return res.status(503).json({error:'Application service is not configured.'});
 try{
  const application=req.body?.application;
  if(!application||application.consent!==true||!application.answers||typeof application.answers!=='object'||Array.isArray(application.answers))return res.status(400).json({error:'Complete the application and constitution declaration.'});
  const photo=application.photo;
  if(!photo||!['image/jpeg','image/png','image/webp'].includes(photo.type)||typeof photo.data!=='string'||photo.data.length>4200000||!/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data))return res.status(400).json({error:'A JPG, PNG or WebP identification photo under 3 MB is required.'});
  const schemaResponse=await fetch(SCRIPT_URL,{redirect:'follow',signal:AbortSignal.timeout(12000)});
  if(!schemaResponse.ok)throw Error('Schema unavailable');
  const schema=await schemaResponse.json();
  if(!Array.isArray(schema.questions)||schema.questions.some(q=>!TYPES.has(q.type)))return res.status(503).json({error:'The official Google Form has unsupported changes. Please use the original Google Form.'});
  const ids=new Set(schema.questions.filter(q=>q.type!=='FILE_UPLOAD').map(q=>String(q.id)));
  const answers=application.answers;
  if(Object.keys(answers).some(id=>!ids.has(id)))return res.status(409).json({error:'The form changed while you were applying. Refresh and retry.'});
  for(const q of schema.questions){
   if(q.type==='FILE_UPLOAD')continue;
   const value=answers[String(q.id)];
   const vals=Array.isArray(value)?value:[value];
   if(q.required&&(!vals.length||vals.every(v=>!String(v||'').trim())))return res.status(400).json({error:'Please complete: '+q.title});
   if(vals.some(v=>typeof v!=='string'||v.length>3000))return res.status(400).json({error:'Invalid answer length'});
   if(Array.isArray(q.options)&&q.options.length&&vals.some(v=>v&& !q.options.includes(v)))return res.status(400).json({error:'Invalid selection: '+q.title});
  }
  const response=await fetch(process.env.HAAS_APPS_SCRIPT_URL||SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret,application:{consent:true,answers,photo}}),redirect:'follow',signal:AbortSignal.timeout(25000)});
  const result=await response.json();
  if(!response.ok||!result.ok)return res.status(502).json({error:'Submission could not be confirmed. Please contact HAAS before retrying to avoid duplicates.'});
  return res.status(200).json({ok:true,applicationId:result.applicationId||null});
 }catch(e){console.error('Membership bridge failed:',e.message);return res.status(502).json({error:'Submission could not be confirmed. Please contact HAAS before retrying to avoid duplicates.'});}
}