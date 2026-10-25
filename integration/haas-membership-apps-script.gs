/*
 HAAS membership bridge (deployment template, NOT active until configured).
 This records website applications in a private Google Sheet and uploads
 applicant photos to a private Drive folder. It does NOT create native
 Google Forms responses, because Apps Script cannot programmatically
 populate a Google Forms file-upload answer.
*/
const FORM_ID='10Skxo8Tc5EqfZsQRbfgHfNwAhOlcm9EYmPCuPclIPTE';
function setupHAAS(){
 const p=PropertiesService.getScriptProperties();
 if(!p.getProperty('HAAS_SHEET_ID')){
  const sheet=SpreadsheetApp.create('HAAS Website Membership Applications');
  p.setProperty('HAAS_SHEET_ID',sheet.getId());
  sheet.getSheets()[0].appendRow(['Received at','Application ID','Answers JSON','Photo URL']);
 }
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
function doPost(e){
 const output=obj=>ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
 try{
  const p=PropertiesService.getScriptProperties();
  const data=JSON.parse(e.postData.contents);
  if(!p.getProperty('HAAS_SUBMISSION_SECRET')||data.secret!==p.getProperty('HAAS_SUBMISSION_SECRET'))return output({ok:false,error:'Unauthorized'});
  const answers=data.application?.answers;
  if(!answers||typeof answers!=='object'||Array.isArray(answers))return output({ok:false,error:'Invalid answers'});
  const schema=formSchema_();const known=new Set(schema.map(q=>q.id));
  if(Object.keys(answers).some(k=>!known.has(k)))return output({ok:false,error:'Form changed. Refresh and retry.'});
  for(const q of schema){
   const a=answers[q.id],values=Array.isArray(a)?a:[a];
   if(q.required&&(!values.length||values.every(v=>!String(v||'').trim())))return output({ok:false,error:'Missing required answer: '+q.title});
   if(q.options.length&&values.some(v=>v!=null&&v!==''&&!q.options.includes(String(v))))return output({ok:false,error:'Invalid option: '+q.title});
  }
  const photo=data.application?.photo;
  if(!photo||!/^image\/(jpeg|png|webp)$/.test(photo.type)||typeof photo.data!=='string'||photo.data.length>4200000)return output({ok:false,error:'Valid photo under 3 MB required'});
  const bytes=Utilities.base64Decode(photo.data);
  if(bytes.length>3*1024*1024)return output({ok:false,error:'Photo exceeds 3 MB'});
  const id=Utilities.getUuid(),ext=photo.type==='image/png'?'png':photo.type==='image/webp'?'webp':'jpg';
  const folder=DriveApp.getFolderById(p.getProperty('HAAS_PHOTO_FOLDER_ID'));
  const file=folder.createFile(Utilities.newBlob(bytes,photo.type,id+'.'+ext));
  const sheet=SpreadsheetApp.openById(p.getProperty('HAAS_SHEET_ID')).getSheets()[0];
  sheet.appendRow([new Date(),id,JSON.stringify(answers),file.getUrl()]);
  return output({ok:true,applicationId:id});
 }catch(err){console.error(err);return output({ok:false,error:'Submission could not be confirmed'});}
}
