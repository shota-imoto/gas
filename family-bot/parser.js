/**
 * GASでは複数の.jsファイルが1つのグローバルスコープを共有するため、
 * evalArithmetic(arithmetic.js)は本来importなしでそのまま呼び出せる。
 * ただしNode(vitest)実行時はファイルごとに別スコープなので、ここでrequireして
 * グローバルに登録し、GASと同じ「importなしで呼べる」状態を再現する。
 */
if(typeof module!=="undefined"&&module.exports){
  global.evalArithmetic=require("./arithmetic.js").evalArithmetic;
}

/**
 * 区切り文字として 、 , ， および全角/半角スペースを許容してsplitする。
 * 連続した区切り文字はまとめて1つの区切りとして扱う(空要素は生成しない)。
 */
function splitFields(text){
  return text.split(/[、,，\s]+/).filter(s=>s.length>0);
}

function parseExpense(text){
  return parseExpenseDetailed(text).value;
}

/**
 * parseExpenseに加え、失敗時に送信者へ表示する理由(reason)も返す。
 * 「品目、金額」のフォーマット自体は変えず、失敗理由の文言だけをここに集約する。
 */
function parseExpenseDetailed(text){
  const s=splitFields(text);
  if(s.length!==2){
    return {value:null,reason:"品目と金額を「、」で区切って書いてほちい(例: 昼食、1200)"};
  }
  const howMuch=parseExpenseAmount(s[1]);
  if(howMuch===null){
    return {value:null,reason:"金額のところが数字になってないちゅ(マイナスや「=」の数式もOK)"};
  }
  return {value:{type:"expense",what:s[0],howMuch},reason:null};
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
  return parseCalendarDetailed(text).value;
}

// parseCalendarDetailedの複数箇所で使う理由文言。文言を1箇所に集約し、表記ゆれを防ぐ。
const REASON_DATE_NOT_EXIST="その日付は存在しないちゅ";
const REASON_TITLE_MISSING="予定名も書いてほちい";
const REASON_HOUR_OUT_OF_RANGE="時刻は24時間表記(0-23時)で書いてほちい";

/**
 * parseCalendarに加え、失敗時に送信者へ表示する理由(reason)も返す。
 * フォーマット自体は変えず、失敗理由の文言だけをここに集約する。
 */
function parseCalendarDetailed(text){
  const s=splitFields(text);

  // 終日パターン: 日付、予定名
  if(s.length===2){
    const [datePart,title]=s;
    const dm=datePart.match(/^(\d{1,2})\/(\d{1,2})(?:-(\d{1,2}))?$/);
    if(!dm){
      return {value:null,reason:"日付は「8/1」や「8/1-3」の形で書いてほちい"};
    }
    const month=Number(dm[1]);
    const startDay=Number(dm[2]);
    const endDay=dm[3]?Number(dm[3]):startDay;
    if(!isValidMonthDay(month,startDay)||!isValidMonthDay(month,endDay)){
      return {value:null,reason:REASON_DATE_NOT_EXIST};
    }
    if(startDay>endDay){
      return {value:null,reason:"終日の範囲は開始日→終了日の順で書いてほちい"};
    }
    if(!title){
      return {value:null,reason:REASON_TITLE_MISSING};
    }
    // 予定名が時刻っぽい形式(例: 1645、1645-1700)の場合、時刻指定を書き忘れて
    // 終日予定になってしまっている可能性が高いため、誤登録を防ぐためにエラーとする
    if(/^\d{1,4}(-\d{1,4})?$/.test(title)){
      return {value:null,reason:"予定名が時刻っぽいから、日付・時刻・予定名の3つに分けて書いてほちい(例: 8/18、1645-1700、予定名)"};
    }
    return {value:{type:"calendar",allDay:true,month,startDay,endDay,title},reason:null};
  }

  // 時間指定パターン: 日付、時刻、予定名
  if(s.length===3){
    const [datePart,hourPart,title]=s;
    const dm=datePart.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(!dm){
      return {value:null,reason:"日付は「8/1」の形で書いてほちい"};
    }
    const month=Number(dm[1]);
    const day=Number(dm[2]);
    if(!isValidMonthDay(month,day)){
      return {value:null,reason:REASON_DATE_NOT_EXIST};
    }

    const hm=hourPart.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
    if(!hm){
      return {value:null,reason:"時刻は「18」や「18-20」の形で書いてほちい"};
    }
    const start=parseTimeToken(hm[1]);
    const end=hm[2]?parseTimeToken(hm[2]):{hour:start.hour+1,minute:start.minute};
    if(start.minute>59||end.minute>59){
      return {value:null,reason:"分は0-59の範囲で書いてほちい"};
    }
    // endは分省略時の既定値(start.hour+1)が24を跨ぐことがあるため、明示指定時のみ検証する
    if(start.hour>23||(hm[2]&&end.hour>23)){
      return {value:null,reason:REASON_HOUR_OUT_OF_RANGE};
    }
    if(hm[2]&&end.hour*60+end.minute<=start.hour*60+start.minute){
      return {value:null,reason:"終了時刻は開始時刻より後にしてほちい"};
    }
    if(!title){
      return {value:null,reason:REASON_TITLE_MISSING};
    }

    return {value:{
      type:"calendar",allDay:false,month,day,
      startHour:start.hour,startMinute:start.minute,
      endHour:end.hour,endMinute:end.minute,
      title,
    },reason:null};
  }

  return {value:null,reason:"「8/1、予定名」か「8/1、18-20、予定名」のような形で書いてほちい"};
}

/**
 * expense/calendarどちらを先に試すか(=どちらの失敗理由を優先して表示するか)を判定する。
 * 家計簿は必ず2要素(品目、金額)なので、3要素の入力は家計簿には成り得ず、常にカレンダー
 * (時間指定パターン)を先に試す。2要素の場合は、先頭要素が日付形式(M/DまたはM/D-D)かどうかで
 * 判定する(parseExpenseは先頭要素の形式を問わないため、「8/1、1200」のように予定名が数字の
 * カレンダー入力を、判定順序だけで家計簿として誤って飲み込んでしまうのを防ぐ)。
 */
function shouldTryCalendarFirst(text){
  const s=splitFields(text);
  if(s.length===3)return true;
  return s.length===2&&/^\d{1,2}\/\d{1,2}(-\d{1,2})?$/.test(s[0]);
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
  module.exports={splitFields,parseExpense,parseExpenseDetailed,parseCalendar,parseCalendarDetailed,shouldTryCalendarFirst,resolveDate,formatCalendarNotification};
}
