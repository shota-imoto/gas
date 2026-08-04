const TARGET = {
  sheetId: "REDACTED_SHEET_ID",
  worksheetName: "精算",
  calendarId: "REDACTED_CALENDAR_ID"
};

// ===== テスト =====

// 家計簿
function testExpense() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"昼食、1200"},source:{type:"user",userId:"TEST"}}]
  })}};
  doPost(e);
}

// 終日 (単日) 例: 8/1、予定名
function testCalendarAllDaySingle() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"8/1、旅行"},source:{type:"user",userId:"TEST"}}]
  })}};
  doPost(e);
}

// 終日 (複数日) 例: 8/1-3、予定名
function testCalendarAllDayMulti() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"8/1-3、旅行"},source:{type:"user",userId:"TEST"}}]
  })}};
  doPost(e);
}

// 時間指定 (1時間) 例: 8/1、18、予定名 -> 18:00-19:00
function testCalendarTimedSingleHour() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"8/1、18、焼肉"},source:{type:"user",userId:"TEST"}}]
  })}};
  doPost(e);
}

// 時間指定 (範囲) 例: 8/1、18-20、予定名 -> 18:00-20:00
function testCalendarTimedRange() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"8/1、18-20、焼肉"},source:{type:"user",userId:"TEST"}}]
  })}};
  doPost(e);
}

// 区切り文字にカンマ・スペースを使った例
function testCalendarAltDelimiters() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"8/1, 18-20, 焼肉"},source:{type:"user",userId:"TEST"}}]
  })}};
  doPost(e);
}

function doPost(e){
  const content=parseContents(e.postData.contents);
  if(!content)return;
  switch(content.message.type){
    case "expense": saveExpense(content); break;
    case "calendar": saveCalendar(content); break;
  }
}

function parseContents(json){
  const p=JSON.parse(json);
  if(p.events.length!==1)return null;
  const e=p.events[0];
  if(!e.message||e.message.type!=="text")return null;
  const m=parseText(e.message.text);
  if(!m)return null;
  return {message:m,userId:e.source.userId};
}

function parseText(text){
  return parseExpense(text) ?? parseCalendar(text);
}

/**
 * 区切り文字として 、 , ， および全角/半角スペースを許容してsplitする。
 * 連続した区切り文字はまとめて1つの区切りとして扱う(空要素は生成しない)。
 */
function splitFields(text){
  return text.split(/[、,，\s]+/).filter(s=>s.length>0);
}

function parseExpense(text){
  const s=splitFields(text);
  if(s.length!==2)return null;
  if(!/^\d+$/.test(s[1]))return null;
  return {type:"expense",what:s[0],howMuch:Number(s[1])};
}

/**
 * 新フォーマット:
 *  - 8/1、予定名          -> 終日 (単日)
 *  - 8/1-3、予定名        -> 終日 (複数日)
 *  - 8/1、18、予定名      -> 18:00-19:00 (1時間)
 *  - 8/1、18-20、予定名   -> 18:00-20:00
 */
function parseCalendar(text){
  const s=splitFields(text);

  // 終日パターン: 日付、予定名
  if(s.length===2){
    const [datePart,title]=s;
    const dm=datePart.match(/^(\d{1,2})\/(\d{1,2})(?:-(\d{1,2}))?$/);
    if(!dm)return null;
    const month=Number(dm[1]);
    const startDay=Number(dm[2]);
    const endDay=dm[3]?Number(dm[3]):startDay;
    if(!title)return null;
    return {type:"calendar",allDay:true,month,startDay,endDay,title};
  }

  // 時間指定パターン: 日付、時刻、予定名
  if(s.length===3){
    const [datePart,hourPart,title]=s;
    const dm=datePart.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(!dm)return null;
    const month=Number(dm[1]);
    const day=Number(dm[2]);

    const hm=hourPart.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if(!hm)return null;
    const startHour=Number(hm[1]);
    const endHour=hm[2]?Number(hm[2]):startHour+1;
    if(!title)return null;

    return {type:"calendar",allDay:false,month,day,startHour,endHour,title};
  }

  return null;
}

function saveExpense(content){
  const sh=SpreadsheetApp.openById(TARGET.sheetId).getSheetByName(TARGET.worksheetName);
  const r=sh.getLastRow()+1;
  sh.getRange(r,1).setValue(new Date());
  sh.getRange(r,2).setValue(content.message.what);
  sh.getRange(r,3).setValue(content.userId);
  sh.getRange(r,4).setValue(content.message.howMuch);
}

function saveCalendar(content){
  const m=content.message;
  const cal=CalendarApp.getCalendarById(TARGET.calendarId);

  if(m.allDay){
    const startDate=resolveDate(m.month,m.startDay);
    if(m.startDay===m.endDay){
      cal.createAllDayEvent(m.title,startDate);
    }else{
      // createAllDayEvent の終了日は「排他的」なので +1日する
      const endDateExclusive=resolveDate(m.month,m.endDay);
      endDateExclusive.setDate(endDateExclusive.getDate()+1);
      cal.createAllDayEvent(m.title,startDate,endDateExclusive);
    }
  }else{
    const base=resolveDate(m.month,m.day);
    const start=new Date(base.getFullYear(),base.getMonth(),base.getDate(),m.startHour,0);
    const end=new Date(base.getFullYear(),base.getMonth(),base.getDate(),m.endHour,0);
    cal.createEvent(m.title,start,end);
  }
}

/**
 * 年が省略されているため、今年の日付として解決する。
 * すでに今日より過去の日付になる場合は来年として扱う。
 */
function resolveDate(month,day){
  const now=new Date();
  const thisYear=now.getFullYear();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());

  let d=new Date(thisYear,month-1,day);
  if(d<today){
    d=new Date(thisYear+1,month-1,day);
  }
  return d;
}