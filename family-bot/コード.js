const TARGET = {
  sheetId: PropertiesService.getScriptProperties().getProperty("SHEET_ID"),
  worksheetName: "精算",
  calendarId: PropertiesService.getScriptProperties().getProperty("CALENDAR_ID")
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

// 時間指定 (分単位) 例: 8/1、1830、予定名 -> 18:30-19:30
function testCalendarTimedMinute() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"8/1、1830、焼肉"},source:{type:"user",userId:"TEST"}}]
  })}};
  doPost(e);
}

// 時間指定 (分単位・範囲) 例: 8/1、1830-2015、予定名
function testCalendarTimedMinuteRange() {
  const e = {postData:{contents:JSON.stringify({
    events:[{message:{type:"text",text:"8/1、1830-2015、焼肉"},source:{type:"user",userId:"TEST"}}]
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
    const start=new Date(base.getFullYear(),base.getMonth(),base.getDate(),m.startHour,m.startMinute);
    const end=new Date(base.getFullYear(),base.getMonth(),base.getDate(),m.endHour,m.endMinute);
    cal.createEvent(m.title,start,end);
  }
}