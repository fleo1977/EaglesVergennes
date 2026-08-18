#!/usr/bin/env python3
"""Sync a public Google Calendar ICS feed into website JSON."""

import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import urlopen

import recurring_ical_events
from icalendar import Calendar


CALENDAR_URL = os.environ.get(
    "CALENDAR_ICS_URL",
    "https://calendar.google.com/calendar/ical/"
    "00dq4dubgr8368k55d573sjes80qg1tn%40import.calendar.google.com/"
    "public/basic.ics",
)
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "events.json"


def iso_value(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), False
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time(), timezone.utc).isoformat().replace("+00:00", "Z"), True
    raise TypeError(f"Unsupported calendar date: {value!r}")


def main():
    with urlopen(CALENDAR_URL, timeout=30) as response:
        calendar = Calendar.from_ical(response.read())

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=730)
    components = recurring_ical_events.of(calendar).between(now - timedelta(days=7), horizon)
    events = []

    for component in components:
        start, all_day = iso_value(component.decoded("DTSTART"))
        end_value = component.decoded("DTEND") if component.get("DTEND") else component.decoded("DTSTART")
        end, _ = iso_value(end_value)
        events.append(
            {
                "title": str(component.get("SUMMARY", "Untitled event")),
                "start": start,
                "end": end,
                "allDay": all_day,
            }
        )

    events.sort(key=lambda event: event["start"])
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps({"updated": now.isoformat(), "events": events}, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
