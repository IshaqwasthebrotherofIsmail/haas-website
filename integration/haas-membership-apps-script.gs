/*
 HAAS membership bridge (deployment template, NOT active until configured).
 This records website applications in a separate tab of the existing HAAS Member Particulars spreadsheet and uploads
 applicant photos to a private Drive folder. It does NOT create native
 Google Forms responses, because Apps Script cannot programmatically
 populate a Google Forms file-upload answer.
*/
const FORM_ID='10Skxo8Tc5EqfZsQRbfgHfNwAhOlcm9EYmPCuPclIPTE';
const EXISTING_SHEET_ID='1jbL7OWxnYkr_JUO3LBLAZnjibT0913J-kaAqT6JP1hA';
const WEBSITE_TAB='Website Applications';
function setupHAAS(){
 const p=PropertiesService.getScriptProperties();
 const spreadsheet=SpreadsheetApp.openById(EXISTING_SHEET_ID);
 let tab=spreadsheet.getSheetByName(WEBSITE_TAB);
 if(!tab){
  tab=spreadsheet.insertSheet(WEBSITE_TAB);
  tab.appendRow(['Received at','Application ID','Answers JSON','Photo URL']);
 }
 p.setProperty('HAAS_SHEET_ID',EXISTING_SHEET_ID);
 if(!p.getProperty('HAAS_PHOTO_FOLDER_ID')){
  const folder=DriveApp.createFolder('HAAS Website Membership Photos');
  p.setProperty('HAAS_PHOTO_FOLDER_ID',folder.getId());
 }
 if(!p.getProperty('HAAS_SUBMISSION_SECRET')){
  p.setProperty('HAAS_SUBMISSION_SECRET',Utilities.getUuid()+Utilities.getUuid());
 }
 Logger.log('Sheet: https://docs.google.com/spreadsheets/d/'+p.getProperty('HAAS_SHEET_ID')+'/edit');
 Logger.log('Folder: https://drive.google.com/drive/folders/'+p.getProperty('HAAS_PHOTO_FOLDER_ID'));
 // Never log or publish the submission secret.
}
function formSchema_(){
 return FormApp.openById(FORM_ID).getItems().map(item=>{
  const type=item.getType();const q={id:String(item.getId()),title:item.getTitle(),type:String(type),required:false,options:[]};
  const methods={TEXT:'asTextItem',PARAGRAPH_TEXT:'asParagraphTextItem',MULTIPLE_CHOICE:'asMultipleChoiceItem',CHECKBOX:'asCheckboxItem',LIST:'asListItem',DATE:'asDateItem',FILE_UPLOAD:'asFileUploadItem'};
  const method=methods[String(type)];
  if(method&&typeof item[method]==='function'){
   const obj=item[method]();
   if(typeof obj.isRequired==='function')q.required=obj.isRequired();
   if(typeof obj.getChoices==='function')q.options=obj.getChoices().map(c=>c.getValue());
  }
  return q;
 });
}
function doGet(){
 return ContentService.createTextOutput(JSON.stringify({title:FormApp.openById(FORM_ID).getTitle(),questions:formSchema_()})).setMimeType(ContentService.MimeType.JSON);
}
// Keep one stable column per Form item ID, using human-readable question titles.
// Existing answers remain mapped correctly if a question is renamed or reordered.
function websiteColumns_(sheet,schema){
 const base=['Received at','Application ID','Answers JSON','Photo URL'];
 const last=Math.max(sheet.getLastColumn(),4);
 const headers=sheet.getRange(1,1,1,last).getValues()[0];
 const ids=schema.filter(q=>q.type!=='FILE_UPLOAD').map(q=>q.id);
 const names=new Map(schema.map(q=>[q.id,q.title]));
 const columns={};
 for(let i=4;i<headers.length;i++){
  const match=String(headers[i]||'').match(/\\[ID: (\\d+)\\]$/);
  if(match)columns[match[1]]=i+1;
 }
 let next=Math.max(headers.length,4)+1;
 for(const id of ids){
  if(!columns[id]){columns[id]=next++;}
  sheet.getRange(1,columns[id]).setValue(names.get(id)+' [ID: '+id+']');
 }
 return columns;
}
// Run once after deployment to expand legacy JSON rows without losing source data.
function migrateWebsiteApplications(){
 const sheet=SpreadsheetApp.openById(EXISTING_SHEET_ID).getSheetByName(WEBSITE_TAB);
 if(!sheet)throw Error('Website Applications tab not initialized');
 const schema=formSchema_();
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const columns=websiteColumns_(sheet,schema);
  const count=sheet.getLastRow();
  for(let row=2;row<=count;row++){
   const raw=sheet.getRange(row,3).getValue();if(!raw)continue;
   let answers;try{answers=JSON.parse(raw)}catch(e){continue}
   for(const [id,col] of Object.entries(columns)){
    const value=answers[id];
    if(value===undefined||value===null)continue;
    sheet.getRange(row,col).setValue(Array.isArray(value)?value.join(', '):String(value));
   }
  }
 }finally{lock.releaseLock()}
}
function doPost(e){
 const output=obj=>ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
 try{
  const p=PropertiesService.getScriptProperties();
  const data=JSON.parse(e.postData.contents);
  if(!p.getProperty('HAAS_SUBMISSION_SECRET')||data.secret!==p.getProperty('HAAS_SUBMISSION_SECRET'))return output({ok:false,error:'Unauthorized'});
  const answers=data.application?.answers;
  if(!answers||typeof answers!=='object'||Array.isArray(answers))return output({ok:false,error:'Invalid answers'});
  const schema=formSchema_();const known=new Set(schema.filter(q=>q.type!=='FILE_UPLOAD').map(q=>q.id));
  if(Object.keys(answers).some(k=>!known.has(k)))return output({ok:false,error:'Form changed. Refresh and retry.'});
  for(const q of schema){
   const a=answers[q.id],values=Array.isArray(a)?a:[a];
   if(q.required&&q.type!=='FILE_UPLOAD'&&(!values.length||values.every(v=>!String(v||'').trim())))return output({ok:false,error:'Missing required answer: '+q.title});
   if(q.options.length&&values.some(v=>v!=null&&v!==''&&!q.options.includes(String(v))))return output({ok:false,error:'Invalid option: '+q.title});
  }
  const photo=data.application?.photo;
  if(!photo||!/^image\/(jpeg|png|webp)$/.test(photo.type)||typeof photo.data!=='string'||photo.data.length>4200000)return output({ok:false,error:'Valid photo under 3 MB required'});
  const bytes=Utilities.base64Decode(photo.data);
  if(bytes.length>3*1024*1024)return output({ok:false,error:'Photo exceeds 3 MB'});
  const id=Utilities.getUuid(),ext=photo.type==='image/png'?'png':photo.type==='image/webp'?'webp':'jpg';
  const folder=DriveApp.getFolderById(p.getProperty('HAAS_PHOTO_FOLDER_ID'));
  const file=folder.createFile(Utilities.newBlob(bytes,photo.type,id+'.'+ext));
  const sheet=SpreadsheetApp.openById(EXISTING_SHEET_ID).getSheetByName(WEBSITE_TAB);
  if(!sheet)throw Error('Website Applications tab not initialized');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
   const columns=websiteColumns_(sheet,schema);
   const row=new Array(Math.max(4,...Object.values(columns))).fill('');
   row[0]=new Date();row[1]=id;row[2]=JSON.stringify(answers);row[3]=file.getUrl();
   for(const [questionId,column] of Object.entries(columns)){
    const value=answers[questionId];
    if(value!==undefined&&value!==null)row[column-1]=Array.isArray(value)?value.join(', '):String(value);
   }
   sheet.appendRow(row);
  }finally{lock.releaseLock()}
  return output({ok:true,applicationId:id});
 }catch(err){console.error(err);return output({ok:false,error:'Submission could not be confirmed'});}
}
