const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const suggestionForm = document.querySelector('.suggestion-form');
const formStatus = document.querySelector('.form-status');
const dropdownToggles = document.querySelectorAll('.dropdown-toggle');

menuToggle?.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

dropdownToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const item = toggle.closest('.has-dropdown');
    const isOpen = item.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
});

suggestionForm?.addEventListener('submit', (event) => {
  if (suggestionForm.hasAttribute('action')) return;
  event.preventDefault();
  suggestionForm.reset();
  formStatus.textContent = 'Thanks. Your suggestion has been noted for the next build step.';
});

const calendarDataUrl = 'data/events.json';
const calendarTimeZone = 'America/New_York';
const calendarStartHour = 8;
const calendarEndHour = 22;
const calendarLayoutStartHour = 7.5;

const parseCalendarDate = (value) => new Date(value);

const formatEventDate = (date) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: calendarTimeZone,
}).format(date);

const formatEventTime = (date) => new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: calendarTimeZone,
}).format(date);

const loadCalendarEvents = async () => {
  const response = await fetch(calendarDataUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Calendar data is unavailable.');
  const data = await response.json();
  return data.events || [];
};

const upcomingEvents = document.querySelector('#upcoming-events');

if (upcomingEvents) {
  loadCalendarEvents()
    .then((events) => {
      const now = new Date();
      const nextFour = events
        .filter((event) => parseCalendarDate(event.end || event.start) >= now)
        .slice(0, 4);

      if (!nextFour.length) {
        upcomingEvents.innerHTML = '<li class="event-empty">No upcoming events are scheduled.</li>';
        return;
      }

      upcomingEvents.innerHTML = nextFour.map((event) => {
        const start = parseCalendarDate(event.start);
        const time = event.allDay ? 'All day' : formatEventTime(start);
        return `<li><span>${formatEventDate(start)}<small>${time}</small></span><strong>${event.title}</strong></li>`;
      }).join('');
    })
    .catch(() => {
      upcomingEvents.innerHTML = '<li class="event-empty">Upcoming events are temporarily unavailable.</li>';
    });
}

const weekGrid = document.querySelector('#week-calendar-grid');

if (weekGrid) {
  const rangeHeading = document.querySelector('#calendar-range');
  const calendarStatus = document.querySelector('#calendar-status');
  let visibleWeek = new Date();
  let calendarEvents = [];

  const startOfMonday = (date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    const day = result.getDay();
    result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
    return result;
  };

  const renderWeek = () => {
    const monday = startOfMonday(visibleWeek);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    rangeHeading.textContent = `${formatEventDate(monday)} – ${formatEventDate(sunday)}, ${sunday.getFullYear()}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + index);
      return date;
    });

    const headings = ['<div class="calendar-corner" aria-hidden="true"></div>']
      .concat(days.map((day) => {
        const isToday = day.getTime() === today.getTime();
        return `<div class="calendar-day-heading${isToday ? ' is-today' : ''}"${isToday ? ' aria-current="date"' : ''}><span>${new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day)}</span><strong>${day.getDate()}</strong></div>`;
      }))
      .join('');

    const timeLabels = Array.from({ length: calendarEndHour - calendarStartHour + 1 }, (_, index) => {
      const hour = calendarStartHour + index;
      const label = new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(new Date(2020, 0, 1, hour));
      const offset = index + (calendarStartHour - calendarLayoutStartHour);
      return `<span class="calendar-time-label" style="top: calc(var(--hour-height) * ${offset})">${label}</span>`;
    }).join('');

    const columns = days.map((day) => {
      const isToday = day.getTime() === today.getTime();
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const dayEvents = calendarEvents.filter((event) => {
        const start = parseCalendarDate(event.start);
        return start >= day && start < nextDay;
      });

      const eventMarkup = dayEvents.map((event) => {
        const start = parseCalendarDate(event.start);
        const end = parseCalendarDate(event.end || event.start);
        if (event.allDay) {
          return `<div class="calendar-event calendar-event--all-day"><strong>${event.title}</strong><time>All day</time></div>`;
        }

        const startValue = start.getHours() + start.getMinutes() / 60;
        const endValue = end.getHours() + end.getMinutes() / 60;
        if (endValue <= calendarStartHour || startValue >= calendarEndHour) return '';
        const clippedStart = Math.max(startValue, calendarStartHour);
        const clippedEnd = Math.min(endValue, calendarEndHour);
        const top = clippedStart - calendarLayoutStartHour;
        const height = Math.max(clippedEnd - clippedStart, 0.5);
        return `<div class="calendar-event" style="top: calc(var(--hour-height) * ${top}); height: calc(var(--hour-height) * ${height} - 3px)"><strong>${event.title}</strong><time>${formatEventTime(start)}–${formatEventTime(end)}</time></div>`;
      }).join('');

      return `<div class="calendar-day-column${isToday ? ' is-today' : ''}">${eventMarkup}</div>`;
    }).join('');

    weekGrid.innerHTML = `${headings}<div class="calendar-time-column">${timeLabels}</div>${columns}`;
  };

  document.querySelector('#previous-week')?.addEventListener('click', () => {
    visibleWeek.setDate(visibleWeek.getDate() - 7);
    renderWeek();
  });

  document.querySelector('#next-week')?.addEventListener('click', () => {
    visibleWeek.setDate(visibleWeek.getDate() + 7);
    renderWeek();
  });

  document.querySelector('#current-week')?.addEventListener('click', () => {
    visibleWeek = new Date();
    renderWeek();
  });

  loadCalendarEvents()
    .then((events) => {
      calendarEvents = events;
      renderWeek();
    })
    .catch(() => {
      calendarStatus.textContent = 'Calendar events are temporarily unavailable.';
      renderWeek();
    });
}
