const TARGET = {
  sheetId: PropertiesService.getScriptProperties().getProperty("SHEET_ID"),
  worksheetName: "精算",
  calendarId: PropertiesService.getScriptProperties().getProperty("CALENDAR_ID")
};

// ===== ユーティリティ =====

/**
 * 「精算」シートに記録済みのuserIdを重複なく一覧表示する(エディタから手動実行して実行ログを確認する用)。
 * FAMILY_MEMBERS(userId→名前のマップ)を作る際の参考として、家計簿を記録したことがあるメンバーのIDを洗い出す。
 * (家計簿を一度も記録していないメンバーは含まれない点に注意)
 */
function listKnownUserIds(){
  const sh=SpreadsheetApp.openById(TARGET.sheetId).getSheetByName(TARGET.worksheetName);
  const lastRow=sh.getLastRow();
  if(lastRow<1){
    Logger.log("記録なし");
    return;
  }
  const userIds=sh.getRange(1,3,lastRow,1).getValues().flat().filter(v=>v!=="");
  const uniqueIds=[...new Set(userIds)];
  Logger.log(uniqueIds);
}

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

/**
 * 入力形式が正しくない場合や保存処理に失敗した場合、送信者本人にLINEで返信する。
 * 家計簿・カレンダーどちらも登録が成功した場合、登録できたことが送信者本人に伝わるよう返信する。
 * 複数イベントの一括通知やWebhook検証イベント(events:[])、テキスト以外のメッセージは
 * 対象外とし、これまで通り何もしない(返信先が曖昧なため)。
 */
function doPost(e){
  const p=JSON.parse(e.postData.contents);
  if(p.events.length!==1)return;
  const ev=p.events[0];
  if(!ev.message||ev.message.type!=="text")return;

  const replyToken=ev.replyToken;
  const userId=ev.source.userId;
  const m=parseText(ev.message.text);
  if(!m){
    replyLineMessage(replyToken,"入力間違いあるから見直ちて！");
    return;
  }

  const content={message:m,userId};
  try{
    switch(m.type){
      case "expense": saveExpense(content); break;
      case "calendar": handleCalendar(content); break;
    }
    replyLineMessage(replyToken,"ぱぱぱぱ");
  }catch(err){
    console.error(`保存処理でエラーが発生しました (userId=${userId}): ${err}`);
    replyLineMessage(replyToken,"書き込みにしっぱい😔入力は正しいから、開発側の調査が必要ちゅ🤔");
  }
}

function saveExpense(content){
  const sh=SpreadsheetApp.openById(TARGET.sheetId).getSheetByName(TARGET.worksheetName);
  const r=sh.getLastRow()+1;
  sh.getRange(r,1).setValue(new Date());
  sh.getRange(r,2).setValue(content.message.what);
  sh.getRange(r,3).setValue(content.userId);
  sh.getRange(r,4).setValue(content.message.howMuch);
}

/**
 * @typedef {Object} CalendarContent
 * @property {{type:"calendar", allDay:boolean, month:number, title:string, day?:number, startDay?:number, endDay?:number, startHour?:number, startMinute?:number, endHour?:number, endMinute?:number}} message
 *   parseCalendar()が返す構造。allDayの場合はstartDay/endDayを、時間指定の場合はday/startHour/startMinute/endHour/endMinuteを持つ。
 * @property {string} userId
 */

/**
 * カレンダー予定をスプレッドシートに保存し、追加した本人以外の家族メンバーへLINE通知する。
 * 通知(notifyOtherFamilyMembers)の失敗は保存自体の失敗と区別するためここで握りつぶし、
 * ログにのみ残す(呼び出し元のtry/catchで「保存に失敗しました」と誤って返信されないようにする)。
 * @param {CalendarContent} content
 */
function handleCalendar(content){
  saveCalendar(content);
  try{
    notifyOtherFamilyMembers(content);
  }catch(err){
    console.error(`家族への通知処理でエラーが発生しました (userId=${content.userId}): ${err}`);
  }
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

/**
 * カレンダー予定を追加した本人以外の家族メンバーに、LINEのpush messageで通知する。
 * 送信者の表示名はLINEのプロフィールではなく、FAMILY_MEMBERSに登録した名前を使う。
 * LINE_CHANNEL_ACCESS_TOKEN / FAMILY_MEMBERS が未設定の場合は何もしない
 * (Script Propertiesが未設定でも既存の記録機能自体は壊れないようにするため)。
 * @param {CalendarContent} content
 */
function notifyOtherFamilyMembers(content){
  const token=getLineChannelAccessToken();
  const membersJson=PropertiesService.getScriptProperties().getProperty("FAMILY_MEMBERS");
  if(!token||!membersJson)return;

  const members=JSON.parse(membersJson); // {"userId":"名前", ...}
  const senderName=members[content.userId]??null;
  const targetIds=Object.keys(members).filter(id=>id!==content.userId);
  if(targetIds.length===0)return;

  const text=formatCalendarNotification(content.message,senderName);

  targetIds.forEach(to=>pushLineMessage(to,text,token));
}

function getLineChannelAccessToken(){
  return PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
}

/**
 * LINEのpush message APIを呼び出す。
 * トークンが無効等でリクエスト自体は成功してもAPIがエラーを返すことがあるため、
 * レスポンスコードを確認し、失敗時はStackdriverにエラーとして記録する
 * (トークンなど機密情報はログに出力しない)。
 */
function pushLineMessage(to,text,token){
  const res=UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push",{
    method:"post",
    contentType:"application/json",
    headers:{Authorization:`Bearer ${token}`},
    payload:JSON.stringify({to,messages:[{type:"text",text}]}),
    muteHttpExceptions:true,
  });
  const code=res.getResponseCode();
  if(code<200||code>=300){
    console.error(`LINE通知の送信に失敗しました (to=${to}, status=${code}): ${res.getContentText()}`);
  }
}

/**
 * LINEのreply message APIを呼び出し、送信者本人にメッセージを返信する。
 * LINE_CHANNEL_ACCESS_TOKENが未設定、またはreplyTokenが無い場合(テスト実行など)は何もしない。
 */
function replyLineMessage(replyToken,text){
  const token=getLineChannelAccessToken();
  if(!token||!replyToken)return;

  const res=UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply",{
    method:"post",
    contentType:"application/json",
    headers:{Authorization:`Bearer ${token}`},
    payload:JSON.stringify({replyToken,messages:[{type:"text",text}]}),
    muteHttpExceptions:true,
  });
  const code=res.getResponseCode();
  if(code<200||code>=300){
    console.error(`LINE返信の送信に失敗しました (status=${code}): ${res.getContentText()}`);
  }
}