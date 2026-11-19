"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const response = require("../muse-response.js");

test("classifies the Muse decline and workflow-choice message as blocked", () => {
  const text =
    "第 2 个颜色这次没做出来，红色 #8C1A2D 的图生成失败了。" +
    "你可以选一个：等会儿换一个新对话，或者先把第 3 个颜色发过来。你看怎么安排？";
  assert.equal(response.classify(text), "blocked");
  assert.equal(response.isContinueQuestion(text), false);
});

test("recognizes explicit blocked and failure wording", () => {
  for (const text of [
    "这个颜色暂时做不了",
    "本次重绘没有生成成功",
    "当前出图失败，请稍后重试",
    "你可以选一个：换新对话或先做第 4 个",
    "Unable to generate this image right now",
  ]) {
    assert.equal(response.isGenerationBlocked(text), true, text);
  }
});

test("does not mistake normal completion or continue prompts for failures", () => {
  for (const text of [
    "第 1 个颜色已经完成",
    "生成成功，正在继续下一张",
    "是否需要我继续生成？",
    "Continue?",
  ]) {
    assert.equal(response.isGenerationBlocked(text), false, text);
  }
  assert.equal(
    response.classify("是否需要我继续生成？"),
    "continue",
  );
});

test("recognizes image-capacity replies that require a fresh Muse window", () => {
  for (const text of [
    "当前对话图片太多了，请新开一个对话",
    "本次生成数量过多，已达到上限",
    "生成队列已满，建议换一个新窗口",
    "对话记录已超过 16961，离上限 16384 更远了。这个聊天现在太长，做不了图了",
    "Conversation context limit exceeded. Start a new chat.",
    "Too many images in this chat",
    "Generation limit reached. Please start a new chat.",
  ]) {
    assert.equal(response.isGenerationBlocked(text), true, text);
    assert.equal(response.isCapacityBlocked(text), true, text);
  }
  assert.equal(response.isCapacityBlocked("第 1 个颜色已经完成"), false);
  assert.equal(response.CAPACITY_ERROR_PREFIX, "VF_MUSE_CAPACITY:");
  assert.equal(
    response.MUSE_FRESH_THREAD_URL,
    "https://muse.ai/thread/new",
  );
});

test("uses short default waits and keeps the 5-minute fallback budget", () => {
  assert.equal(response.timeoutMs("single", false), 90 * 1000);
  assert.equal(response.timeoutMs("batch", false), 120 * 1000);
  assert.equal(response.timeoutMs("video", false), 10 * 60 * 1000);
  assert.equal(response.timeoutMs("single", true), 30 * 60 * 1000);
  assert.equal(response.VIDEO_TIMEOUT_MS, 10 * 60 * 1000);
  assert.equal(response.BLOCKED_GRACE_MS, 15 * 1000);
});

test("plans one text-only regeneration before failing and skipping", () => {
  assert.equal(
    response.textOnlyRetryAction(false, 5000, 20000),
    "wait",
  );
  assert.equal(
    response.textOnlyRetryAction(false, 20000, 20000),
    "retry",
  );
  assert.equal(
    response.textOnlyRetryAction(true, 20000, 20000),
    "fail",
  );
  assert.equal(response.isProgressText("正在生成图片，请稍候"), true);
  assert.equal(response.isProgressText("生成失败，没有图片"), false);
  assert.equal(response.TEXT_ONLY_ERROR_PREFIX, "VF_MUSE_TEXT_ONLY_FAILED:");
});
