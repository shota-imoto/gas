const TARGET = {
  sheetId: PropertiesService.getScriptProperties().getProperty("SHEET_ID"),
  worksheetName: "精算",
  calendarId:
    PropertiesService.getScriptProperties().getProperty("CALENDAR_ID"),
};

// LINE_CHANNEL_ACCESS_TOKENは複数の関数から参照するため、スクリプト読み込み時に一度だけ取得しておく
const LINE_CHANNEL_ACCESS_TOKEN =
  PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );

// ===== ユーティリティ =====

/**
 * 「精算」シートに記録済みのuserIdを重複なく一覧表示する(エディタから手動実行して実行ログを確認する用)。
 * FAMILY_MEMBERS(userId→名前のマップ)を作る際の参考として、家計簿を記録したことがあるメンバーのIDを洗い出す。
 * (家計簿を一度も記録していないメンバーは含まれない点に注意)
 */
function listKnownUserIds() {
  const sh = SpreadsheetApp.openById(TARGET.sheetId).getSheetByName(
    TARGET.worksheetName,
  );
  const lastRow = sh.getLastRow();
  if (lastRow < 1) {
    Logger.log("記録なし");
    return;
  }
  const userIds = sh
    .getRange(1, 3, lastRow, 1)
    .getValues()
    .flat()
    .filter((v) => v !== "");
  const uniqueIds = [...new Set(userIds)];
  Logger.log(uniqueIds);
}

// ===== テスト =====

/**
 * GASエディタの関数選択ドロップダウンから個別に実行できるよう、testXxxは
 * 関数として残しつつ、中身(doPost呼び出し用のダミーイベント組み立て)はここに集約する。
 */
function testSend(text) {
  doPost({
    postData: {
      contents: JSON.stringify({
        events: [
          {
            message: { type: "text", text },
            source: { type: "user", userId: "TEST" },
          },
        ],
      }),
    },
  });
}

// 家計簿
function testExpense() {
  testSend("昼食、1200");
}

// 立替 (精算上は2倍で記録) 例: 立替、品目、金額
function testExpensePaidOnBehalf() {
  testSend("立替、シャンプー、5000");
}

// 終日 (単日) 例: 8/1、予定名
function testCalendarAllDaySingle() {
  testSend("8/1、旅行");
}

// 終日 (複数日) 例: 8/1-3、予定名
function testCalendarAllDayMulti() {
  testSend("8/1-3、旅行");
}

// 時間指定 (1時間) 例: 8/1、18、予定名 -> 18:00-19:00
function testCalendarTimedSingleHour() {
  testSend("8/1、18、焼肉");
}

// 時間指定 (範囲) 例: 8/1、18-20、予定名 -> 18:00-20:00
function testCalendarTimedRange() {
  testSend("8/1、18-20、焼肉");
}

// 時間指定 (分単位) 例: 8/1、1830、予定名 -> 18:30-19:30
function testCalendarTimedMinute() {
  testSend("8/1、1830、焼肉");
}

// 時間指定 (分単位・範囲) 例: 8/1、1830-2015、予定名
function testCalendarTimedMinuteRange() {
  testSend("8/1、1830-2015、焼肉");
}

// 区切り文字にカンマ・スペースを使った例
function testCalendarAltDelimiters() {
  testSend("8/1, 18-20, 焼肉");
}

// ヘルプ
function testHelp() {
  testSend("ヘルプ");
}

/**
 * 入力形式が正しくない場合や保存処理に失敗した場合、送信者本人にLINEで返信する。
 * 家計簿・カレンダーどちらも登録が成功した場合、登録できたことが送信者本人に伝わるよう返信する。
 * 複数イベントの一括通知やWebhook検証イベント(events:[])、テキスト以外のメッセージは
 * 対象外とし、これまで通り何もしない(返信先が曖昧なため)。
 *
 * 家計簿とカレンダーはドメインロジックが全く異なるため、共通のパーサーに通してtypeで
 * 分岐するのではなく、handleExpenseMessage/handleCalendarMessageというそれぞれ専用の
 * 関数を用意し、resolveMessageHandlerで入力に応じて実行すべき方を1つ選ぶ。
 */
