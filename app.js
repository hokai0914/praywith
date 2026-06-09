const CLIENT_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbxz5I3jXE3T6lto2drCwshiE_pUbBKUFJyu4ABJh_-ve5fS3qG1huLyUrgTIA5M1ZpZ9w/exec",
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DEFAULT_START_HOUR = 6;
const REGISTRATION_END_HOUR = 22;
const REGISTRATION_END_TIME = "22:00";
const DEFAULT_END_HOUR = REGISTRATION_END_HOUR;
const REPEAT_START_DATE = "2026-06-08";
const REPEAT_END_DATE = "2026-08-06";
const REPEAT_WEEKDAYS = [
  { value: 0, label: "일", disabled: true },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

const state = {
  currentWeekStart: startOfWeek(new Date()),
  events: [],
  loading: false,
  selectedEvent: null,
  pendingDelete: null,
};

const els = {
  calendarGrid: document.querySelector("#calendarGrid"),
  weekRange: document.querySelector("#weekRange"),
  connectionStatus: document.querySelector("#connectionStatus"),
  toastRegion: document.querySelector("#toastRegion"),
  eventDialog: document.querySelector("#eventDialog"),
  eventForm: document.querySelector("#eventForm"),
  singleDateField: document.querySelector("#singleDateField"),
  singleTimeField: document.querySelector("#singleTimeField"),
  eventDate: document.querySelector("#eventDate"),
  eventTime: document.querySelector("#eventTime"),
  personName: document.querySelector("#personName"),
  repeatEnabled: document.querySelector("#repeatEnabled"),
  repeatControls: document.querySelector("#repeatControls"),
  repeatStartDate: document.querySelector("#repeatStartDate"),
  repeatEndDate: document.querySelector("#repeatEndDate"),
  repeatWeekdays: document.querySelector("#repeatWeekdays"),
  repeatTimes: document.querySelector("#repeatTimes"),
  repeatSummary: document.querySelector("#repeatSummary"),
  detailDialog: document.querySelector("#detailDialog"),
  detailTitle: document.querySelector("#detailTitle"),
  detailMeta: document.querySelector("#detailMeta"),
  detailCompleted: document.querySelector("#detailCompleted"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmCopy: document.querySelector("#confirmCopy"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  renderRepeatControls();
  syncEventFormMode();
  bindActions();
  render();
  loadWeek();
}

function bindActions() {
  document.body.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const { action } = actionButton.dataset;
    if (action === "prev-week") shiftWeek(-7);
    if (action === "next-week") shiftWeek(7);
    if (action === "today") goToToday();
    if (action === "add-event") openEventDialog(formatDate(new Date()), registrationHourLabel(new Date().getHours()));
    if (action === "close-event") closeDialog(els.eventDialog);
    if (action === "close-detail") closeDialog(els.detailDialog);
    if (action === "delete-current") requestDelete(state.selectedEvent);
    if (action === "cancel-delete") closeDialog(els.confirmDialog);
    if (action === "confirm-delete") confirmDelete();
  });

  els.eventForm.addEventListener("submit", submitEventForm);
  els.repeatEnabled.addEventListener("change", syncEventFormMode);
  els.repeatControls.addEventListener("change", updateRepeatSummary);
  els.detailCompleted.addEventListener("change", async () => {
    if (!state.selectedEvent) return;
    await toggleEvent(state.selectedEvent.id, els.detailCompleted.checked);
  });
}

function renderRepeatControls() {
  els.repeatStartDate.min = REPEAT_START_DATE;
  els.repeatStartDate.max = REPEAT_END_DATE;
  els.repeatStartDate.defaultValue = REPEAT_START_DATE;
  els.repeatStartDate.value = REPEAT_START_DATE;
  els.repeatEndDate.min = REPEAT_START_DATE;
  els.repeatEndDate.max = REPEAT_END_DATE;
  els.repeatEndDate.defaultValue = REPEAT_END_DATE;
  els.repeatEndDate.value = REPEAT_END_DATE;

  els.repeatWeekdays.innerHTML = "";
  REPEAT_WEEKDAYS.forEach((weekday) => {
    els.repeatWeekdays.append(createChoice("repeatWeekdays", String(weekday.value), weekday.label, weekday.disabled));
  });

  els.repeatTimes.innerHTML = "";
  for (let hour = DEFAULT_START_HOUR; hour <= REGISTRATION_END_HOUR; hour += 1) {
    const time = hourLabel(hour);
    els.repeatTimes.append(createChoice("repeatTimes", time, time));
  }
}

function createChoice(name, value, label, disabled = false) {
  const wrapper = createElement("label", `choice-pill${disabled ? " is-disabled" : ""}`);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = name;
  input.value = value;
  input.disabled = disabled;
  if (disabled) input.dataset.alwaysDisabled = "true";
  const text = createElement("span", "", label);
  wrapper.append(input, text);
  return wrapper;
}

function syncEventFormMode() {
  const repeatMode = els.repeatEnabled.checked;
  els.singleDateField.hidden = repeatMode;
  els.singleTimeField.hidden = repeatMode;
  els.repeatControls.hidden = !repeatMode;
  els.eventDate.required = !repeatMode;
  els.eventTime.required = !repeatMode;
  setLoading(state.loading);
  updateRepeatSummary();
}

function updateRepeatSummary() {
  const weekdays = getCheckedValues("repeatWeekdays");
  const times = getCheckedValues("repeatTimes");
  const range = getRepeatRange();
  if (!range) {
    els.repeatSummary.textContent = "반복 기간을 확인해 주세요.";
    return;
  }

  if (!weekdays.length || !times.length) {
    els.repeatSummary.textContent = "요일과 시간을 선택해 주세요.";
    return;
  }

  const count = buildRepeatEvents("preview", weekdays.map(Number), times, range.start, range.end).length;
  els.repeatSummary.textContent = `${formatDateLabel(range.start)} - ${formatDateLabel(range.end)} 사이에 ${count}개 일정이 등록됩니다.`;
}

function getApiUrl() {
  return CLIENT_CONFIG.apiUrl.trim();
}

function setLoading(isLoading) {
  state.loading = isLoading;
  document.querySelectorAll("button, input").forEach((control) => {
    control.disabled = control.dataset.alwaysDisabled === "true" || isLoading || isFormModeDisabled(control);
  });
}

function isFormModeDisabled(control) {
  if (!els.repeatEnabled) return false;
  const repeatMode = els.repeatEnabled.checked;
  if (control.closest("#singleDateField") || control.closest("#singleTimeField")) return repeatMode;
  if (control.closest("#repeatControls")) return !repeatMode;
  return false;
}

function shiftWeek(days) {
  state.currentWeekStart = addDays(state.currentWeekStart, days);
  render();
  loadWeek();
}

function goToToday() {
  state.currentWeekStart = startOfWeek(new Date());
  render();
  loadWeek();
}

async function loadWeek() {
  const days = getWeekDays();
  const from = formatDate(days[0]);
  const to = formatDate(days[6]);

  if (!getApiUrl()) {
    state.events = [];
    updateConnectionStatus("공유 연결이 설정되지 않음");
    render();
    return;
  }

  setLoading(true);
  updateConnectionStatus("불러오는 중");
  try {
    const response = await apiList(from, to);
    state.events = normalizeEvents(response.events || []);
    updateConnectionStatus("Google Sheets 연결됨");
    render();
  } catch (error) {
    showToast(error.message || "일정을 불러오지 못했습니다.", "error");
    updateConnectionStatus("연결 실패");
    state.events = [];
    render();
  } finally {
    setLoading(false);
  }
}

function render() {
  const days = getWeekDays();
  const fromLabel = formatKoreanDate(days[0]);
  const toLabel = formatKoreanDate(days[6]);
  els.weekRange.textContent = `${fromLabel} - ${toLabel}`;
  renderCalendar(days);
}

function renderCalendar(days) {
  els.calendarGrid.innerHTML = "";
  const hours = getVisibleHours();
  const todayKey = formatDate(new Date());

  els.calendarGrid.append(createElement("div", "corner"));
  days.forEach((day, index) => {
    const dayKey = formatDate(day);
    const head = createElement("div", `day-head${dayKey === todayKey ? " is-today" : ""}`);
    head.setAttribute("role", "columnheader");
    head.innerHTML = `
      <span class="day-name">${DAY_LABELS[index]}</span>
      <span class="day-date">${day.getMonth() + 1}/${day.getDate()}</span>
    `;
    els.calendarGrid.append(head);
  });

  hours.forEach((hour) => {
    const time = hourLabel(hour);
    const timeCell = createElement("div", "time-cell", time);
    timeCell.setAttribute("role", "rowheader");
    els.calendarGrid.append(timeCell);

    days.forEach((day) => {
      const date = formatDate(day);
      const slot = createSlot(date, time);
      els.calendarGrid.append(slot);
    });
  });
}

function createSlot(date, time) {
  const canRegister = isRegistrationSlot(date, time);
  const slot = createElement("div", `slot${canRegister ? "" : " is-disabled"}`);
  slot.setAttribute("role", "gridcell");

  const slotButton = createElement("button", "slot-button");
  slotButton.type = "button";
  slotButton.setAttribute("aria-label", `${date} ${time} 일정 등록`);
  if (canRegister) {
    slotButton.addEventListener("click", () => openEventDialog(date, time));
  } else {
    slotButton.disabled = true;
    slotButton.dataset.alwaysDisabled = "true";
    slotButton.setAttribute("aria-disabled", "true");
  }
  slot.append(slotButton);

  const events = eventsForSlot(date, time);
  const stack = createElement("div", "events");

  events.forEach((event) => stack.append(createEventCard(event)));
  slot.append(stack);
  return slot;
}

function createEventCard(event) {
  const card = createElement("article", `event-card${event.completed ? " completed" : ""}`);
  card.tabIndex = 0;
  card.setAttribute("aria-label", `${event.time} ${event.personName}`);
  card.addEventListener("click", () => openDetailDialog(event));
  card.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      openDetailDialog(event);
    }
  });

  const checkbox = document.createElement("input");
  checkbox.className = "event-check";
  checkbox.type = "checkbox";
  checkbox.checked = event.completed;
  checkbox.setAttribute("aria-label", `${event.personName} 완료`);
  checkbox.addEventListener("click", (clickEvent) => clickEvent.stopPropagation());
  checkbox.addEventListener("change", async () => toggleEvent(event.id, checkbox.checked));

  const nameButton = createElement("button", "event-name", event.personName);
  nameButton.type = "button";
  nameButton.title = `${event.time} ${event.personName}`;

  const deleteButton = createElement("button", "delete-mini", "×");
  deleteButton.type = "button";
  deleteButton.title = "삭제";
  deleteButton.setAttribute("aria-label", `${event.personName} 삭제`);
  deleteButton.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    requestDelete(event);
  });

  card.append(checkbox, nameButton, deleteButton);
  return card;
}

