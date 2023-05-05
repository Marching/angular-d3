import { bisector, tickStep } from 'd3-array';
import {
  timeMillisecond,
  timeSecond,
  timeMinute,
  timeHour,
  timeDay,
  timeWeek,
  timeMonth,
  timeYear
} from 'd3-time';

import { TimePrecision } from './chart-options';

const durationSecond = 1000;
const durationMinute = durationSecond * 60;
const durationHour = durationMinute * 60;
const durationDay = durationHour * 24;
const durationWeek = durationDay * 7;
const durationMonth = durationDay * 30;
const durationYear = durationDay * 365;

const tickIntervals: Array<[d3.CountableTimeInterval, number, number]> = [
  [timeSecond, 1, durationSecond],
  [timeSecond, 2, 2 * durationSecond],
  [timeSecond, 3, 3 * durationSecond],
  [timeSecond, 4, 4 * durationSecond],
  [timeSecond, 5, 5 * durationSecond],
  [timeSecond, 10, 10 * durationSecond],
  [timeSecond, 15, 15 * durationSecond],
  [timeSecond, 30, 30 * durationSecond],
  [timeMinute, 1, durationMinute],
  [timeMinute, 2, 2 * durationMinute],
  [timeMinute, 3, 3 * durationMinute],
  [timeMinute, 4, 4 * durationMinute],
  [timeMinute, 5, 5 * durationMinute],
  [timeMinute, 10, 10 * durationMinute],
  [timeMinute, 15, 15 * durationMinute],
  [timeMinute, 30, 30 * durationMinute],
  [timeHour, 1, durationHour],
  [timeHour, 2, 2 * durationHour],
  [timeHour, 3, 3 * durationHour],
  [timeHour, 4, 4 * durationHour],
  [timeHour, 6, 6 * durationHour],
  [timeHour, 8, 8 * durationHour],
  [timeHour, 12, 12 * durationHour],
  [timeDay, 1, durationDay],
  [timeDay, 2, 2 * durationDay],
  [timeDay, 3, 3 * durationDay],
  [timeDay, 4, 4 * durationDay],
  [timeDay, 5, 5 * durationDay],
  [timeDay, 6, 6 * durationDay],
  [timeDay, 10, 10 * durationDay],
  [timeWeek, 1, durationWeek],
  [timeMonth, 1, durationMonth],
  [timeMonth, 2, 2 * durationMonth],
  [timeMonth, 3, 3 * durationMonth],
  [timeMonth, 4, 4 * durationMonth],
  [timeMonth, 6, 6 * durationMonth],
  [timeYear, 1, durationYear]
];

const detectTimeInterval = (precision: TimePrecision): d3.CountableTimeInterval => {
  let timeInterval: d3.CountableTimeInterval;

  switch (precision) {
    case 'second':
      timeInterval = timeSecond;
      break;
    case 'minute':
      timeInterval = timeMinute;
      break;
    case 'hour':
      timeInterval = timeHour;
      break;
    case 'day':
      timeInterval = timeDay;
      break;
    case 'week':
      timeInterval = timeWeek;
      break;
    case 'month':
      timeInterval = timeMonth;
      break;
    case 'year':
      timeInterval = timeYear;
      break;
    default:
      timeInterval = timeMillisecond;
  }
  return timeInterval;
};

export const axisTimeTickInterval = (
  start: number,
  stop: number,
  count: number,
  minPrecision?: TimePrecision
): d3.TimeInterval => {
  const target = Math.abs(stop - start) / count;
  const i = bisector(([, , step]) => step).right(tickIntervals, target);

  if (i === tickIntervals.length) {
    return timeYear.every(tickStep(start / durationYear, stop / durationYear, count));
  }
  if (i === 0) {
    return detectTimeInterval(minPrecision).every(Math.max(tickStep(start, stop, count), 1));
  }
  const [t, step] = tickIntervals[
    target / tickIntervals[i - 1][2] < tickIntervals[i][2] / target ? i - 1 : i
  ];
  return t.every(step);
};

export const axisTimeTickCount = (
  start: d3.NumberValue,
  stop: d3.NumberValue,
  precision: TimePrecision
): number => {
  const timeInterval = detectTimeInterval(precision);

  return Math.max(1, timeInterval.count(start as Date, stop as Date));
};
