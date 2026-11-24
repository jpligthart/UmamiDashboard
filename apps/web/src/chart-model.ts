import type { TimePoint } from '@dashboard/shared';

export function chartScale(points: TimePoint[]) {
  const maximum = Math.max(1, ...points.map(p => p.y ?? 0));
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  return Math.ceil(maximum / magnitude) * magnitude;
}
export function timePosition(at: number, points: TimePoint[], width: number) {
  const start = points[0].at;
  const end = points.at(-1)!.endAt + 1;
  return (at - start) / Math.max(1, end - start) * width;
}
export function sparkPaths(points: TimePoint[], width: number, height: number): string[] {
  const max = chartScale(points);
  const paths: string[] = [];
  let path = '';
  for (const point of points) {
    if (point.y === null) {
      if (path) paths.push(path);
      path = '';
    } else {
      const x = timePosition((point.at + point.endAt + 1) / 2, points, width);
      const y = height - point.y / max * height;
      path += `${path ? ' L' : 'M'}${x},${y}`;
    }
  }
  if (path) paths.push(path);
  return paths;
}
