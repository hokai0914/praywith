import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CLIENT_CONFIG = {
  firebase: {
    apiKey: "AIzaSyAdbxYnK4sVf91yyhhZHAbHg-zuV1A9cbk",
    authDomain: "praywith-ba55f.firebaseapp.com",
    projectId: "praywith-ba55f",
    storageBucket: "praywith-ba55f.firebasestorage.app",
    messagingSenderId: "329392260667",
    appId: "1:329392260667:web:4c0eacbd7e6215b73d7e1e"
  },
  collectionName: "schedules",
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DEFAULT_START_HOUR = 6;
const REGISTRATION_END_HOUR = 22;
const REGISTRATION_END_TIME = "22:00";
const DEFAULT_END_HOUR = REGISTRATION_END_HOUR;
const REGISTRATION_START_DATE = "2026-08-26";
const REGISTRATION_END_DATE = "2026-10-07";
const REPEAT_START_DATE = REGISTRATION_START_DATE;
const REPEAT_END_DATE = REGISTRATION_END_DATE;
const VIEW_MODES = {
  WEEK: "week",
  MONTH: "month",
};
const EVENT_CACHE_TTL_MS = 15 * 1000;
const MAX_BULK_CREATE_COUNT = 1200;
const FIRESTORE_BATCH_LIMIT = 450;
const REPEAT_WEEKDAYS = [
  { value: 0, label: "일", disabled: true },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

let firebaseApp;
let firestoreDb;

const state = {
  viewMode: VIEW_MODES.WEEK,
  currentWeekStart: startOfWeek(new Date()),
  currentMonthStart: startOfMonth(new Date()),
  events: [],
  loading: false,
  loadRequestId: 0,
  eventCache: new Map(),
  selectedEvent: null,
  selectedDate: null,
  pendingDelete: null,
};

const els = {
  calendarWrap: document.querySelector(".calendar-wrap"),
  calendarGrid: document.querySelector("#calendarGrid"),
  periodRange: document.querySelector("#periodRange"),
  periodEyebrow: document.querySelector("#periodEyebrow"),
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
  dayDialog: document.querySelector("#dayDialog"),
  dayTitle: document.querySelector("#dayTitle"),
  dayMeta: document.querySelector("#dayMeta"),
  dayEventList: document.querySelector("#dayEventList"),
  addDayEvent: document.querySelector("#addDayEvent"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmCopy: document.querySelector("#confirmCopy"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  renderRepeatControls();
  syncEventFormMode();
  bindActions();
  render();
  loadEvents();
}

function bindActions() {
  document.body.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const { action } = actionButton.dataset;
    if (action === "prev-period") shiftPeriod(-1);
    if (action === "next-period") shiftPeriod(1);
    if (action === "set-view") switchView(actionButton.dataset.view);
    if (action === "today") goToToday();
    if (action === "add-event") openEventDialog(formatDate(new Date()), registrationHourLabel(new Date().getHours()));
    if (action === "add-day-event") openSelectedDateEventDialog();
    if (action === "close-event") closeDialog(els.eventDialog);
    if (action === "close-detail") closeDialog(els.detailDialog);
    if (action === "close-day") closeDayDialog();
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
  els.eventDate.min = REGISTRATION_START_DATE;
  els.eventDate.max = REGISTRATION_END_DATE;
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

function isFirebaseConfigured() {
  const config = CLIENT_CONFIG.firebase || {};
  return ["apiKey", "projectId", "appId"].every((key) => String(config[key] || "").trim());
}

function getFirestoreDb() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase 설정이 필요합니다.");
  }

  if (!firebaseApp) {
    firebaseApp = initializeApp(CLIENT_CONFIG.firebase);
    firestoreDb = getFirestore(firebaseApp);
  }

  return firestoreDb;
}

function getSchedulesCollection() {
  return collection(getFirestoreDb(), CLIENT_CONFIG.collectionName);
}

function getScheduleDocument(id) {
  return doc(getFirestoreDb(), CLIENT_CONFIG.collectionName, id);
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

function shiftPeriod(direction) {
  if (state.viewMode === VIEW_MODES.MONTH) {
    state.currentMonthStart = addMonths(state.currentMonthStart, direction);
  } else {
    state.currentWeekStart = addDays(state.currentWeekStart, direction * 7);
  }
  render();
  loadEvents();
}

function switchView(viewMode) {
  if (!Object.values(VIEW_MODES).includes(viewMode) || viewMode === state.viewMode) return;

  const anchorDate = getSelectedAnchorDate() || getViewAnchorDate();
  state.viewMode = viewMode;
  if (viewMode === VIEW_MODES.MONTH) {
    state.currentMonthStart = startOfMonth(anchorDate);
  } else {
    state.currentWeekStart = startOfWeek(anchorDate);
  }
  render();
  loadEvents();
}

function goToToday() {
  const today = new Date();
  state.currentWeekStart = startOfWeek(today);
  state.currentMonthStart = startOfMonth(today);
  state.selectedDate = formatDate(today);
  render();
  loadEvents();
}

async function loadEvents() {
  const requestId = state.loadRequestId + 1;
  state.loadRequestId = requestId;
  const { from, to } = getVisibleDateRange();
  const cacheKey = getEventCacheKey(from, to);

  if (!isFirebaseConfigured()) {
    state.events = [];
    setLoading(false);
    updateConnectionStatus("Firebase 설정 필요");
    render();
    return;
  }

  const cachedEvents = getCachedEvents(cacheKey);
  if (cachedEvents) {
    state.events = cachedEvents;
    setLoading(false);
    updateConnectionStatus("Firebase 연결됨");
    render();
    return;
  }

  setLoading(true);
  updateConnectionStatus("불러오는 중");
  try {
    const response = await apiList(from, to);
    if (requestId !== state.loadRequestId) return;
    const events = normalizeEvents(response.events || []);
    cacheEvents(cacheKey, events);
    state.events = events;
    updateConnectionStatus("Firebase 연결됨");
    render();
  } catch (error) {
    if (requestId !== state.loadRequestId) return;
    showToast(error.message || "일정을 불러오지 못했습니다.", "error");
    updateConnectionStatus("연결 실패");
    state.events = [];
    render();
  } finally {
    if (requestId === state.loadRequestId) setLoading(false);
  }
}

function render() {
  updateViewButtons();
  if (state.viewMode === VIEW_MODES.MONTH) {
    renderMonth();
  } else {
    renderWeek();
  }
  if (els.dayDialog.open && state.selectedDate) renderDayDialog(state.selectedDate);
  centerTodayOnMobile();
}

function renderWeek() {
  const days = getWeekDays();
  const fromLabel = formatKoreanDate(days[0]);
  const toLabel = formatKoreanDate(days[6]);
  els.periodEyebrow.textContent = "Weekly timetable";
  els.periodRange.textContent = `${fromLabel} - ${toLabel}`;
  els.calendarGrid.className = "calendar-grid calendar-grid--week";
  els.calendarGrid.setAttribute("aria-label", "주간 시간표");
  renderWeekCalendar(days);
}

function renderMonth() {
  const days = getMonthDays();
  els.periodEyebrow.textContent = "Monthly calendar";
  els.periodRange.textContent = formatKoreanMonth(state.currentMonthStart);
  els.calendarGrid.className = "calendar-grid calendar-grid--month";
  els.calendarGrid.setAttribute("aria-label", "월간 달력");
  renderMonthCalendar(days);
}

function updateViewButtons() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const isActive = button.dataset.view === state.viewMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function centerTodayOnMobile() {
  if (!window.matchMedia("(max-width: 760px)").matches) return;

  window.requestAnimationFrame(() => {
    const todayTarget = els.calendarGrid.querySelector(`[data-date="${formatDate(new Date())}"]`);
    if (!todayTarget) return;

    const leftInset = state.viewMode === VIEW_MODES.WEEK ? els.calendarGrid.querySelector(".corner")?.offsetWidth || 0 : 0;
    const visibleWidth = Math.max(1, els.calendarWrap.clientWidth - leftInset);
    const left = todayTarget.offsetLeft + todayTarget.offsetWidth / 2 - leftInset - visibleWidth / 2;

    const scrollOptions = {
      left: clampScroll(left, els.calendarWrap.scrollWidth - els.calendarWrap.clientWidth),
    };

    if (state.viewMode === VIEW_MODES.MONTH) {
      const topInset = els.calendarGrid.querySelector(".month-weekday-head")?.offsetHeight || 0;
      const visibleHeight = Math.max(1, els.calendarWrap.clientHeight - topInset);
      const top = todayTarget.offsetTop + todayTarget.offsetHeight / 2 - topInset - visibleHeight / 2;
      scrollOptions.top = clampScroll(top, els.calendarWrap.scrollHeight - els.calendarWrap.clientHeight);
    }

    els.calendarWrap.scrollTo(scrollOptions);
  });
}

function clampScroll(value, maxValue) {
  return Math.min(Math.max(0, value), Math.max(0, maxValue));
}

function renderWeekCalendar(days) {
  els.calendarGrid.innerHTML = "";
  const hours = getVisibleHours();
  const todayKey = formatDate(new Date());

  els.calendarGrid.append(createElement("div", "corner"));
  days.forEach((day, index) => {
    const dayKey = formatDate(day);
    const head = createElement("div", `day-head${dayKey === todayKey ? " is-today" : ""}`);
    head.setAttribute("role", "columnheader");
    head.dataset.date = dayKey;
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

function renderMonthCalendar(days) {
  els.calendarGrid.innerHTML = "";
  const todayKey = formatDate(new Date());
  const currentMonth = state.currentMonthStart.getMonth();

  DAY_LABELS.forEach((label, index) => {
    const head = createElement("div", `month-weekday-head${index === 0 ? " is-sunday" : ""}`, label);
    head.setAttribute("role", "columnheader");
    els.calendarGrid.append(head);
  });

  days.forEach((day) => {
    const date = formatDate(day);
    const cell = createMonthDayCell(day, {
      date,
      isCurrentMonth: day.getMonth() === currentMonth,
      isToday: date === todayKey,
      isSelected: date === state.selectedDate,
    });
    els.calendarGrid.append(cell);
  });
}

function createMonthDayCell(day, options) {
  const { date, isCurrentMonth, isToday, isSelected } = options;
  const canRegister = isRegistrationDate(date);
  const className = [
    "month-day-cell",
    isCurrentMonth ? "" : "is-outside",
    isToday ? "is-today" : "",
    isSelected ? "is-selected" : "",
    canRegister ? "" : "is-disabled",
  ].filter(Boolean).join(" ");
  const cell = createElement("div", className);
  cell.setAttribute("role", "gridcell");
  cell.dataset.date = date;

  const dayButton = createElement("button", "month-day-button");
  dayButton.type = "button";
  dayButton.setAttribute("aria-label", `${date} 일정 목록 보기`);
  dayButton.addEventListener("click", () => openDayDialog(date));
  cell.append(dayButton);

  const dateText = day.getDate() === 1 || !isCurrentMonth ? `${day.getMonth() + 1}/${day.getDate()}` : String(day.getDate());
  const number = createElement("div", "month-day-number");
  number.append(createElement("span", "", dateText));
  cell.append(number);

  const dayEvents = eventsForDate(date);
  if (dayEvents.length) {
    const summary = createElement("p", "month-prayer-summary", formatPrayerHoursSummary(dayEvents));
    cell.append(summary);
  }

  return cell;
}

function createSlot(date, time) {
  const canRegister = isRegistrationSlot(date, time);
  const slot = createElement("div", `slot${canRegister ? "" : " is-disabled"}`);
  slot.setAttribute("role", "gridcell");

  const slotButton = createElement("button", "slot-button");
  slotButton.type = "button";
  slotButton.setAttribute("aria-label", `${date} ${time} 릴레이 기도 등록`);
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

function createEventCard(event, options = {}) {
  const showTime = options.showTime === true;
  const variantClass = options.variant ? ` event-card--${options.variant}` : "";
  const card = createElement("article", `event-card${event.completed ? " completed" : ""}${variantClass}`);
  card.tabIndex = 0;
  card.setAttribute("aria-label", `${event.time} ${event.personName}`);
  const openDetail = () => {
    if (options.closeDayBeforeDetail) closeDialog(els.dayDialog);
    openDetailDialog(event);
  };
  card.addEventListener("click", openDetail);
  card.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      openDetail();
    }
  });

  const checkbox = document.createElement("input");
  checkbox.className = "event-check";
  checkbox.type = "checkbox";
  checkbox.checked = event.completed;
  checkbox.setAttribute("aria-label", `${event.personName} 완료`);
  checkbox.addEventListener("click", (clickEvent) => clickEvent.stopPropagation());
  checkbox.addEventListener("change", async () => toggleEvent(event.id, checkbox.checked));

  const nameText = showTime ? `${event.time} ${event.personName}` : event.personName;
  const nameButton = createElement("button", "event-name", nameText);
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

function eventsForDate(date) {
  return state.events
    .filter((event) => event.date === date)
    .sort((a, b) => {
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return a.personName.localeCompare(b.personName, "ko-KR");
    });
}

function formatPrayerHoursSummary(events) {
  return `모두 ${events.length} 시간의 기도시간이 분양되었어요`;
}

function getVisibleHours() {
  const eventHours = getVisibleEvents()
    .map((event) => Number.parseInt(event.time.slice(0, 2), 10))
    .filter((hour) => Number.isInteger(hour));
  const first = Math.min(DEFAULT_START_HOUR, ...eventHours);
  const last = Math.max(DEFAULT_END_HOUR, ...eventHours);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function openEventDialog(date, time) {
  if (!isFirebaseConfigured()) {
    showToast("Firebase 설정이 없어 등록할 수 없습니다.", "error");
    return;
  }
  if (!isRegistrationDate(date)) {
    showToast(getRegistrationDateError(date), "error");
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

function openDayDialog(date) {
  if (!isDateKey(date)) return;
  state.selectedDate = date;
  renderDayDialog(date);
  showDialog(els.dayDialog);
}

function renderDayDialog(date) {
  const dayEvents = eventsForDate(date);
  const canRegister = isRegistrationDate(date);
  const parsedDate = parseDate(date);

  els.dayTitle.textContent = formatKoreanDateWithWeekday(parsedDate);
  els.dayMeta.textContent = dayEvents.length ? `${dayEvents.length}개 일정이 등록되어 있습니다.` : "등록된 일정이 없습니다.";
  renderDaySchedule(date, parsedDate);

  if (canRegister) {
    delete els.addDayEvent.dataset.alwaysDisabled;
    els.addDayEvent.disabled = state.loading;
    els.addDayEvent.textContent = "이 날짜에 등록";
  } else {
    els.addDayEvent.dataset.alwaysDisabled = "true";
    els.addDayEvent.disabled = true;
    els.addDayEvent.textContent = "일요일은 등록 불가";
  }
}

function closeDayDialog() {
  closeDialog(els.dayDialog);
}

function openSelectedDateEventDialog() {
  if (!state.selectedDate) return;
  const date = state.selectedDate;
  closeDialog(els.dayDialog);
  openEventDialog(date, hourLabel(DEFAULT_START_HOUR));
}

function renderDaySchedule(date, parsedDate) {
  els.dayEventList.innerHTML = "";

  const corner = createElement("div", "corner");
  const head = createElement("div", "day-head");
  head.setAttribute("role", "columnheader");
  head.innerHTML = `
    <span class="day-name">${DAY_LABELS[parsedDate.getDay()]}</span>
    <span class="day-date">${parsedDate.getMonth() + 1}/${parsedDate.getDate()}</span>
  `;
  els.dayEventList.append(corner, head);

  getDayVisibleHours(date).forEach((hour) => {
    const time = hourLabel(hour);
    const timeCell = createElement("div", "time-cell", time);
    timeCell.setAttribute("role", "rowheader");
    els.dayEventList.append(timeCell, createDaySlot(date, time));
  });
}

function createDaySlot(date, time) {
  const canRegister = isRegistrationSlot(date, time);
  const slot = createElement("div", `slot day-slot${canRegister ? "" : " is-disabled"}`);
  slot.setAttribute("role", "gridcell");

  const slotButton = createElement("button", "slot-button");
  slotButton.type = "button";
  slotButton.setAttribute("aria-label", `${date} ${time} 릴레이 기도 등록`);
  if (canRegister) {
    slotButton.addEventListener("click", () => {
      closeDialog(els.dayDialog);
      openEventDialog(date, time);
    });
  } else {
    slotButton.disabled = true;
    slotButton.dataset.alwaysDisabled = "true";
    slotButton.setAttribute("aria-disabled", "true");
  }
  slot.append(slotButton);

  const events = eventsForSlot(date, time);
  const stack = createElement("div", "events");
  events.forEach((event) => {
    stack.append(createEventCard(event, { closeDayBeforeDetail: true }));
  });
  slot.append(stack);

  return slot;
}

function getDayVisibleHours(date) {
  const eventHours = eventsForDate(date)
    .map((event) => Number.parseInt(event.time.slice(0, 2), 10))
    .filter((hour) => Number.isInteger(hour));
  const first = Math.min(DEFAULT_START_HOUR, ...eventHours);
  const last = Math.max(DEFAULT_END_HOUR, ...eventHours);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
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
    showToast(getRegistrationDateError(payload.date), "error");
    return;
  }

  try {
    setLoading(true);
    const response = await apiPost({ action: "create", event: payload });
    const createdEvent = normalizeEvents([response.event])[0];
    clearEventCache();
    state.events = [...state.events, createdEvent].filter(Boolean);
    closeDialog(els.eventDialog);
    showToast("일정을 등록했습니다.");
    render();
  } catch (error) {
    showToast(error.message || "릴레이 기도 등록에 실패했습니다.", "error");
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
    clearEventCache();
    state.events = normalizeEvents([...state.events, ...createdEvents]);
    closeDialog(els.eventDialog);
    showToast(`${createdEvents.length}개 일정을 등록했습니다.`);
    render();
  } catch (error) {
    showToast(error.message || "반복 릴레이 기도 등록에 실패했습니다.", "error");
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
    clearEventCache();
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
    clearEventCache();
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
  if (!isFirebaseConfigured()) throw new Error("Firebase 설정이 필요합니다.");

  const eventsQuery = query(
    getSchedulesCollection(),
    where("date", ">=", from),
    where("date", "<=", to),
    orderBy("date"),
  );
  const snapshot = await getDocs(eventsQuery);
  const events = snapshot.docs.map((scheduleDoc) => ({
    ...scheduleDoc.data(),
    id: scheduleDoc.id,
  }));

  return { ok: true, events };
}

async function apiPost(payload) {
  if (!isFirebaseConfigured()) throw new Error("Firebase 설정이 필요합니다.");

  if (payload.action === "create") {
    const event = await createScheduleEvent(payload.event || {});
    return { ok: true, event };
  }

  if (payload.action === "bulkCreate") {
    const events = await createScheduleEvents(payload.events || []);
    return { ok: true, events };
  }

  if (payload.action === "toggle") {
    await updateDoc(getScheduleDocument(normalizeEventId(payload.id)), {
      completed: payload.completed === true,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  }

  if (payload.action === "delete") {
    await deleteDoc(getScheduleDocument(normalizeEventId(payload.id)));
    return { ok: true };
  }

  throw new Error("지원하지 않는 요청입니다.");
}

async function createScheduleEvent(input) {
  const docRef = doc(getSchedulesCollection());
  const now = new Date().toISOString();
  const event = buildScheduleRecord(input, docRef.id, now, false);

  await setDoc(docRef, event);
  return event;
}

async function createScheduleEvents(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error("등록할 일정이 없습니다.");
  if (inputs.length > MAX_BULK_CREATE_COUNT) throw new Error("한 번에 등록할 일정이 너무 많습니다.");

  const now = new Date().toISOString();
  const createdEvents = inputs.map((input) => {
    const docRef = doc(getSchedulesCollection());
    return {
      ref: docRef,
      event: buildScheduleRecord(input, docRef.id, now, true),
    };
  });

  for (let index = 0; index < createdEvents.length; index += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(getFirestoreDb());
    createdEvents.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach(({ ref, event }) => {
      batch.set(ref, event);
    });
    await batch.commit();
  }

  return createdEvents.map(({ event }) => event);
}

function buildScheduleRecord(input, id, now, repeatOnly) {
  return {
    id,
    date: normalizeScheduleDate(input.date, repeatOnly),
    time: normalizeScheduleTime(input.time),
    personName: normalizeSchedulePersonName(input.personName),
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeEventId(value) {
  const id = String(value || "").trim();
  if (!id) throw new Error("일정 ID가 필요합니다.");
  return id;
}

function normalizeScheduleDate(value, repeatOnly) {
  const date = String(value || "").trim();
  if (!isDateKey(date)) throw new Error("날짜 형식이 올바르지 않습니다.");
  if (!isRegistrationDate(date)) throw new Error(getRegistrationDateError(date));
  if (repeatOnly && !isRepeatDate(date)) throw new Error("반복 등록 기간을 벗어난 날짜입니다.");
  return date;
}

function normalizeScheduleTime(value) {
  const time = normalizeRegistrationTime(String(value || ""));
  if (!time) throw new Error("시간은 22:00 이하의 정각이어야 합니다.");
  return time;
}

function normalizeSchedulePersonName(value) {
  const personName = String(value || "").trim();
  if (!personName) throw new Error("이름을 입력해 주세요.");
  if (personName.length > 80) throw new Error("이름은 80자 이하로 입력해 주세요.");
  return personName;
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

function getEventCacheKey(from, to) {
  return `${from}:${to}`;
}

function getCachedEvents(cacheKey) {
  const cached = state.eventCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > EVENT_CACHE_TTL_MS) {
    state.eventCache.delete(cacheKey);
    return null;
  }

  return cloneEvents(cached.events);
}

function cacheEvents(cacheKey, events) {
  state.eventCache.set(cacheKey, {
    cachedAt: Date.now(),
    events: cloneEvents(events),
  });
}

function clearEventCache() {
  state.eventCache.clear();
}

function cloneEvents(events) {
  return events.map((event) => ({ ...event }));
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

function getSelectedAnchorDate() {
  return isDateKey(state.selectedDate) ? parseDate(state.selectedDate) : null;
}

function getViewAnchorDate() {
  return state.viewMode === VIEW_MODES.MONTH ? state.currentMonthStart : state.currentWeekStart;
}

function getVisibleDateRange() {
  if (state.viewMode === VIEW_MODES.MONTH) {
    const days = getMonthDays();
    return {
      from: formatDate(days[0]),
      to: formatDate(days[days.length - 1]),
    };
  }

  const days = getWeekDays();
  return {
    from: formatDate(days[0]),
    to: formatDate(days[6]),
  };
}

function getVisibleEvents() {
  const { from, to } = getVisibleDateRange();
  return state.events.filter((event) => event.date >= from && event.date <= to);
}

function getWeekDays() {
  return Array.from({ length: 7 }, (_, index) => addDays(state.currentWeekStart, index));
}

function getMonthDays() {
  const firstVisibleDay = startOfWeek(state.currentMonthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(firstVisibleDay, index));
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

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
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

function formatKoreanDateWithWeekday(date) {
  return `${formatKoreanDate(date)} (${DAY_LABELS[date.getDay()]})`;
}

function formatKoreanMonth(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
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
  return isDateKey(dateKey) && dateKey >= REGISTRATION_START_DATE && dateKey <= REGISTRATION_END_DATE && parseDate(dateKey).getDay() !== 0;
}

function getRegistrationDateError(dateKey) {
  if (!isDateKey(dateKey)) return "날짜 형식이 올바르지 않습니다.";
  if (dateKey < REGISTRATION_START_DATE || dateKey > REGISTRATION_END_DATE) {
    return "기도 등록은 2026년 8월 26일부터 2026년 10월 7일까지 가능합니다.";
  }
  if (parseDate(dateKey).getDay() === 0) return "일요일은 선택할 수 없습니다.";
  return "선택할 수 없는 날짜입니다.";
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
