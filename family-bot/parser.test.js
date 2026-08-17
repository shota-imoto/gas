import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { splitFields, parseExpense, parseCalendar, parseCalendarDetailed, shouldTryCalendarFirst, resolveDate, formatCalendarNotification } from "./parser.js";

describe("splitFields", () => {
  it("全角読点で区切る", () => {
    expect(splitFields("8/1、旅行")).toEqual(["8/1", "旅行"]);
  });

  it("カンマ・全角カンマ・スペースでも区切る", () => {
    expect(splitFields("8/1, 18-20, 焼肉")).toEqual(["8/1", "18-20", "焼肉"]);
    expect(splitFields("8/1，18-20，焼肉")).toEqual(["8/1", "18-20", "焼肉"]);
    expect(splitFields("8/1 18-20 焼肉")).toEqual(["8/1", "18-20", "焼肉"]);
  });

  it("連続する区切り文字は1つとして扱う", () => {
    expect(splitFields("8/1、、旅行")).toEqual(["8/1", "旅行"]);
  });
});

describe("parseExpense", () => {
  it("「何、金額」を家計簿として解釈する", () => {
    expect(parseExpense("昼食、1200")).toEqual({ type: "expense", what: "昼食", howMuch: 1200 });
  });

  it("金額が数値でなければnull", () => {
    expect(parseExpense("昼食、abc")).toBeNull();
  });

  it("マイナス金額(相殺)も家計簿として解釈する", () => {
    expect(parseExpense("精算、-1200")).toEqual({ type: "expense", what: "精算", howMuch: -1200 });
  });

  it("「=」始まりは四則演算の数式として評価する", () => {
    expect(parseExpense("精算、=-2500*2")).toEqual({ type: "expense", what: "精算", howMuch: -5000 });
    expect(parseExpense("精算、=(100+200)*3")).toEqual({ type: "expense", what: "精算", howMuch: 900 });
    expect(parseExpense("精算、=1000-300")).toEqual({ type: "expense", what: "精算", howMuch: 700 });
  });

  it("数式の評価結果が整数でなければnull", () => {
    expect(parseExpense("精算、=2500/3")).toBeNull();
  });

  it("数式に数字・演算子・丸括弧以外が含まれればnull", () => {
    expect(parseExpense("精算、=SUM(1,2)")).toBeNull();
    expect(parseExpense("精算、=1+")).toBeNull();
    expect(parseExpense("精算、=")).toBeNull();
  });

  it("フィールド数が2でなければnull", () => {
    expect(parseExpense("昼食")).toBeNull();
    expect(parseExpense("昼食、1200、追加")).toBeNull();
  });
});

describe("parseCalendar", () => {
  it("終日(単日): 8/1、旅行", () => {
    expect(parseCalendar("8/1、旅行")).toEqual({
      type: "calendar", allDay: true, month: 8, startDay: 1, endDay: 1, title: "旅行",
    });
  });

  it("終日(複数日): 8/1-3、旅行", () => {
    expect(parseCalendar("8/1-3、旅行")).toEqual({
      type: "calendar", allDay: true, month: 8, startDay: 1, endDay: 3, title: "旅行",
    });
  });

  it("時間指定(1時間): 8/1、18、焼肉 -> 18:00-19:00", () => {
    expect(parseCalendar("8/1、18、焼肉")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 18, startMinute: 0, endHour: 19, endMinute: 0, title: "焼肉",
    });
  });

  it("時間指定(範囲): 8/1、18-20、焼肉 -> 18:00-20:00", () => {
    expect(parseCalendar("8/1、18-20、焼肉")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 18, startMinute: 0, endHour: 20, endMinute: 0, title: "焼肉",
    });
  });

  it("区切り文字にカンマ・スペースを使っても解釈できる", () => {
    expect(parseCalendar("8/1, 18-20, 焼肉")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 18, startMinute: 0, endHour: 20, endMinute: 0, title: "焼肉",
    });
  });

  it("日付形式が不正ならnull", () => {
    expect(parseCalendar("8月1日、旅行")).toBeNull();
  });

  it("時刻にコロン区切り(16:45-17:00)を使うとnull", () => {
    expect(parseCalendar("8/18,16:45-17:00,テスト")).toBeNull();
  });

  it("時刻にコロン区切りを使った場合、時刻フォーマットの理由が返る(家計簿の理由に化けない)", () => {
    expect(parseCalendarDetailed("8/18,16:45-17:00,テスト").reason).toBe(
      "時刻は「18」や「18-20」の形で書いてほちい"
    );
  });

  it("終日パターンで予定名を書き忘れ、時刻っぽい文字列がそのまま予定名になった場合はnull", () => {
    expect(parseCalendar("8/18,1645-1700")).toBeNull();
    expect(parseCalendar("8/18、1645")).toBeNull();
  });

  it("分指定(3桁・1時間): 8/1、830、焼肉 -> 8:30-9:30", () => {
    expect(parseCalendar("8/1、830、焼肉")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 8, startMinute: 30, endHour: 9, endMinute: 30, title: "焼肉",
    });
  });

  it("分指定(4桁・1時間): 8/1、1830、焼肉 -> 18:30-19:30", () => {
    expect(parseCalendar("8/1、1830、焼肉")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 18, startMinute: 30, endHour: 19, endMinute: 30, title: "焼肉",
    });
  });

  it("分指定(範囲): 8/1、1830-2015、焼肉 -> 18:30-20:15", () => {
    expect(parseCalendar("8/1、1830-2015、焼肉")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 18, startMinute: 30, endHour: 20, endMinute: 15, title: "焼肉",
    });
  });

  it("開始のみ分指定、終了は時のみ: 8/1、1830-20、焼肉 -> 18:30-20:00", () => {
    expect(parseCalendar("8/1、1830-20、焼肉")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 18, startMinute: 30, endHour: 20, endMinute: 0, title: "焼肉",
    });
  });

  it("60分以上はnull", () => {
    expect(parseCalendar("8/1、1899、焼肉")).toBeNull();
    expect(parseCalendar("8/1、1800-2099、焼肉")).toBeNull();
  });

  it("存在しない月はnull", () => {
    expect(parseCalendar("13/1、旅行")).toBeNull();
  });

  it("存在しない日はnull", () => {
    expect(parseCalendar("8/32、旅行")).toBeNull();
    expect(parseCalendar("2/30、旅行")).toBeNull();
  });

  it("複数日の終日で開始日が終了日より後ならnull", () => {
    expect(parseCalendar("8/5-3、旅行")).toBeNull();
  });

  it("24時以上の時刻はnull", () => {
    expect(parseCalendar("8/1、24、焼肉")).toBeNull();
    expect(parseCalendar("8/1、18-25、焼肉")).toBeNull();
  });

  it("分省略時の終了時刻が24時を跨ぐのは許容する(23時->翌0時)", () => {
    expect(parseCalendar("8/1、23、飲み会")).toEqual({
      type: "calendar", allDay: false, month: 8, day: 1,
      startHour: 23, startMinute: 0, endHour: 24, endMinute: 0, title: "飲み会",
    });
  });

  it("時間指定で終了が開始以前ならnull", () => {
    expect(parseCalendar("8/1、20-18、焼肉")).toBeNull();
    expect(parseCalendar("8/1、18-18、焼肉")).toBeNull();
  });
});

