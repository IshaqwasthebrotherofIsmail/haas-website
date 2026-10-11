export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const token=req.headers.authorization?.replace(/^Bearer\s+/,"");
  if(!process.env.HAAS_ADMIN_SECRET || token!==process.env.HAAS_ADMIN_SECRET) return res.status(401).json({error:"Unauthorized"});
  if(!process.env.GITHUB_TOKEN) return res.status(503).json({error:"Publishing is not connected yet"});
  const {eyebrow,headline,description,primary,secondary}=req.body||{};
  const clean=v=>String(v||"").replace(/[<>]/g,"").slice(0,500);
  const gh={"Authorization":"Bearer "+process.env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  const url="https://api.github.com/repos/IshaqwasthebrotherofIsmail/haas-website/contents/index.html";
  const current=await fetch(url,{headers:gh}); if(!current.ok)return res.status(502).json({error:"Could not read site source"});
  const data=await current.json(); let html=Buffer.from(data.content,"base64").toString("utf8");
  html=html.replace(/<p class="eyebrow">[\s\S]*?<\/p>/,()=>'<p class="eyebrow">'+clean(eyebrow)+'</p>')
    .replace(/<h1>[\s\S]*?<\/h1>/,()=>'<h1>'+clean(headline).replace(/\n/g,"<br>")+'</h1>')
    .replace(/(<div class="hero-copy">[\s\S]*?<h1>[\s\S]*?<\/h1>\s*)<p>[\s\S]*?<\/p>/,(_,a)=>a+'<p>'+clean(description)+'</p>')
    .replace(/(<a class="btn primary" href="#membership">)[\s\S]*?(<\/a>)/,(_,a,b)=>a+clean(primary)+b)
    .replace(/(<a class="btn ghost" href="#sport">)[\s\S]*?(<\/a>)/,(_,a,b)=>a+clean(secondary)+b);
  const put=await fetch(url,{method:"PUT",headers:{...gh,"Content-Type":"application/json"},body:JSON.stringify({message:"Publish website content from HAA(S) editor",content:Buffer.from(html).toString("base64"),sha:data.sha,branch:"main"})});
  if(!put.ok){const e=await put.text();return res.status(502).json({error:"GitHub publish failed",detail:e.slice(0,300)})}
  return res.status(200).json({ok:true,message:"Published. Vercel deployment triggered."});
}