export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function getLocalDateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function dayKeyFromDate(d) {
  const day = d.getDay();
  return DAY_KEYS[day === 0 ? 6 : day - 1];
}

export function timeToMinutes(t) {
  const [h, m] = (t || '00:00').toString().split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseSettingsObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

export function defaultDaySlot() {
  return { start: '09:00', end: '18:00', closed: false, breaks: [] };
}

export function defaultWeeklySchedule() {
  return DAY_KEYS.reduce((acc, key) => ({ ...acc, [key]: defaultDaySlot() }), {});
}

/** @param {any} source */
export function normalizeWeeklySchedule(source) {
  return DAY_KEYS.reduce((acc, key) => {
    const slot = source && typeof source === 'object' ? source[key] : null;
    return {
      ...acc,
      [key]: {
        start: typeof slot?.start === 'string' ? slot.start : '09:00',
        end: typeof slot?.end === 'string' ? slot.end : '18:00',
        closed: Boolean(slot?.closed),
        breaks: Array.isArray(slot?.breaks)
          ? slot.breaks
            .filter((b) => b && typeof b === 'object')
            .map((b) => ({
              start: typeof b.start === 'string' ? b.start : '13:00',
              end: typeof b.end === 'string' ? b.end : '14:00',
            }))
          : [],
      },
    };
  }, {});
}

/** @param {any[]} arr */
export function normalizeFlexWindows(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const w of arr) {
    if (!w || typeof w !== 'object') continue;
    const date = typeof w.date === 'string' ? w.date.trim() : '';
    const start = typeof w.start === 'string' ? w.start.trim() : '';
    const end = typeof w.end === 'string' ? w.end.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!start || !end) continue;
    if (timeToMinutes(end) - timeToMinutes(start) < 30) continue;
    if (timeToMinutes(end) <= timeToMinutes(start)) continue;
    const id = typeof w.id === 'string' && w.id ? w.id : `fw_${date}_${start}_${end}_${Math.random().toString(36).slice(2, 9)}`;
    out.push({ id, date, start, end });
  }
  out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return out;
}

/** Удаляет окна с датой строго раньше сегодняшнего календарного дня (локально). */
export function pruneFlexWindowsBeforeToday(flexWindows) {
  const todayKey = getLocalDateKey(new Date());
  return normalizeFlexWindows(flexWindows).filter((w) => w.date >= todayKey);
}

/**
 * @param {object} opt options из settings
 * @returns {{ scheduleMode: 'weekly'|'flex', schedule: object, flexWindows: array }}
 */
export function getMasterScheduleBundleFromOptions(opt) {
  if (!opt || typeof opt !== 'object') {
    return { scheduleMode: 'weekly', schedule: defaultWeeklySchedule(), flexWindows: [] };
  }
  const masterMode = opt.masterMode || 'me';
  const masterMe = opt.masterMe && typeof opt.masterMe === 'object' ? opt.masterMe : null;
  const masterOne = opt.masterOne && typeof opt.masterOne === 'object' ? opt.masterOne : null;
  const mastersList = Array.isArray(opt.masters) ? opt.masters : [];

  const source = (() => {
    if (masterMode === 'me' && masterMe) return masterMe;
    if (masterMode === 'one' && masterOne) return masterOne;
    if (mastersList[0] && typeof mastersList[0] === 'object') return mastersList[0];
    return masterMe || masterOne || mastersList[0] || null;
  })();

  if (!source || typeof source !== 'object') {
    return { scheduleMode: 'weekly', schedule: defaultWeeklySchedule(), flexWindows: [] };
  }

  const mode = source.scheduleMode === 'flex' ? 'flex' : 'weekly';
  const flexWindows = normalizeFlexWindows(source.flexWindows);
  const schedule = normalizeWeeklySchedule(source.schedule);

  return { scheduleMode: mode, schedule, flexWindows };
}

