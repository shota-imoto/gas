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
  const howMuch=parseExpenseAmount(s[1]);
  if(howMuch===null)return null;
  return {type:"expense",what:s[0],howMuch};
}

/**
 * 金額欄をパースする。
 *  - 「-1200」のように先頭に「-」を付けた整数(相殺などのマイナス金額)
 *  - 「=-2500*2」のように先頭に「=」を付けた四則演算の数式(+ - * /、丸括弧)
 * を許容する。数式はeval/Functionを使わず専用パーサーで評価するため、
 * 数字と演算子以外の文字は一切実行されない。結果が整数でない場合は無効とする(円は整数のため)。
 */
function parseExpenseAmount(token){
  if(/^-?\d+$/.test(token))return Number(token);
  if(token.startsWith("=")){
    const result=evalArithmetic(token.slice(1));
    if(result===null||!Number.isInteger(result))return null;
    return result;
  }
  return null;
}

/**
 * 数値・+ - * / ・丸括弧のみからなる四則演算の式を評価する再帰下降パーサー。
 * 対応外の文字が含まれる場合や、構文として不正な場合はnullを返す。
 */
function evalArithmetic(expr){
  if(!/^[-+*/().\d\s]+$/.test(expr))return null;

  let i=0;
  const skipSpace=()=>{ while(expr[i]===" ")i++; };

  function parseNumber(){
    skipSpace();
    const start=i;
    while(i<expr.length&&/\d/.test(expr[i]))i++;
    if(i===start)return null;
    return Number(expr.slice(start,i));
  }

  function parseFactor(){
    skipSpace();
    if(expr[i]==="("){
      i++;
      const v=parseExpr();
      skipSpace();
      if(v===null||expr[i]!==")")return null;
      i++;
      return v;
    }
    if(expr[i]==="-"){
      i++;
      const v=parseFactor();
      return v===null?null:-v;
    }
    return parseNumber();
  }

  function parseTerm(){
    let v=parseFactor();
    if(v===null)return null;
    for(;;){
      skipSpace();
      if(expr[i]==="*"||expr[i]==="/"){
        const op=expr[i];i++;
        const rhs=parseFactor();
        if(rhs===null)return null;
        v=op==="*"?v*rhs:v/rhs;
      }else break;
    }
    return v;
  }

  function parseExpr(){
    let v=parseTerm();
    if(v===null)return null;
    for(;;){
      skipSpace();
      if(expr[i]==="+"||expr[i]==="-"){
        const op=expr[i];i++;
        const rhs=parseTerm();
        if(rhs===null)return null;
        v=op==="+"?v+rhs:v-rhs;
      }else break;
    }
    return v;
  }

  const result=parseExpr();
  skipSpace();
  if(result===null||i!==expr.length)return null;
  return result;
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
    if(!isValidMonthDay(month,startDay))return null;
    if(!isValidMonthDay(month,endDay))return null;
    if(startDay>endDay)return null;
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
    if(!isValidMonthDay(month,day))return null;

    const hm=hourPart.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
    if(!hm)return null;
    const start=parseTimeToken(hm[1]);
    if(!start)return null;
    const end=hm[2]?parseTimeToken(hm[2]):{hour:start.hour+1,minute:start.minute};
    if(!end)return null;
    if(start.minute>59||end.minute>59)return null;
    if(start.hour>23)return null;
    // endは分省略時の既定値(start.hour+1)が24を跨ぐことがあるため、明示指定時のみ検証する
    if(hm[2]){
      if(end.hour>23)return null;
      if(end.hour*60+end.minute<=start.hour*60+start.minute)return null;
    }
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

/**
 * 「日付、数字」の2要素は、日付形式が先頭に来ているなら家計簿ではなくカレンダーとして扱う。
 * (parseExpenseは先頭要素の形式を問わないため、「8/1、1200」のように予定名が数字の
 * カレンダー入力を、判定順序だけで家計簿として誤って飲み込んでしまうのを防ぐ)
 */
function parseText(text){
  const s=splitFields(text);
  if(s.length===2&&/^\d{1,2}\/\d{1,2}(-\d{1,2})?$/.test(s[0])){
    return parseCalendar(text);
  }
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

function pad2(n){
  return String(n).padStart(2,"0");
}

/**
 * 実在する月日かどうかを判定する(例: 13/1, 2/30, うるう年でない年の2/29など)。
 * Dateコンストラクタは不正な値を自動的に繰り上げてしまう(例: 2/30→3/2)ため、
 * resolveDateの結果を元の値と突き合わせて検証する。
 */
function isValidMonthDay(month,day){
  if(month<1||month>12||day<1||day>31)return false;
  const d=resolveDate(month,day);
  return d.getMonth()+1===month&&d.getDate()===day;
}

/**
 * カレンダー予定追加の通知メッセージ本文を組み立てる(GAS API非依存の純粋関数)。
 * senderNameが取得できなかった場合(null等)は「〇〇が」を省略する。
 */
function formatCalendarNotification(m,senderName){
  const dateLabel=m.allDay
    ?(m.startDay===m.endDay?`${m.month}/${m.startDay}`:`${m.month}/${m.startDay}-${m.endDay}`)
    :`${m.month}/${m.day}`;
  const timeLabel=m.allDay?"":` ${pad2(m.startHour)}:${pad2(m.startMinute)}-${pad2(m.endHour)}:${pad2(m.endMinute)}`;
  const who=senderName?`${senderName}が`:"";
  return `${who}予定をちゅいかちた！\n${dateLabel}${timeLabel} ${m.title}`;
}

if(typeof module!=="undefined"&&module.exports){
  module.exports={splitFields,parseExpense,parseCalendar,parseText,resolveDate,formatCalendarNotification};
}
