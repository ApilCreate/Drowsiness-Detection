let timeline, ratio;
export function renderCharts(session) {
  timeline?.destroy(); ratio?.destroy();
  const labels = session.samples.map(sample => sample.time.toFixed(1));
  timeline = new Chart(document.querySelector("#timeline-chart"), {type:"line", data:{labels, datasets:[{label:"Eye state (1 closed)", data:session.samples.map(s => s.state === "closed" ? 1 : s.state === "open" ? 0 : null), borderColor:"#71e0b5", pointRadius:0, spanGaps:false}]}, options:{scales:{y:{min:0,max:1,ticks:{stepSize:1}}}}});
  ratio = new Chart(document.querySelector("#ratio-chart"), {type:"doughnut", data:{labels:["Open","Closed"],datasets:[{data:[100-session.closedPercent,session.closedPercent],backgroundColor:["#71e0b5","#ff7181"]}]}});
}

export function renderStats(session) {
  document.querySelector("#stats").innerHTML = [
    ["Duration", `${session.duration.toFixed(1)}s`], ["Frames analysed", session.frames],
    ["Known time closed", `${session.closedPercent.toFixed(1)}%`], ["Alert events", session.alerts],
    ["Longest closure", `${session.longestClosure.toFixed(1)}s`]
  ].map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("");
}