function eventsForSlot(date, time) {
  return state.events
    .filter((event) => event.date === date && event.time === time)
    .sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return a.personName.localeCompare(b.personName, "ko-KR");
    });
}

function getVisibleHours() {
  const eventHours = state.events
    .map((event) => Number.parseInt(event.time.slice(0, 2), 10))
    .filter((hour) => Number.isInteger(hour));
  const first = Math.min(DEFAULT_START_HOUR, ...eventHours);
  const last = Math.max(DEFAULT_END_HOUR, ...eventHours);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function openEventDialog(date, time) {
  if (!getApiUrl()) {
    showToast("공유 연결이 설정되지 않아 등록할 수 없습니다.", "error");
    return;
  }
  if (!isRegistrationDate(date)) {
    showToast("일요일은 선택할 수 없습니다.", "error");
    return;
  }

  els.eventForm.reset();
  els.eventDate.value = date;
  els.eventTime.value = normalizeRegistrationTime(time) || REGISTRATION_END_TIME;
  els.repeatEnabled.checked = false;
  selectRepeatDefaults(date, els.eventTime.value);
  syncEventFormMode();
  showDialog(els.eventDialog);
  window.setTimeout(() => els.personName.focus(), 0);
}

function selectRepeatDefaults(date, time) {
  const parsedDate = isDateKey(date) ? parseDate(date) : null;
  const weekdayValue = parsedDate ? String(parsedDate.getDay()) : "";

  els.repeatWeekdays.querySelectorAll("input").forEach((input) => {
    input.checked = input.value === weekdayValue && isRepeatDate(date);
  });
  els.repeatTimes.querySelectorAll("input").forEach((input) => {
    input.checked = input.value === time;
  });
}

async function submitEventForm(event) {
  event.preventDefault();
  const formData = new FormData(els.eventForm);
  const personName = String(formData.get("personName") || "").trim();

  if (els.repeatEnabled.checked) {
    await submitRepeatEventForm(personName);
    return;
  }

  const payload = {
    date: String(formData.get("date") || ""),
    time: normalizeRegistrationTime(String(formData.get("time") || "")),
    personName,
  };

  if (!payload.date || !payload.time || !payload.personName) {
    showToast("날짜, 시간, 이름을 입력해 주세요.", "error");
    return;
  }
  if (!isRegistrationDate(payload.date)) {
    showToast("일요일은 선택할 수 없습니다.", "error");
    return;
  }

  try {
    setLoading(true);
    const response = await apiPost({ action: "create", event: payload });
    const createdEvent = normalizeEvents([response.event])[0];
    state.events = [...state.events, createdEvent].filter(Boolean);
    closeDialog(els.eventDialog);
    showToast("일정을 등록했습니다.");
    render();
  } catch (error) {
    showToast(error.message || "일정 등록에 실패했습니다.", "error");
  } finally {
    setLoading(false);
  }
}

async function submitRepeatEventForm(personName) {
  const range = getRepeatRange();
  const weekdays = getCheckedValues("repeatWeekdays").map(Number);
  const times = getCheckedValues("repeatTimes")
    .map(normalizeRegistrationTime)
    .filter(Boolean);

  if (!range) {
    showToast("반복 기간을 확인해 주세요.", "error");
    return;
  }

  if (!personName || !weekdays.length || !times.length) {
    showToast("이름, 요일, 시간을 선택해 주세요.", "error");
    return;
  }

  const events = buildRepeatEvents(personName, weekdays, [...new Set(times)], range.start, range.end);
  if (!events.length) {
    showToast("반복 등록할 일정이 없습니다.", "error");
    return;
  }

  try {
    setLoading(true);
    const response = await apiPost({ action: "bulkCreate", events });
    const createdEvents = normalizeEvents(response.events || []);
    state.events = normalizeEvents([...state.events, ...createdEvents]);
    closeDialog(els.eventDialog);
    showToast(`${createdEvents.length}개 일정을 등록했습니다.`);
    render();
  } catch (error) {
    showToast(error.message || "반복 일정 등록에 실패했습니다.", "error");
  } finally {
    setLoading(false);
  }
}

function openDetailDialog(event) {
  state.selectedEvent = event;
  els.detailTitle.textContent = event.personName;
  els.detailMeta.textContent = `${formatKoreanDate(parseDate(event.date))} ${event.time}`;
  els.detailCompleted.checked = event.completed;
  showDialog(els.detailDialog);
}

async function toggleEvent(id, completed) {
  const previousEvents = state.events.map((event) => ({ ...event }));
  state.events = state.events.map((event) => (event.id === id ? { ...event, completed } : event));
  if (state.selectedEvent?.id === id) {
    state.selectedEvent = state.events.find((event) => event.id === id) || null;
  }
  render();

  try {
    setLoading(true);
    await apiPost({ action: "toggle", id, completed });
    showToast(completed ? "완료로 표시했습니다." : "완료 표시를 해제했습니다.");
  } catch (error) {
    state.events = previousEvents;
    if (state.selectedEvent?.id === id) {
      state.selectedEvent = state.events.find((event) => event.id === id) || null;
      els.detailCompleted.checked = state.selectedEvent?.completed || false;
    }
    render();
    showToast(error.message || "완료 상태를 바꾸지 못했습니다.", "error");
  } finally {
    setLoading(false);
  }
}

function requestDelete(event) {
  if (!event) return;
  state.pendingDelete = event;
  els.confirmCopy.textContent = `${event.time} ${event.personName} 일정을 삭제할까요?`;
  showDialog(els.confirmDialog);
}

async function confirmDelete() {
  const event = state.pendingDelete;
  if (!event) return;

  try {
    setLoading(true);
    await apiPost({ action: "delete", id: event.id });
    state.events = state.events.filter((item) => item.id !== event.id);
    state.pendingDelete = null;
    if (state.selectedEvent?.id === event.id) {
      state.selectedEvent = null;
      closeDialog(els.detailDialog);
    }
    closeDialog(els.confirmDialog);
    showToast("일정을 삭제했습니다.");
    render();
  } catch (error) {
    showToast(error.message || "일정 삭제에 실패했습니다.", "error");
  } finally {
    setLoading(false);
  }
}

async function apiList(from, to) {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error("공유 연결이 설정되지 않았습니다.");

  const url = new URL(apiUrl);
  url.searchParams.set("action", "list");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url.toString(), { method: "GET" });
  return parseApiResponse(response);
}

