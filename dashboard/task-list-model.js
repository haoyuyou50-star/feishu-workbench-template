export function taskIsDone(task = {}, pref = {}) {
  return Boolean(task.completed) || Boolean(pref.done);
}

export function unfinishedTasks(tasks = [], prefs = {}) {
  return tasks.filter((task) => !taskIsDone(task, prefs[task.id]));
}

export function withoutTaskDonePreference(prefs = {}, taskId) {
  const current = prefs[taskId];
  if (!current || !Object.prototype.hasOwnProperty.call(current, "done")) return prefs;
  const nextTaskPref = { ...current };
  delete nextTaskPref.done;
  const next = { ...prefs };
  if (Object.keys(nextTaskPref).length) next[taskId] = nextTaskPref;
  else delete next[taskId];
  return next;
}
