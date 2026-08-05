// 無効: https://manager.line.biz/account/@756mjpra/setting/response で有効化できる
function doPost(e) {
  return ContentService.createTextOutput('OK');
}

const TEST_GROUP_ID = PropertiesService.getScriptProperties().getProperty('TEST_GROUP_ID');
const GROUP_ID = PropertiesService.getScriptProperties().getProperty('GROUP_ID');
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

// GASのプロパティから取ってくる。AWS Secret Managerみたいなもの。
function getLineToken() {
  return PropertiesService
    .getScriptProperties()
    .getProperty('LINE_CHANNEL_ACCESS_TOKEN');
}

function sendMonthlyBandScheduleMessage() {
  const token = getLineToken();

  const now = new Date();
  // 7月をテストするため、2026年6月中に実行した扱いにする
  // const now = new Date(2026, 5, 1);
  
  const nextMonthDate = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  );

  const nextMonth = Utilities.formatDate(
    nextMonthDate,
    'Asia/Tokyo',
    'M月'
  );

  const candidateDaysText = getCandidateDaysText(nextMonthDate);

  const message = [
    'お疲れさまです🐶',
    '',
    `${nextMonth}のバンド練習日を決めたいので、`,
    '参加できる日を教えてください🐾',
    '',
    '候補日：',
    candidateDaysText
  ].join('\n');

  const response = UrlFetchApp.fetch(
    LINE_PUSH_URL,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      payload: JSON.stringify({
        to: TEST_GROUP_ID,
        messages: [
          {
            type: 'text',
            text: message,
          },
        ],
      }),
      muteHttpExceptions: true,
    }
  );

  console.log(response.getResponseCode());
  console.log(response.getContentText());
}

// 土日祝を取ってくる
function getCandidateDaysText(targetDate) {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();

  const candidates = [];

  // 土日を追加
  for (
    let d = new Date(year, month, 1);
    d.getMonth() === month;
    d.setDate(d.getDate() + 1)
  ) {
    const day = d.getDay();

    if (day === 0 || day === 6) {
      const weekday = day === 0 ? '日' : '土';

      candidates.push({
        date: new Date(d),
        text: `${d.getMonth() + 1}/${d.getDate()}(${weekday})`,
      });
    }
  }

  // 祝日を追加
  const holidays = getJapaneseHolidays(targetDate);

  holidays.forEach(holiday => {
    const date = holiday.date;

    const alreadyExists = candidates.some(candidate =>
      isSameDate(candidate.date, date)
    );

    // 土日祝の重複を避ける
    if (!alreadyExists) {
      const weekday = getJapaneseWeekday(date);

      candidates.push({
        date,
        text: `${date.getMonth() + 1}/${date.getDate()}(${weekday}) ${holiday.name}`,
      });
    }
  });

  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());

  return candidates
    .map(candidate => candidate.text)
    .join('\n');
}

const JAPANESE_HOLIDAY_CALENDAR_ID =
  'ja.japanese#holiday@group.v.calendar.google.com';

// 日本の祝日とってくる。公式の祝日カレンダーがあるので使う
function getJapaneseHolidays(targetDate) {
  const calendar = CalendarApp.getCalendarById(
    JAPANESE_HOLIDAY_CALENDAR_ID
  );

  const start = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    1
  );

  const end = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    1
  );

  const holidays = calendar.getEvents(start, end);

  return holidays.map(event => ({
    name: event.getTitle(),
    date: event.getAllDayStartDate(),
  }));
}

function isSameDate(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function getJapaneseWeekday(date) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return weekdays[date.getDay()];
}
