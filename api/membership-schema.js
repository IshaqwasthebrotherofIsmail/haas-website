// Public, read-only proxy for the HAAS Google Form question schema.
// No respondent data or private credentials are sent to the browser.
const SOURCE='https://script.google.com/macros/s/AKfycbw4cZhuRXQL9eI9DfoKKa9mu6urZAi_c32pw4zgFVzPIzT_UhJHUmplD6_Z6Rt-fM0x/exec';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  let response;try{response=await fetch(SOURCE,{redirect:'follow',signal:controller.signal})}finally{clearTimeout(timeout)}
  if(!response.ok)throw Error('Source unavailable');
  const data=await response.json();
  if(!data||!Array.isArray(data.questions)||data.questions.length>150)throw Error('Invalid schema');
  const questions=data.questions.map(q=>({id:String(q.id||''),title:String(q.title||'').slice(0,500),type:String(q.type||''),required:!!q.required,options:Array.isArray(q.options)?q.options.slice(0,100).map(v=>String(v).slice(0,300)):[]}));
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({title:String(data.title||''),questions});
 }catch(e){return res.status(502).json({error:'Form synchronization temporarily unavailable'});}
}