describe("shouldTryCalendarFirst", () => {
  it("2要素で先頭要素が日付形式(M/D)ならtrue", () => {
    expect(shouldTryCalendarFirst("8/1、1200")).toBe(true);
    expect(shouldTryCalendarFirst("8/1、旅行")).toBe(true);
  });

  it("2要素で先頭要素が日付形式(M/D-D)でもtrue", () => {
    expect(shouldTryCalendarFirst("8/1-3、旅行")).toBe(true);
  });

  it("2要素で先頭要素が日付形式でなければfalse", () => {
    expect(shouldTryCalendarFirst("昼食、1200")).toBe(false);
  });

  it("3要素なら常にtrue(家計簿は必ず2要素なので3要素は家計簿になり得ない)", () => {
    expect(shouldTryCalendarFirst("8/1、18、焼肉")).toBe(true);
    expect(shouldTryCalendarFirst("8/18,16:45-17:00,テスト")).toBe(true);
  });

  it("要素数が2でも3でもなければfalse", () => {
    expect(shouldTryCalendarFirst("よくわからないテキスト")).toBe(false);
  });
});

describe("resolveDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("今日以降の日付は今年として解決する", () => {
    vi.setSystemTime(new Date(2026, 0, 1)); // 2026-01-01
    const d = resolveDate(8, 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(1);
  });

  it("今日より過去の日付は来年として解決する", () => {
    vi.setSystemTime(new Date(2026, 7, 15)); // 2026-08-15
    const d = resolveDate(8, 1);
    expect(d.getFullYear()).toBe(2027);
  });

  it("今日と同じ日付は今年として解決する", () => {
    vi.setSystemTime(new Date(2026, 7, 1)); // 2026-08-01
    const d = resolveDate(8, 1);
    expect(d.getFullYear()).toBe(2026);
  });
});

describe("formatCalendarNotification", () => {
  it("終日(単日)・送信者名ありの場合", () => {
    const m = { allDay: true, month: 8, startDay: 1, endDay: 1, title: "旅行" };
    expect(formatCalendarNotification(m, "カレン")).toBe(
      "カレンが予定をちゅいかちた！\n8/1 旅行"
    );
  });

  it("終日(複数日)の場合", () => {
    const m = { allDay: true, month: 8, startDay: 1, endDay: 3, title: "旅行" };
    expect(formatCalendarNotification(m, "カレン")).toBe(
      "カレンが予定をちゅいかちた！\n8/1-3 旅行"
    );
  });

  it("時間指定の場合", () => {
    const m = { allDay: false, month: 8, day: 1, startHour: 18, startMinute: 0, endHour: 20, endMinute: 0, title: "焼肉" };
    expect(formatCalendarNotification(m, "カレン")).toBe(
      "カレンが予定をちゅいかちた！\n8/1 18:00-20:00 焼肉"
    );
  });

  it("分指定の場合は0埋めされる", () => {
    const m = { allDay: false, month: 8, day: 1, startHour: 8, startMinute: 5, endHour: 9, endMinute: 5, title: "焼肉" };
    expect(formatCalendarNotification(m, "カレン")).toBe(
      "カレンが予定をちゅいかちた！\n8/1 08:05-09:05 焼肉"
    );
  });

  it("送信者名がnullの場合は「〇〇が」を省略する", () => {
    const m = { allDay: true, month: 8, startDay: 1, endDay: 1, title: "旅行" };
    expect(formatCalendarNotification(m, null)).toBe(
      "予定をちゅいかちた！\n8/1 旅行"
    );
  });
});
