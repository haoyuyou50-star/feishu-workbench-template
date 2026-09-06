import { USAGE_MONITOR_BOARD_ID } from "./usage-monitor-model.js";

export const DEFAULT_WORKBENCH_BOARDS = Object.freeze([
  Object.freeze({ id: "board-placeholder-1", name: "项目投奖看板", description: "整理项目、比赛节点与投递进度。", color: "#70b78e" }),
  Object.freeze({ id: "board-placeholder-2", name: "课程与结课", description: "集中记录每门课程的结课内容、要求与提交信息。", color: "#75a7f0" }),
  Object.freeze({ id: USAGE_MONITOR_BOARD_ID, name: "用量监控看板", description: "集中查看 Codex、飞书与豆包的额度、刷新周期和使用趋势。", color: "#58b6ad" }),
  Object.freeze({ id: "board-placeholder-3", name: "灵感资料库", description: "收集灵感、参考资料与待整理内容。", color: "#e6ad4f" }),
]);

const USAGE_BOARD = DEFAULT_WORKBENCH_BOARDS.find((board) => board.id === USAGE_MONITOR_BOARD_ID);
const LEGACY_USAGE_NAMES = new Set(["用量监控看板", "Codex用量监控看板", "Codex 用量监控看板"]);

export function isLegacyUsageBoard(board) {
  if (!board || typeof board !== "object" || board.id === USAGE_MONITOR_BOARD_ID) return false;
  const name = String(board.name || "").trim();
  const description = String(board.description || "");
  return LEGACY_USAGE_NAMES.has(name)
    || (/Codex/i.test(description) && /用量|额度|刷新周期/.test(description));
}

export function normalizeWorkbenchBoards(value) {
  const source = Array.isArray(value) ? value : DEFAULT_WORKBENCH_BOARDS;
  const boards = source
    .filter((board) => board && typeof board === "object" && String(board.id || "").trim())
    .map((board) => board.id === "board-placeholder-2" ? {
      ...board,
      name: board.name === "课程与创作计划" ? "课程与结课" : board.name,
      description: board.description === "汇总课程作业、创作任务与阶段成果。" ? "集中记录每门课程的结课内容、要求与提交信息。" : board.description,
    } : { ...board });

  if (boards.some((board) => board.id === USAGE_MONITOR_BOARD_ID)) return boards;

  const legacyIndex = boards.findIndex(isLegacyUsageBoard);
  if (legacyIndex >= 0) {
    boards[legacyIndex] = {
      ...USAGE_BOARD,
      ...boards[legacyIndex],
      id: USAGE_MONITOR_BOARD_ID,
      name: String(boards[legacyIndex].name || "").trim() || USAGE_BOARD.name,
      description: String(boards[legacyIndex].description || "").trim() || USAGE_BOARD.description,
    };
    return boards;
  }

  const inspirationIndex = boards.findIndex((board) => board.id === "board-placeholder-3");
  boards.splice(inspirationIndex >= 0 ? inspirationIndex : boards.length, 0, { ...USAGE_BOARD });
  return boards;
}

export function getBoardDestination(board) {
  if (board?.id === "board-placeholder-1") return "award-board";
  if (board?.id === "board-placeholder-2") return "course-plan";
  if (board?.id === USAGE_MONITOR_BOARD_ID || isLegacyUsageBoard(board)) return "usage-monitor";
  return null;
}
