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
