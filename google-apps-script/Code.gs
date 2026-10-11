/**
 * HAA(S) membership submissions — install as a standalone Apps Script project
 * owned by the HAA(S) Google account. Deploy as Web App:
 * Execute as: Me; Who has access: Anyone.
 * Set Script Property: HAAS_SUBMISSION_SECRET = random 32+ character string.
 * Keep the deployment URL and secret only in Vercel environment variables.
 * The public browser must NEVER call this endpoint directly.
 */
const SHEET_ID = '1jbL7OWxnYkr_JUO3LBLAZnjibT0913J-kaAqT6JP1hA';
const SHEET_NAME = 'Form Responses 1';
const HEADERS = [
'Timestamp','Full Name','NRIC Last 4 Alphanumeric (e.g. 123A)','Date of Birth','Residential Address',
'Race','Nationality','Occupation','Employer','Marital Status','Contact Number','Email Address',
'Next of Kin','Next of Kin Contact Number (For Emergencies)',
'Purpose of Joining Horse Archery Association Singapore (HAAS)',
'Please upload any photo of yourself for identification purpose.','Work Address','Type of Membership Application'
];
function doPost(e) {
  const lock=LockService.getScriptLock();
  try {
    const body=JSON.parse(e.postData.contents);
    const expected=PropertiesService.getScriptProperties().getProperty('HAAS_SUBMISSION_SECRET');
    if (!expected || body.secret !== expected) throw Error('Unauthorized');
    const a=body.application;
    if(!a || !a.consent) throw Error('Incomplete application');
    const required=['f0','f1','f2','f3','f4','f5','f6','f7','f8','f11','f12','f13','f14','f15'];
    for(const key of required)if(!String(a[key]||'').trim())throw Error('Missing required field '+key);
    if(!a.photo || !/^image\/(jpeg|png|webp)$/.test(a.photo.type) || !a.photo.data)throw Error('Photo required');
    const bytes=Utilities.base64Decode(a.photo.data);
    if(bytes.length>3*1024*1024)throw Error('Photo too large');
    lock.waitLock(30000);
    const ss=SpreadsheetApp.openById(SHEET_ID),sheet=ss.getSheetByName(SHEET_NAME);
    if(!sheet)throw Error('Destination sheet missing');
    const folderName='HAAS Website Membership Photos';
    const props=PropertiesService.getScriptProperties();
    let folderId=props.getProperty('HAAS_PHOTO_FOLDER_ID'),folder;
    if(folderId){folder=DriveApp.getFolderById(folderId)}else{folder=DriveApp.createFolder(folderName);props.setProperty('HAAS_PHOTO_FOLDER_ID',folder.getId())}
    const photo=folder.createFile(Utilities.newBlob(bytes,a.photo.type,'membership-'+Utilities.getUuid()+'.'+(a.photo.type==='image/png'?'png':a.photo.type==='image/webp'?'webp':'jpg')));
    // Files remain private to the owner; membership officers must have folder access.
    const vals=[new Date(),a.f0,a.f2,a.f3,a.f4,a.f5,a.f6,a.f7,a.f8,a.f10,a.f11,a.f12,a.f13,a.f14,a.f15,photo.getUrl(),a.f9,a.f1];
    const header=sheet.getRange(1,1,1,HEADERS.length).getDisplayValues()[0];
    const row=header.map(h=>{const i=HEADERS.indexOf(h);return i>=0?vals[i]:''});
    sheet.appendRow(row.map(v=>typeof v==='string' && /^[=+@-]/.test(v)?("'"+v):v));
    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err.message||err)})).setMimeType(ContentService.MimeType.JSON);
  } finally {try{lock.releaseLock()}catch(_){}}
}