export function getSlotsForWeeklyDay(schedule, durationMinutes, existingNotesForDay, date) {
  const dayKey = dayKeyFromDate(date);
  const slot = schedule[dayKey];
  if (!slot || slot.closed) return [];
  const startMin = timeToMinutes(slot.start);
  const endMin = timeToMinutes(slot.end);
  const breaks = (slot.breaks || []).map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) }));
  const step = 30;
  const slots = [];
  for (let min = startMin; min + durationMinutes <= endMin; min += step) {
    const slotEnd = min + durationMinutes;
    const inBreak = breaks.some((b) => min < b.end && slotEnd > b.start);
    if (inBreak) continue;
    const overlapNote = existingNotesForDay.some((note) => {
      const noteStart = timeToMinutes(note.timeLocal);
      const noteEnd = noteStart + (note.durationMinutes || durationMinutes);
      return min < noteEnd && slotEnd > noteStart;
    });
    if (overlapNote) continue;
    slots.push(minutesToTime(min));
  }
  return slots;
}

export function getSlotsForFlexDay(flexWindows, durationMinutes, existingNotesForDay, date) {
  const dateKey = getLocalDateKey(date);
  const windows = normalizeFlexWindows(flexWindows).filter((w) => w.date === dateKey);
  const slotsSet = new Set();
  for (const w of windows) {
    const startMin = timeToMinutes(w.start);
    const endMin = timeToMinutes(w.end);
    const step = 30;
    for (let min = startMin; min + durationMinutes <= endMin; min += step) {
      const slotEnd = min + durationMinutes;
      const overlapNote = existingNotesForDay.some((note) => {
        const noteStart = timeToMinutes(note.timeLocal);
        const noteEnd = noteStart + (note.durationMinutes || durationMinutes);
        return min < noteEnd && slotEnd > noteStart;
      });
      if (overlapNote) continue;
      slotsSet.add(minutesToTime(min));
    }
  }
  return Array.from(slotsSet).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

export function getSlotsForMasterDay(bundle, durationMinutes, existingNotesForDay, date) {
  if (bundle.scheduleMode === 'flex') {
    return getSlotsForFlexDay(bundle.flexWindows, durationMinutes, existingNotesForDay, date);
  }
  return getSlotsForWeeklyDay(bundle.schedule, durationMinutes, existingNotesForDay, date);
}

/** Для админ-календаря: один непрерывый диапазон от минимального start до максимального end. */
export function getFlexDayTimelineBounds(flexWindows, dateKey) {
  const windows = normalizeFlexWindows(flexWindows).filter((w) => w.date === dateKey);
  if (!windows.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const w of windows) {
    lo = Math.min(lo, timeToMinutes(w.start));
    hi = Math.max(hi, timeToMinutes(w.end));
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return {
    start: minutesToTime(lo),
    end: minutesToTime(hi),
    closed: false,
    breaks: [],
  };
}

/**
 * Возвращает JSON settings с обновлёнными flexWindows у masterMe (режим me).
 * @returns {string|null}
 */
export function settingsJsonWithPrunedFlexWindows(rawSettings, prunedWindows) {
  const obj = parseSettingsObject(rawSettings);
  if (!obj || typeof obj !== 'object') return null;
  const opt = obj.options && typeof obj.options === 'object' ? { ...obj.options } : {};
  const masterMe = opt.masterMe && typeof opt.masterMe === 'object' ? { ...opt.masterMe } : {};
  if (masterMe.scheduleMode !== 'flex') return null;
  const prev = normalizeFlexWindows(masterMe.flexWindows);
  const next = normalizeFlexWindows(prunedWindows);
  if (prev.length === next.length && prev.every((p, i) => p.date === next[i].date && p.start === next[i].start && p.end === next[i].end)) {
    return null;
  }
  masterMe.flexWindows = next;
  opt.masterMe = masterMe;
  obj.options = opt;
  return JSON.stringify(obj);
}
