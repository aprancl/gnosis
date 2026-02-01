"use client";

/**
 * StreakCalendar - Grid visualization of activity days.
 *
 * Displays a grid of the last 12 weeks (84 days) showing which days
 * had completed scenarios. Active days are highlighted in blue,
 * with the current streak prominently shown.
 */

interface StreakCalendarProps {
  /** Array of ISO date strings (YYYY-MM-DD) with activity */
  activeDays: string[];
  /** Current streak count */
  streak: number;
}

/**
 * Generate an array of dates for the last N weeks ending today.
 */
function generateCalendarDays(weeks: number): string[] {
  const days: string[] = [];
  const today = new Date();
  const totalDays = weeks * 7;

  // Start from (totalDays - 1) days ago, go up to today
  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    days.push(dateStr);
  }

  return days;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function StreakCalendar({
  activeDays,
  streak,
}: StreakCalendarProps) {
  const weeks = 12;
  const calendarDays = generateCalendarDays(weeks);
  const activeSet = new Set(activeDays);

  // Organize days into columns (weeks) of 7 rows (days of week, Mon=0)
  // calendarDays is a flat array starting from a Monday ideally
  // We need to figure out the weekday offset for the first day
  const firstDate = new Date(calendarDays[0] + "T00:00:00Z");
  // getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat. We want Mon=0, so adjust.
  const firstDayOfWeek = (firstDate.getUTCDay() + 6) % 7; // Mon=0

  // Build week columns
  const weekColumns: (string | null)[][] = [];
  let currentWeek: (string | null)[] = [];

  // Pad the first week if it doesn't start on Monday
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(null);
  }

  for (const day of calendarDays) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weekColumns.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    // Pad last week
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weekColumns.push(currentWeek);
  }

  // Determine month labels to show above the grid
  const monthLabels: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weekColumns.length; w++) {
    // Use the first non-null day of the week for month calculation
    const firstDay = weekColumns[w].find((d) => d !== null);
    if (firstDay) {
      const month = new Date(firstDay + "T00:00:00Z").getUTCMonth();
      if (month !== lastMonth) {
        monthLabels.push({ weekIndex: w, label: MONTH_NAMES[month] });
        lastMonth = month;
      }
    }
  }

  const cellSize = 14;
  const cellGap = 3;
  const dayLabelWidth = 28;

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div className="font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
          Activity
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-2xl font-bold text-blue-900">
            {streak}
          </span>
          <span className="font-serif text-sm text-blue-800/60">
            day streak
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: `${dayLabelWidth + weekColumns.length * (cellSize + cellGap)}px` }}>
          {/* Month labels */}
          <div className="flex" style={{ paddingLeft: `${dayLabelWidth}px` }}>
            {monthLabels.map(({ weekIndex, label }) => (
              <div
                key={`${weekIndex}-${label}`}
                className="font-sans text-[10px] text-blue-400"
                style={{
                  position: "relative",
                  left: `${weekIndex * (cellSize + cellGap)}px`,
                  marginRight: `${-8}px`,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="mt-1 flex">
            {/* Day of week labels */}
            <div
              className="flex flex-col"
              style={{ width: `${dayLabelWidth}px` }}
            >
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="font-sans text-[10px] text-blue-400 flex items-center"
                  style={{ height: `${cellSize + cellGap}px` }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex gap-[3px]">
              {weekColumns.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-[3px]">
                  {week.map((day, dayIdx) => {
                    if (day === null) {
                      return (
                        <div
                          key={dayIdx}
                          style={{ width: cellSize, height: cellSize }}
                        />
                      );
                    }

                    const isActive = activeSet.has(day);
                    const isToday = day === calendarDays[calendarDays.length - 1];

                    return (
                      <div
                        key={dayIdx}
                        title={`${day}${isActive ? " - Active" : ""}`}
                        className={`rounded-sm transition-colors ${
                          isActive
                            ? "bg-blue-600"
                            : "bg-blue-100/60"
                        } ${isToday ? "ring-1 ring-blue-400" : ""}`}
                        style={{ width: cellSize, height: cellSize }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="font-sans text-[10px] text-blue-400">Less</span>
            <div
              className="rounded-sm bg-blue-100/60"
              style={{ width: cellSize, height: cellSize }}
            />
            <div
              className="rounded-sm bg-blue-600"
              style={{ width: cellSize, height: cellSize }}
            />
            <span className="font-sans text-[10px] text-blue-400">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
