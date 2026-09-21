import { expect, test } from "bun:test";
import { createChatBubbleFeed } from "./chat-bubbles.js";

test("speech skips join history, follows speaker identity, replaces and expires", () => {
  const feed = createChatBubbleFeed();
  const history = { id: 1, speakerId: "first", name: "Alden", text: "Before joining" };
  feed.update([history], 0);
  expect(feed.visible(0)).toEqual([]);
  const local = { ...history, id: 2, text: "Hello" };
  const remote = { ...history, id: 3, speakerId: "second", text: "Same name, another person" };
  feed.update([history, local, remote], 100);
  expect(feed.visible(100).map(bubble => bubble.speakerId)).toEqual(["first", "second"]);
  expect(feed.visible(5_100).map(bubble => bubble.opacity)).toEqual([1, 1]);
  expect(feed.visible(5_350).map(bubble => bubble.opacity)).toEqual([0.5, 0.5]);
  feed.update([history, local, remote], 5_400);
  expect(feed.visible(5_600)).toEqual([]);
  feed.update([{ ...local, id: 4 }, { ...remote, id: 5, speakerId: null }], 10_000);
  feed.update([{ ...local, id: 6, text: "A newer thought" }], 10_100);
  expect(feed.visible(10_100).map(bubble => bubble.message.text)).toEqual(["A newer thought"]);
});

test("an empty initial history still allows the first new message", () => {
  const feed = createChatBubbleFeed();
  feed.update([], 0);
  feed.update([{ id: 1, speakerId: "first", name: "Alden", text: "First words" }], 100);
  expect(feed.visible(100)).toHaveLength(1);
});

test("party messages never appear in speech bubbles", () => {
  const feed = createChatBubbleFeed();
  feed.update([], 0);
  feed.update([{ id: 1, speakerId: "first", name: "Alden", text: "Party only", partyId: "party-one" }], 100);
  expect(feed.visible(100)).toEqual([]);
});

test("collecting loot does not create a bubble or replace actual speech", () => {
  const feed = createChatBubbleFeed();
  feed.update([], 0);
  const speech = { id: 1, speakerId: "first", name: "Alden", text: "Hello" };
  feed.update([speech], 100);
  feed.update([speech, { ...speech, id: 2, kind: 'loot', text: 'collected 3 copper, 1 salvage from Scrapwing.' }], 200);
  expect(feed.visible(200).map(bubble => bubble.message.text)).toEqual(['Hello']);
  feed.update([{ ...speech, id: 3, kind: 'loot', speakerId: 'second', text: 'collected 3 copper.' }], 300);
  expect(feed.visible(300)).toHaveLength(1);
});
