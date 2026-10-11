import {listCameras, openCamera} from "./camera.js";
import {createDetector, eyeMetrics, predictEyes} from "./detector.js";
import {createSession, record, finish} from "./session.js";
import {renderCharts, renderStats} from "./charts.js";

const $ = id => document.querySelector(id);
const video = $("#video"), canvas = $("#overlay"), ctx = canvas.getContext("2d");
let model, detector, stream, session, running = false, muted = false, lastFrame = 0;
let signalHistory = {cnn: [], ear: []}, lastStableState = null, uncertainSince = null, lastFaceAt = 0;
const CONSENSUS_WINDOW = 5;
const TRACKING_GRACE_MS = 350;
const alarm = new Audio("alarm.wav");
alarm.loop = true;
alarm.preload = "auto";

function status(message) { $("#status").textContent = message; }
function setLive(active) {
  $("#live-indicator").classList.toggle("active", active);
  $("#live-indicator").innerHTML = `<i></i> ${active ? "Monitoring" : "Idle"}`;
  $("#video-placeholder").classList.toggle("hidden", active);
}
function draw(landmarks, predictions) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  const ids = [[33,160,158,133,153,144],[362,385,387,263,373,380]];
  ids.forEach((eye, i) => { const xs=eye.map(id=>landmarks[id].x*canvas.width), ys=eye.map(id=>landmarks[id].y*canvas.height);
    const x=Math.min(...xs), y=Math.min(...ys), w=Math.max(...xs)-x, h=Math.max(...ys)-y;
    ctx.strokeStyle=predictions[i].closed?"#ff7181":"#71e0b5"; ctx.strokeRect(x-8,y-8,w+16,h+16); ctx.fillStyle=ctx.strokeStyle;
    ctx.fillText(`${i === 0 ? "Left" : "Right"}: ${predictions[i].closed?"Closed":"Open"} ${(predictions[i].confidence*100).toFixed(0)}%`,x,y-12);
  });
}
function selectedState(cnnClosed, earClosed) {
  const mode=$("#signal-select").value;
  return mode==="cnn" ? cnnClosed : mode==="ear" ? earClosed : cnnClosed === earClosed ? cnnClosed : null;
}
function resetTracking() {
  signalHistory = {cnn: [], ear: []};
  lastStableState = null;
  uncertainSince = null;
  lastFaceAt = 0;
}
function consensus(history, value) {
  history.push(value);
  if (history.length > CONSENSUS_WINDOW) history.shift();
  const closedVotes = history.filter(Boolean).length;
  const openVotes = history.length - closedVotes;
  if (closedVotes === openVotes) return null;
  return closedVotes > openVotes;
}
function stabilizedState(rawState, now) {
  if (rawState !== null) {
    lastStableState = rawState;
    uncertainSince = null;
    return rawState;
  }
  uncertainSince ??= now;
  if (lastStableState !== null && now - uncertainSince <= TRACKING_GRACE_MS) return lastStableState;
  return null;
}
function signalLabel(value) {
  return value === true ? "Closed" : value === false ? "Open" : "Stabilizing…";
}
function freezeFinalFrame() {
  if (!video.videoWidth || !video.videoHeight) return;
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.style.visibility = "hidden";
}
async function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  if (now-lastFrame < 66 || video.readyState < 2) return; lastFrame=now;
  const result=detector.detectForVideo(video, now), landmarks=result.faceLandmarks?.[0];
  if (!landmarks) {
    const tracking = lastFaceAt && now - lastFaceAt <= TRACKING_GRACE_MS;
    $("#cnn-state").textContent=tracking ? "Tracking…" : "No face";
    $("#ear-state").textContent=tracking ? "Tracking…" : "No face";
    record(session, tracking ? "tracking" : "unknown", now);
    if (!tracking) {
      signalHistory = {cnn: [], ear: []};
      lastStableState = null;
      uncertainSince = null;
    }
    return;
  }
  lastFaceAt = now;
  const metrics=eyeMetrics(landmarks), predictions=predictEyes(model,video,landmarks);
  const cnnClosed=consensus(signalHistory.cnn, predictions.every(p=>p.closed));
  const earClosed=consensus(signalHistory.ear, metrics.leftEar < 0.21 && metrics.rightEar < 0.21);
  $("#cnn-state").textContent=`${signalLabel(cnnClosed)} · L ${(predictions[0].confidence*100).toFixed(0)}% / R ${(predictions[1].confidence*100).toFixed(0)}%`;
  $("#ear-state").textContent=`L ${metrics.leftEar.toFixed(3)} · R ${metrics.rightEar.toFixed(3)} (${signalLabel(earClosed).toLowerCase()})`;
  draw(landmarks,predictions);
  const state = stabilizedState(selectedState(cnnClosed,earClosed), now);
  record(session, state === true ? "closed" : state === false ? "open" : "unknown", now);
  const alert=session.closureStart && (now-session.closureStart)/1000 > session.threshold;
  $("#session-state").textContent=alert?"DROWSY ALERT":session.closureStart?`Eyes Closed ${((now-session.closureStart)/1000).toFixed(1)}s`:"Active";
  if (alert && !muted && alarm.paused) {
    alarm.play().catch(error => status(`Alarm blocked by browser: ${error.message}. Click Unmute alarm, then Start again.`));
  }
  if (!alert) { alarm.pause(); alarm.currentTime=0; }
}
async function unlockAlarm() {
  alarm.muted = true;
  try {
    await alarm.play();
    alarm.pause();
    alarm.currentTime = 0;
  } catch (error) {
    throw new Error(`Alarm audio could not be unlocked: ${error.message}`);
  } finally {
    alarm.muted = false;
  }
}
async function start() {
  try {
    status("Requesting camera permission…");
    await unlockAlarm();
    stream=await openCamera($("#camera-select").value); video.srcObject=stream; await video.play();
    session=createSession(Number($("#threshold").value)); resetTracking(); running=true; video.style.visibility="visible"; setLive(true); $("#start").disabled=true; $("#stop").disabled=false; $("#screenshot").disabled=false; status("Monitoring locally.");
    requestAnimationFrame(frame); setTimeout(stop, Number($("#duration-select").value)*1000);
  } catch (error) { status(`Unable to start monitoring: ${error.message}`); }
}
function stop() {
  if (!running) return; freezeFinalFrame(); running=false; alarm.pause(); alarm.currentTime=0; stream?.getTracks().forEach(track=>track.stop());
  setLive(false); $("#video-placeholder").classList.add("hidden"); finish(session); renderStats(session); renderCharts(session); $("#report-note").textContent=`Completed ${new Date().toLocaleTimeString()}`; $("#start").disabled=false; $("#stop").disabled=true; $("#download").disabled=false; status("Session complete. Final frame and report are ready.");
}
$("#threshold").addEventListener("input", e => $("#threshold-value").textContent=`${e.target.value}s`);
$("#start").addEventListener("click", start); $("#stop").addEventListener("click", stop);
$("#mute").addEventListener("click", e => { muted=!muted; e.currentTarget.textContent=muted?"Unmute alarm":"Mute alarm"; e.currentTarget.setAttribute("aria-pressed",muted); });
$("#screenshot").addEventListener("click", () => canvas.toBlob(blob => { const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="drowsiness-session.png"; a.click(); URL.revokeObjectURL(a.href); }));
$("#download").addEventListener("click", () => { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:"application/json"})); a.download="drowsiness-session.json"; a.click(); });
$("#camera-select").addEventListener("change", async () => { if (running) return; try { stream=await openCamera($("#camera-select").value); video.srcObject=stream; await video.play(); setLive(true); } catch(error) { status(`Camera error: ${error.message}`); } });
(async () => { try { model=await tf.loadLayersModel("model/model.json"); detector=await createDetector(); await listCameras($("#camera-select")); status("Ready. Start a private browser session."); } catch(error) { status(`Loading error: ${error.message}. Add converted model files under web/model/.`); } })();
