import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { splitFields, parseExpense, parseCalendar, parseText, resolveDate } from "./parser.js";

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
});

describe("parseText", () => {
  it("家計簿として解釈できればexpenseを返す", () => {
    expect(parseText("昼食、1200")).toEqual({ type: "expense", what: "昼食", howMuch: 1200 });
  });

  it("家計簿として解釈できなければcalendarとして解釈する", () => {
    expect(parseText("8/1、旅行")).toEqual({
      type: "calendar", allDay: true, month: 8, startDay: 1, endDay: 1, title: "旅行",
    });
  });

  it("どちらでも解釈できなければnull", () => {
    expect(parseText("よくわからないテキスト")).toBeNull();
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
