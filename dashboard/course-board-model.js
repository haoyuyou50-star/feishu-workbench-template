export const WORK_STATUSES = ["未开始", "进行中", "待提交", "已完成"];
export const INCOMPLETE_STATUS = "尚未填写结课信息";

export function filterCourseView(courses, mode, incompleteOnly = false) {
  if (incompleteOnly) return courses.filter((course) => course.status === INCOMPLETE_STATUS);
  if (mode === "status") return courses.filter((course) => WORK_STATUSES.includes(course.status));
  return courses;
}

export function courseWorkGroups(courses) {
  return WORK_STATUSES.map((status) => ({ status, courses: courses.filter((course) => course.status === status) }));
}

export function courseMotionDelta(previous, next) {
  if (!previous) return null;
  const x = previous.x - next.x;
  const y = previous.y - next.y;
  return Math.abs(x) > 1 || Math.abs(y) > 1 ? { x, y } : null;
}