async function apiPost(payload) {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error("공유 연결이 설정되지 않았습니다.");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("서버 응답을 해석하지 못했습니다.");
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  }

  return data;
}

function normalizeEvents(events) {
  return events
    .map((event) => ({
      id: String(event.id || ""),
      date: String(event.date || ""),
      time: normalizeTime(String(event.time || "")),
      personName: String(event.personName || "").trim(),
      completed: event.completed === true || String(event.completed).toLowerCase() === "true",
      createdAt: String(event.createdAt || ""),
      updatedAt: String(event.updatedAt || ""),
    }))
    .filter((event) => event.id && isDateKey(event.date) && isTimeKey(event.time) && event.personName)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return a.personName.localeCompare(b.personName, "ko-KR");
    });
}

function updateConnectionStatus(message) {
  els.connectionStatus.textContent = message;
}

function showToast(message, type = "success") {
  const toast = createElement("div", `toast ${type}`, message);
  els.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3300);
}

function showDialog(dialog) {
  if (dialog.open) return;
  dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function getWeekDays() {
  return Array.from({ length: 7 }, (_, index) => addDays(state.currentWeekStart, index));
}

function buildRepeatEvents(personName, weekdays, times, startDate = REPEAT_START_DATE, endDate = REPEAT_END_DATE) {
  const selectedWeekdays = new Set(weekdays.map(Number));
  const selectedTimes = [...new Set(times.map(normalizeRegistrationTime).filter(Boolean))];
  const events = [];
  let date = parseDate(startDate);
  const lastDate = parseDate(endDate);

  while (date <= lastDate) {
    if (selectedWeekdays.has(date.getDay()) && isRegistrationDate(formatDate(date))) {
      const dateKey = formatDate(date);
      selectedTimes.forEach((time) => {
        events.push({ date: dateKey, time, personName });
      });
    }
    date = addDays(date, 1);
  }

  return events;
}

function getRepeatRange() {
  const start = normalizeRepeatDate(els.repeatStartDate.value);
  const end = normalizeRepeatDate(els.repeatEndDate.value);
  if (!start || !end || start > end) return null;
  return { start, end };
}

function normalizeRepeatDate(value) {
  const date = String(value || "").trim();
  if (!isRepeatDate(date)) return "";
  return date;
}

function getCheckedValues(name) {
  return Array.from(els.eventForm.querySelectorAll(`input[name="${name}"]:checked`), (input) => input.value);
}

function isRepeatDate(dateKey) {
  return isDateKey(dateKey) && dateKey >= REPEAT_START_DATE && dateKey <= REPEAT_END_DATE;
}

function formatDateLabel(dateKey) {
  return dateKey.replaceAll("-", ".");
}

function startOfWeek(date) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  local.setDate(local.getDate() - local.getDay());
  return local;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(dateKey) {
  const [year, month, date] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatKoreanDate(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function hourLabel(hour) {
  const normalized = Math.min(23, Math.max(0, Number.parseInt(hour, 10) || 0));
  return `${String(normalized).padStart(2, "0")}:00`;
}

function registrationHourLabel(hour) {
  return hourLabel(Math.min(REGISTRATION_END_HOUR, Number.parseInt(hour, 10) || 0));
}

function normalizeTime(value) {
  const match = String(value).match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return "";
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2] || "00";
  if (hour < 0 || hour > 23) return "";
  if (minute !== "00") return "";
  return `${String(hour).padStart(2, "0")}:00`;
}

function normalizeRegistrationTime(value) {
  const time = normalizeTime(value);
  if (!time || !isRegistrationTime(time)) return "";
  return time;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeKey(value) {
  return /^(?:[01]\d|2[0-3]):00$/.test(value);
}

function isRegistrationTime(value) {
  if (!isTimeKey(value)) return false;
  return Number.parseInt(value.slice(0, 2), 10) <= REGISTRATION_END_HOUR;
}

function isRegistrationSlot(date, time) {
  return isRegistrationDate(date) && isRegistrationTime(time);
}

function isRegistrationDate(dateKey) {
  return isDateKey(dateKey) && parseDate(dateKey).getDay() !== 0;
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