function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  if (p.events.length !== 1) return;
  const ev = p.events[0];
  if (!ev.message || ev.message.type !== "text") return;

  const text = ev.message.text;
  const handle = resolveMessageHandler(text);
  handle(text, ev.source.userId, ev.replyToken);
}

/**
 * 入力テキストに対して実行すべきハンドラー関数を返す。
 * 各判定(isXxxMessage)は自分の形式の知識だけで書き、ヘルプ→カレンダー→家計簿の優先順で
 * 最初に当てはまったものを選ぶ。選んだ側のパースに失敗してももう一方の形式は試さない
 * (例: 「8/18、1645」が家計簿として誤登録されるのを防ぐ)。どれにも当てはまらなければ
 * その旨とヘルプを返信する。
 */
function resolveMessageHandler(text) {
  if (isHelpMessage(text)) return handleHelpMessage;
  if (isCalendarMessage(text)) return handleCalendarMessage;
  if (isExpenseMessage(text)) return handleExpenseMessage;
  return handleUnknownMessage;
}

/**
 * どの入力形式にも当てはまらなかった場合に、その旨と入力パターンの一覧を返信する。
 */
function handleUnknownMessage(text, userId, replyToken) {
  replyLineMessage(replyToken, formatUnknownMessage());
}

/**
 * 「ヘルプ」に対して、入力パターンの一覧を送信者本人に返信する。
 */
function handleHelpMessage(text, userId, replyToken) {
  replyLineMessage(replyToken, formatHelpMessage());
}

/**
 * テキストを家計簿としてパースし、保存・返信する。
 */
function handleExpenseMessage(text, userId, replyToken) {
  // resolveMessageHandlerがパース成功時のみ家計簿に振り分けるため通常は失敗しないが、念のため
  const { isSuccess, value: m } = parseExpenseDetailed(text);
  if (!isSuccess) {
    handleUnknownMessage(text, userId, replyToken);
    return;
  }
  const successMessage = m.isPaidOnBehalf
    ? `すぷしに立替をちゅいかできた！\n${m.paidAmount}円の立替を、精算上は${m.howMuch}円で記録したちゅ`
    : "すぷしにちゅいかできた！";
  saveAndReply({ message: m, userId }, saveExpense, successMessage, replyToken);
}

/**
 * テキストをカレンダー予定としてパースし、成功すれば保存・返信し、失敗すれば理由を返信する。
 */
function handleCalendarMessage(text, userId, replyToken) {
  const { isSuccess, value: m, reason } = parseCalendarDetailed(text);
  if (!isSuccess) {
    replyInputError(replyToken, reason);
    return;
  }
  saveAndReply(
    { message: m, userId },
    saveCalendarAndNotify,
    "予定ちゅいかできた！",
    replyToken,
  );
}

function replyInputError(replyToken, reason) {
  replyLineMessage(replyToken, `入力間違いあるから見直ちて！\n${reason}`);
}

/**
 * 保存処理を実行し、成功/失敗を送信者本人にLINEで返信する共通処理
 * (家計簿・カレンダーで保存関数と成功時の文言だけが異なるため、両方パラメータとして受け取る)。
 */
function saveAndReply(content, save, successMessage, replyToken) {
  try {
    save(content);
    replyLineMessage(replyToken, successMessage);
  } catch (err) {
    console.error(
      `保存処理でエラーが発生しました (userId=${content.userId}): ${err}`,
    );
    replyLineMessage(
      replyToken,
      "書き込みにしっぱい😔入力は正しいから、開発側の調査が必要ちゅ🤔",
    );
  }
}

