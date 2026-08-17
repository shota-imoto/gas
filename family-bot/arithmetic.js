/**
 * 数値・+ - * / ・丸括弧のみからなる四則演算の式を評価する再帰下降パーサー。
 * eval/Functionコンストラクタは使わず、対応する文字種だけを解釈することで
 * 任意コード実行を防いでいる(parser.jsのparseExpenseAmountから、家計簿の
 * 「=」始まりの数式入力を評価するために使われる)。
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

if(typeof module!=="undefined"&&module.exports){
  module.exports={evalArithmetic};
}
