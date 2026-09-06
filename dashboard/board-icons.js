import {
  Activity, CalendarDays, FolderKanban, GraduationCap, LayoutDashboard,
  Library, Lightbulb, ListTodo, Trophy,
} from "lucide-react";

const NAME_ICONS = [
  [/用量|额度|监控|usage|quota|monitor/i, Activity],
  [/投奖|获奖|赛事|比赛|竞赛|awards?|competition/i, Trophy],
  [/课程|结课|学期|学业|学习|course|study/i, GraduationCap],
  [/灵感|创意|inspiration|ideas?/i, Lightbulb],
  [/知识|资料|文档|wiki|knowledge|library/i, Library],
  [/待办|任务|tasks?|todo/i, ListTodo],
  [/日历|日程|calendar|schedule/i, CalendarDays],
  [/项目|projects?/i, FolderKanban],
];

const DEFAULT_ICONS = {
  "board-placeholder-1": Trophy,
  "board-placeholder-2": GraduationCap,
  "board-placeholder-3": Lightbulb,
  "board-usage-monitor": Activity,
};

export function getBoardIcon(board) {
  const name = String(board?.name || "").trim();
  return NAME_ICONS.find(([pattern]) => pattern.test(name))?.[1]
    || DEFAULT_ICONS[board?.id]
    || LayoutDashboard;
}
