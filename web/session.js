export function createSession(threshold) {
  return {startedAt: performance.now(), threshold, frames: 0, samples: [], alerts: 0, closureStart: null, longestClosure: 0, alerted: false};
}

export function record(session, state, now, details = {}) {
  session.frames++;
  session.samples.push({time: (now - session.startedAt) / 1000, state, ...details});
  if (state === "closed") {
    session.closureStart ??= now;
    const duration = (now - session.closureStart) / 1000;
    session.longestClosure = Math.max(session.longestClosure, duration);
    if (!session.alerted && duration > session.threshold) { session.alerts++; session.alerted = true; }
  } else { session.closureStart = null; session.alerted = false; }
}

export function finish(session) {
  session.duration = (performance.now() - session.startedAt) / 1000;
  const known = session.samples.filter(sample => sample.state !== "unknown");
  session.closedPercent = known.length ? known.filter(sample => sample.state === "closed").length / known.length * 100 : 0;
  return session;
}
