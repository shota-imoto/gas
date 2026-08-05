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
 * 時刻トークン(1〜4桁の数字)を{hour,minute}に変換する。
 *  - 1〜2桁: 時のみ(分は0) 例: "18" -> 18:00
 *  - 3桁: 時1桁+分2桁       例: "830" -> 8:30
 *  - 4桁: 時2桁+分2桁       例: "1830" -> 18:30
 * 分は区切り文字を使わず桁数だけで判別する(スマホでの入力しやすさのため)。
 */
function parseTimeToken(token){
  if(token.length<=2)return {hour:Number(token),minute:0};
  if(token.length===3)return {hour:Number(token.slice(0,1)),minute:Number(token.slice(1))};
  if(token.length===4)return {hour:Number(token.slice(0,2)),minute:Number(token.slice(2))};
  return null;
}

/**
 * 新フォーマット:
 *  - 8/1、予定名          -> 終日 (単日)
 *  - 8/1-3、予定名        -> 終日 (複数日)
 *  - 8/1、18、予定名      -> 18:00-19:00 (1時間)
 *  - 8/1、18-20、予定名   -> 18:00-20:00
 *  - 8/1、1830、予定名    -> 18:30-19:30 (1時間、分指定)
 *  - 8/1、1830-2015、予定名 -> 18:30-20:15
 * 分は0〜59の任意の値を許容する。
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

    const hm=hourPart.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
    if(!hm)return null;
    const start=parseTimeToken(hm[1]);
    if(!start)return null;
    const end=hm[2]?parseTimeToken(hm[2]):{hour:start.hour+1,minute:start.minute};
    if(!end)return null;
    if(start.minute>59||end.minute>59)return null;
    if(!title)return null;

    return {
      type:"calendar",allDay:false,month,day,
      startHour:start.hour,startMinute:start.minute,
      endHour:end.hour,endMinute:end.minute,
      title,
    };
  }

  return null;
}

function parseText(text){
  return parseExpense(text) ?? parseCalendar(text);
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

if(typeof module!=="undefined"&&module.exports){
  module.exports={splitFields,parseExpense,parseCalendar,parseText,resolveDate};
}
