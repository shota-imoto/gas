import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  splitFields,
  parseExpense,
  parseExpenseDetailed,
  parseCalendar,
  parseCalendarDetailed,
  isCalendarMessage,
  isExpenseMessage,
  isHelpMessage,
  formatUnknownMessage,
  HELP_EXAMPLES,
  formatHelpMessage,
  resolveDate,
  formatCalendarNotification,
} from "./parser.js";

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
    expect(parseExpense("昼食、1200")).toEqual({
      type: "expense",
      what: "昼食",
      howMuch: 1200,
    });
  });

  it("金額が数値でなければnull", () => {
    expect(parseExpense("昼食、abc")).toBeNull();
  });

  it("マイナス金額(相殺)も家計簿として解釈する", () => {
    expect(parseExpense("精算、-1200")).toEqual({
      type: "expense",
      what: "精算",
      howMuch: -1200,
    });
  });

  it("「=」始まりは四則演算の数式として評価する", () => {
    expect(parseExpense("精算、=-2500*2")).toEqual({
      type: "expense",
      what: "精算",
      howMuch: -5000,
    });
    expect(parseExpense("精算、=(100+200)*3")).toEqual({
      type: "expense",
      what: "精算",
      howMuch: 900,
    });
    expect(parseExpense("精算、=1000-300")).toEqual({
      type: "expense",
      what: "精算",
      howMuch: 700,
    });
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

describe("parseExpenseDetailed(立替)", () => {
  it("立替は品目に「立替: 」を付け、精算上の金額を2倍で返す", () => {
    expect(parseExpenseDetailed("立替、シャンプー、5000")).toEqual({
      isSuccess: true,
      value: {
        type: "expense",
        what: "立替: シャンプー",
        howMuch: 10000,
        isAdvance: true,
        paidAmount: 5000,
      },
      reason: null,
    });
  });

  it("「立替え」「立て替え」も立替として扱う", () => {
    expect(parseExpenseDetailed("立替え、シャンプー、5000").value.howMuch).toBe(
      10000,
    );
    expect(
      parseExpenseDetailed("立て替え、シャンプー、5000").value.howMuch,
    ).toBe(10000);
  });

  it("金額に「=」の数式も使える", () => {
    expect(
      parseExpenseDetailed("立替、シャンプー、=2500*2").value.howMuch,
    ).toBe(10000);
  });

  it("要素数が足りなければ立替の書き方の理由が返る", () => {
    expect(parseExpenseDetailed("立替、5000")).toEqual({
      isSuccess: false,
      value: null,
      reason:
        "立替は「立替、品目、金額」の3つに分けて書いてほちい(例: 立替、シャンプー、5000)",
    });
  });

  it("金額が数字でなければ金額の理由が返る", () => {
    expect(parseExpenseDetailed("立替、シャンプー、abc").reason).toBe(
      "金額のところが数字になってないちゅ(マイナスや「=」の数式もOK)",
    );
  });
});

describe("parseExpenseDetailed", () => {
  it("成功時はisSuccess:trueとvalueが返る", () => {
    expect(parseExpenseDetailed("昼食、1200")).toEqual({
      isSuccess: true,
      value: { type: "expense", what: "昼食", howMuch: 1200 },
      reason: null,
    });
  });

  it("フィールド数が2でなければ、2つに分ける旨の理由が返る", () => {
    expect(parseExpenseDetailed("あ、い、う")).toEqual({
      isSuccess: false,
      value: null,
      reason: "品目と金額の2つに分けて書いてほちい(例: 昼食、1200)",
    });
  });
});

describe("parseCalendar", () => {
  it("終日(単日): 8/1、旅行", () => {
    expect(parseCalendar("8/1、旅行")).toEqual({
      type: "calendar",
      allDay: true,
      month: 8,
      startDay: 1,
      endDay: 1,
      title: "旅行",
    });
  });

  it("終日(複数日): 8/1-3、旅行", () => {
    expect(parseCalendar("8/1-3、旅行")).toEqual({
      type: "calendar",
      allDay: true,
      month: 8,
      startDay: 1,
      endDay: 3,
      title: "旅行",
    });
  });

  it("時間指定(1時間): 8/1、18、焼肉 -> 18:00-19:00", () => {
    expect(parseCalendar("8/1、18、焼肉")).toEqual({
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 18,
      startMinute: 0,
      endHour: 19,
      endMinute: 0,
      title: "焼肉",
    });
  });

  it("時間指定(範囲): 8/1、18-20、焼肉 -> 18:00-20:00", () => {
    expect(parseCalendar("8/1、18-20、焼肉")).toEqual({
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 18,
      startMinute: 0,
      endHour: 20,
      endMinute: 0,
      title: "焼肉",
    });
  });

  it("区切り文字にカンマ・スペースを使っても解釈できる", () => {
    expect(parseCalendar("8/1, 18-20, 焼肉")).toEqual({
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 18,
      startMinute: 0,
      endHour: 20,
      endMinute: 0,
      title: "焼肉",
    });
  });

  it("日付形式が不正ならnull", () => {
    expect(parseCalendar("8月1日、旅行")).toBeNull();
  });

  it("成功時はisSuccess:true、失敗時はisSuccess:falseと理由が返る", () => {
    expect(parseCalendarDetailed("8/1、旅行").isSuccess).toBe(true);
    expect(parseCalendarDetailed("8/5-3、旅行")).toEqual({
      isSuccess: false,
      value: null,
      reason: "開始日が終了日より後になってるちゅ",
    });
  });

  it("時刻にコロン区切り(16:45-17:00)を使うとnull", () => {
    expect(parseCalendar("8/18,16:45-17:00,テスト")).toBeNull();
  });

  it("時刻にコロン区切りを使った場合、時刻フォーマットの理由が返る(家計簿の理由に化けない)", () => {
    expect(parseCalendarDetailed("8/18,16:45-17:00,テスト").reason).toBe(
      "時刻は「18」や「18-20」の形で書いてほちい",
    );
  });

  it("終日パターンで予定名を書き忘れ、時刻っぽい文字列がそのまま予定名になった場合はnull", () => {
    expect(parseCalendar("8/18,1645-1700")).toBeNull();
    expect(parseCalendar("8/18、1645")).toBeNull();
  });

  it("分指定(3桁・1時間): 8/1、830、焼肉 -> 8:30-9:30", () => {
    expect(parseCalendar("8/1、830、焼肉")).toEqual({
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 8,
      startMinute: 30,
      endHour: 9,
      endMinute: 30,
      title: "焼肉",
    });
  });

  it("分指定(4桁・1時間): 8/1、1830、焼肉 -> 18:30-19:30", () => {
    expect(parseCalendar("8/1、1830、焼肉")).toEqual({
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 18,
      startMinute: 30,
      endHour: 19,
      endMinute: 30,
      title: "焼肉",
    });
  });

  it("分指定(範囲): 8/1、1830-2015、焼肉 -> 18:30-20:15", () => {
    expect(parseCalendar("8/1、1830-2015、焼肉")).toEqual({
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 18,
      startMinute: 30,
      endHour: 20,
      endMinute: 15,
      title: "焼肉",
    });
  });

  it("開始のみ分指定、終了は時のみ: 8/1、1830-20、焼肉 -> 18:30-20:00", () => {
    expect(parseCalendar("8/1、1830-20、焼肉")).toEqual({
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 18,
      startMinute: 30,
      endHour: 20,
      endMinute: 0,
      title: "焼肉",
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
      type: "calendar",
      allDay: false,
      month: 8,
      day: 1,
      startHour: 23,
      startMinute: 0,
      endHour: 24,
      endMinute: 0,
      title: "飲み会",
    });
  });

  it("時間指定で終了が開始以前ならnull", () => {
    expect(parseCalendar("8/1、20-18、焼肉")).toBeNull();
    expect(parseCalendar("8/1、18-18、焼肉")).toBeNull();
  });
});

describe("isCalendarMessage", () => {
  it("先頭が日付形式(M/D, M/D-D)ならtrue", () => {
    expect(isCalendarMessage("8/1、旅行")).toBe(true);
    expect(isCalendarMessage("8/1-3、旅行")).toBe(true);
    expect(isCalendarMessage("8/1、18、焼肉")).toBe(true);
  });

  it("日付の書き方が間違っていても、日付を書こうとしたっぽければtrue", () => {
    expect(isCalendarMessage("8/18,16:45-17:00,テスト")).toBe(true);
    expect(isCalendarMessage("8月1日、18、焼肉")).toBe(true);
  });

  it("先頭が日付っぽくなければfalse", () => {
    expect(isCalendarMessage("昼食、1200")).toBe(false);
    expect(isCalendarMessage("立替、シャンプー、5000")).toBe(false);
    expect(isCalendarMessage("よくわからないテキスト")).toBe(false);
  });
});

describe("isExpenseMessage", () => {
  it("家計簿としてパースできればtrue", () => {
    expect(isExpenseMessage("昼食、1200")).toBe(true);
    expect(isExpenseMessage("立替、シャンプー、5000")).toBe(true);
    expect(isExpenseMessage("立替え、シャンプー、5000")).toBe(true);
    expect(isExpenseMessage("立て替え、シャンプー、5000")).toBe(true);
  });

  it("家計簿としてパースできなければfalse", () => {
    expect(isExpenseMessage("昼食、abc")).toBe(false);
    expect(isExpenseMessage("立替、5000")).toBe(false);
    expect(isExpenseMessage("8/1、旅行")).toBe(false);
    expect(isExpenseMessage("よくわからないテキスト")).toBe(false);
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
      "カレンが予定をちゅいかちた！\n8/1 旅行",
    );
  });

  it("終日(複数日)の場合", () => {
    const m = { allDay: true, month: 8, startDay: 1, endDay: 3, title: "旅行" };
    expect(formatCalendarNotification(m, "カレン")).toBe(
      "カレンが予定をちゅいかちた！\n8/1-3 旅行",
    );
  });

  it("時間指定の場合", () => {
    const m = {
      allDay: false,
      month: 8,
      day: 1,
      startHour: 18,
      startMinute: 0,
      endHour: 20,
      endMinute: 0,
      title: "焼肉",
    };
    expect(formatCalendarNotification(m, "カレン")).toBe(
      "カレンが予定をちゅいかちた！\n8/1 18:00-20:00 焼肉",
    );
  });

  it("分指定の場合は0埋めされる", () => {
    const m = {
      allDay: false,
      month: 8,
      day: 1,
      startHour: 8,
      startMinute: 5,
      endHour: 9,
      endMinute: 5,
      title: "焼肉",
    };
    expect(formatCalendarNotification(m, "カレン")).toBe(
      "カレンが予定をちゅいかちた！\n8/1 08:05-09:05 焼肉",
    );
  });

  it("送信者名がnullの場合は「〇〇が」を省略する", () => {
    const m = { allDay: true, month: 8, startDay: 1, endDay: 1, title: "旅行" };
    expect(formatCalendarNotification(m, null)).toBe(
      "予定をちゅいかちた！\n8/1 旅行",
    );
  });
});

describe("isHelpMessage", () => {
  it("「ヘルプ」「へるぷ」ならtrue(前後の空白は無視)", () => {
    expect(isHelpMessage("ヘルプ")).toBe(true);
    expect(isHelpMessage(" ヘルプ\n")).toBe(true);
    expect(isHelpMessage("へるぷ")).toBe(true);
  });

  it("「ヘルプ」以外ならfalse", () => {
    expect(isHelpMessage("ヘルプ、1200")).toBe(false);
    expect(isHelpMessage("help")).toBe(false);
  });

  it("「ヘルプ」はカレンダーとは判定されない", () => {
    expect(isCalendarMessage("ヘルプ")).toBe(false);
  });
});

describe("HELP_EXAMPLES", () => {
  it.each(HELP_EXAMPLES.expense.map((e) => e.example))(
    "家計簿の例「%s」は家計簿としてパースできる",
    (example) => {
      expect(isCalendarMessage(example)).toBe(false);
      expect(isExpenseMessage(example)).toBe(true);
      expect(parseExpenseDetailed(example).isSuccess).toBe(true);
    },
  );

  it.each(HELP_EXAMPLES.calendar.map((e) => e.example))(
    "カレンダーの例「%s」はカレンダーとしてパースできる",
    (example) => {
      expect(isCalendarMessage(example)).toBe(true);
      expect(parseCalendarDetailed(example).isSuccess).toBe(true);
    },
  );
});

describe("formatHelpMessage", () => {
  it("全ての入力例を含む", () => {
    const message = formatHelpMessage();
    [...HELP_EXAMPLES.expense, ...HELP_EXAMPLES.calendar].forEach(
      ({ example }) => {
        expect(message).toContain(example);
      },
    );
  });
});

describe("formatUnknownMessage", () => {
  it("当てはまらない旨とヘルプを含む", () => {
    const message = formatUnknownMessage();
    expect(message).toContain("どの書き方にも当てはまらないちゅ");
    expect(message).toContain(formatHelpMessage());
  });
});

describe("入力形式の判定", () => {
  it("ヘルプ・カレンダー・家計簿の入力例は、それぞれ自分の判定にだけ当てはまる", () => {
    const judges = { isHelpMessage, isCalendarMessage, isExpenseMessage };
    const cases = [
      ["ヘルプ", "isHelpMessage"],
      ...HELP_EXAMPLES.calendar.map((e) => [e.example, "isCalendarMessage"]),
      ...HELP_EXAMPLES.expense.map((e) => [e.example, "isExpenseMessage"]),
    ];
    cases.forEach(([text, expected]) => {
      const matched = Object.keys(judges).filter((name) => judges[name](text));
      expect(matched, text).toEqual([expected]);
    });
  });

  it("日付っぽい品目と数字の組み合わせ(8/1、1200)は両方に当てはまるため、優先順でカレンダーになる", () => {
    expect(isCalendarMessage("8/1、1200")).toBe(true);
    expect(isExpenseMessage("8/1、1200")).toBe(true);
  });

  it("どの判定にも当てはまらない入力がある", () => {
    ["よくわからないテキスト", "昼食、1200、追加"].forEach((text) => {
      expect(
        isHelpMessage(text) ||
          isCalendarMessage(text) ||
          isExpenseMessage(text),
      ).toBe(false);
    });
  });
});