function saveExpense(content) {
  const sh = SpreadsheetApp.openById(TARGET.sheetId).getSheetByName(
    TARGET.worksheetName,
  );
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1).setValue(new Date());
  sh.getRange(r, 2).setValue(content.message.what);
  sh.getRange(r, 3).setValue(content.userId);
  sh.getRange(r, 4).setValue(content.message.howMuch);
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
 * (handleCalendarMessageと名前が紛らわしくならないよう、保存+通知の実処理であることが
 * わかる名前にしている)
 * @param {CalendarContent} content
 */
function saveCalendarAndNotify(content) {
  saveCalendar(content);
  try {
    notifyOtherFamilyMembers(content);
  } catch (err) {
    console.error(
      `家族への通知処理でエラーが発生しました (userId=${content.userId}): ${err}`,
    );
  }
}

function saveCalendar(content) {
  const m = content.message;
  const cal = CalendarApp.getCalendarById(TARGET.calendarId);

  if (m.allDay) {
    const startDate = resolveDate(m.month, m.startDay);
    if (m.startDay === m.endDay) {
      cal.createAllDayEvent(m.title, startDate);
    } else {
      // createAllDayEvent の終了日は「排他的」なので +1日する
      const endDateExclusive = resolveDate(m.month, m.endDay);
      endDateExclusive.setDate(endDateExclusive.getDate() + 1);
      cal.createAllDayEvent(m.title, startDate, endDateExclusive);
    }
  } else {
    const base = resolveDate(m.month, m.day);
    const start = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      m.startHour,
      m.startMinute,
    );
    const end = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      m.endHour,
      m.endMinute,
    );
    cal.createEvent(m.title, start, end);
  }
}

/**
 * カレンダー予定を追加した本人以外の家族メンバーに、LINEのpush messageで通知する。
 * 送信者の表示名はLINEのプロフィールではなく、FAMILY_MEMBERSに登録した名前を使う。
 * LINE_CHANNEL_ACCESS_TOKEN / FAMILY_MEMBERS が未設定の場合は何もしない
 * (Script Propertiesが未設定でも既存の記録機能自体は壊れないようにするため)。
 * @param {CalendarContent} content
 */
function notifyOtherFamilyMembers(content) {
  const membersJson =
    PropertiesService.getScriptProperties().getProperty("FAMILY_MEMBERS");
  if (!LINE_CHANNEL_ACCESS_TOKEN || !membersJson) return;

  const members = JSON.parse(membersJson); // {"userId":"名前", ...}
  const senderName = members[content.userId] ?? null;
  const targetIds = Object.keys(members).filter((id) => id !== content.userId);
  if (targetIds.length === 0) return;

  const text = formatCalendarNotification(content.message, senderName);

  targetIds.forEach((to) => pushLineMessage(to, text));
}

/**
 * LINE Messaging APIを呼び出し、失敗時はStackdriverにエラーとして記録する
 * (トークンなど機密情報はログに出力しない)。push/replyで共通のHTTP呼び出し部分をまとめたもの。
 */
function callLineMessagingApi(endpoint, payload, errorLabel) {
  const res = UrlFetchApp.fetch(
    `https://api.line.me/v2/bot/message/${endpoint}`,
    {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    },
  );
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error(`${errorLabel} (status=${code}): ${res.getContentText()}`);
  }
}

/**
 * LINEのpush message APIを呼び出す(家族への通知用)。
 */
function pushLineMessage(to, text) {
  callLineMessagingApi(
    "push",
    { to, messages: [{ type: "text", text }] },
    `LINE通知の送信に失敗しました (to=${to})`,
  );
}

/**
 * LINEのreply message APIを呼び出し、送信者本人にメッセージを返信する。
 * LINE_CHANNEL_ACCESS_TOKENが未設定、またはreplyTokenが無い場合(テスト実行など)は何もしない。
 */
function replyLineMessage(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  callLineMessagingApi(
    "reply",
    { replyToken, messages: [{ type: "text", text }] },
    "LINE返信の送信に失敗しました",
  );
}
