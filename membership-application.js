(()=>{'use strict';
const FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSe1ND8ITU-3AZgwZ5iczHf7WPSEKIu5A9a6bFhhl-B7Be6A2w/viewform';
const TYPES=new Set(['TEXT','PARAGRAPH_TEXT','MULTIPLE_CHOICE','CHECKBOX','LIST','DATE','FILE_UPLOAD']);
const form=document.getElementById('application'),fields=document.getElementById('dynamic-fields'),message=document.getElementById('message'),status=document.querySelector('.top .status'),submit=form.querySelector('[type=submit]'),progress=document.getElementById('progress');
let questions=[];
const link=()=>{const a=document.createElement('a');a.href=FORM_URL;a.target='_blank';a.rel='noopener';a.textContent='official Google Form';return a};
function notice(text){message.replaceChildren(document.createTextNode(text+' '),link())}
function fail(text){fields.replaceChildren();submit.disabled=true;status.textContent=text;notice('Please apply using the');}
function element(tag,props={},value=''){const node=document.createElement(tag);for(const [key,val] of Object.entries(props)){if(key==='className')node.className=val;else if(key==='required')node.required=val;else node.setAttribute(key,val)}if(value)node.textContent=value;return node}
function render(q,index){
 const wrap=element('div',{className:'field'}),label=element('label',{className:'question'},(index+1)+'. '+q.title+(q.required?' *':'')),name='q_'+q.id;
 wrap.append(label);
 if(q.type==='TEXT'||q.type==='PARAGRAPH_TEXT'||q.type==='DATE'){
  const node=q.type==='PARAGRAPH_TEXT'?element('textarea',{name,rows:'3'}):element('input',{name,type:q.type==='DATE'?'date':'text'});
  node.required=q.required;node.id=name;label.htmlFor=name;wrap.append(node);
 }else if(q.type==='MULTIPLE_CHOICE'||q.type==='CHECKBOX'){
  const choices=element('div',{className:'choices'});
  q.options.forEach((option,i)=>{const item=element('label'),input=element('input',{type:q.type==='CHECKBOX'?'checkbox':'radio',name,value:option});if(q.required&&q.type==='MULTIPLE_CHOICE'&&i===0)input.required=true;item.append(input,document.createTextNode(' '+option));choices.append(item)});
  wrap.append(choices);
 }else if(q.type==='LIST'){
  const select=element('select',{name});select.required=q.required;select.append(element('option',{value:''},'Select an option'));
  q.options.forEach(option=>select.append(element('option',{value:option},option)));wrap.append(select);
 }else if(q.type==='FILE_UPLOAD'){
  const input=element('input',{type:'file',name,accept:'image/jpeg,image/png,image/webp'});input.required=true;wrap.append(input,element('small',{},'One JPG, PNG or WebP image, maximum 3 MB.'));
 }
 return wrap;
}
function updateProgress(){const items=questions.filter(q=>q.type!=='FILE_UPLOAD');let filled=0;const data=new FormData(form);for(const q of items){const val=data.getAll('q_'+q.id);if(val.some(v=>String(v).trim()))filled++}progress.style.width=(items.length?Math.round(filled/items.length*100):0)+'%'}
async function init(){
 submit.disabled=true;
 try{
  const response=await fetch('/api/membership-schema',{cache:'no-store'});if(!response.ok)throw Error('Schema unavailable');
  const schema=await response.json();if(!Array.isArray(schema.questions)||!schema.questions.length)throw Error('Empty schema');
  if(schema.questions.some(q=>!TYPES.has(q.type)||!q.id||!q.title||(['MULTIPLE_CHOICE','CHECKBOX','LIST'].includes(q.type)&&(!Array.isArray(q.options)||!q.options.length))))throw Error('Unsupported questions');
  const uploads=schema.questions.filter(q=>q.type==='FILE_UPLOAD');if(uploads.length!==1)throw Error('Unsupported photo question');
  questions=schema.questions;
  // Show the supplied completion GIF once, then reveal the questions.
  // If the image is unavailable, reveal the form immediately instead of blocking applications.
  const loader=fields.querySelector('.haas-loading');
  const gif=document.getElementById('haas-loader-gif');
  if(loader&&gif){
   const completion='assets/membership-complete.gif';
   const available=await new Promise(resolve=>{
    const preview=new Image();
    const timer=setTimeout(()=>resolve(false),3000);
    preview.onload=()=>{clearTimeout(timer);resolve(true)};
    preview.onerror=()=>{clearTimeout(timer);resolve(false)};
    preview.src=completion;
   });
   if(available){
    loader.classList.add('is-complete');
    gif.src=completion;
    gif.alt='Horse archer completion animation';
    document.getElementById('haas-loading-label').textContent='Application ready';
    // GIF 2 is 10 frames at 100 ms each. Capture its last frame just
    // before the first loop ends, then hold that exact visual before reveal.
    await new Promise(resolve=>setTimeout(resolve,950));
    try{
     const frozen=document.createElement('canvas');
     frozen.width=gif.naturalWidth||568;
     frozen.height=gif.naturalHeight||320;
     frozen.className=gif.className;
     frozen.setAttribute('role','img');
     frozen.setAttribute('aria-label','Horse archer final pose');
     frozen.getContext('2d').drawImage(gif,0,0,frozen.width,frozen.height);
     gif.replaceWith(frozen);
    }catch(error){
     // Never block form rendering if a browser cannot capture a GIF frame.
    }
    await new Promise(resolve=>setTimeout(resolve,650));
   }
  }
  fields.replaceChildren(...questions.map(render));
  submit.disabled=!schema.submissionsEnabled;status.textContent=schema.submissionsEnabled?'Questions synchronized with the official HAAS Google Form.':'Questions synchronized. Website submission is awaiting final verification; please use the official Google Form for now.';
  updateProgress();
 }catch(e){fail('The latest application questions cannot be displayed here at present.')}
}
form.addEventListener('input',updateProgress);form.addEventListener('change',updateProgress);
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!questions.length)return;
 const data=new FormData(form),answers={};let photo=null;
 for(const q of questions){
  const key='q_'+q.id;
  if(q.type==='FILE_UPLOAD'){photo=data.get(key);continue}
  const vals=data.getAll(key).map(String);
  if(q.required&&!vals.some(v=>v.trim())){notice('Please complete '+q.title+'. You can also use the');return}
  answers[q.id]=q.type==='CHECKBOX'?vals:(vals[0]||'');
 }
 if(!form.querySelector('#constitution-consent').checked){notice('Please agree to the HAAS Constitution, or use the');return}
 if(!photo||!photo.size||photo.size>3*1024*1024||!['image/jpeg','image/png','image/webp'].includes(photo.type)){notice('Please upload a JPG, PNG or WebP photo under 3 MB, or use the');return}
 submit.disabled=true;submit.textContent='Submitting…';
 try{
  const photoData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(photo)});
  const response=await fetch('/api/membership-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({application:{consent:true,answers,photo:{type:photo.type,data:photoData}}})});
  const result=await response.json();
  if(!response.ok||!result.ok)throw Error(result.error||'Submission could not be confirmed.');
  form.reset();updateProgress();message.textContent='Application submitted successfully. Reference: '+(result.applicationId||'confirmed');
 }catch(e){notice((e.message||'Submission could not be confirmed.')+' Please use the')}
 finally{submit.disabled=false;submit.textContent='Submit Application';message.scrollIntoView({behavior:'smooth',block:'center'})}
});
init();
})();