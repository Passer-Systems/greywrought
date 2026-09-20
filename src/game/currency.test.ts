import { expect, test } from "bun:test";
import { formatMoney } from "./currency.js";

test("money displays copper, silver and gold without changing its value", () => {
  for (const [value, display] of [
    [0, "0 copper"], [9, "9 copper"], [99, "99 copper"], [100, "1 silver"],
    [101, "1 silver 1 copper"], [9999, "99 silver 99 copper"], [10000, "1 gold"],
    [10001, "1 gold 1 copper"], [10100, "1 gold 1 silver"], [1234567, "123 gold 45 silver 67 copper"],
  ] as const) expect(formatMoney(value)).toBe(display);
});
