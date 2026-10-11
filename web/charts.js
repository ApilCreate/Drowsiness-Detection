let timeline, ratio;
export function renderCharts(session) {
  timeline?.destroy(); ratio?.destroy();
  const labels = session.samples.map(sample => sample.time.toFixed(1));
  const stateData = value => session.samples.map(sample => sample.state === value ? 1 : null);
  timeline = new Chart(document.querySelector("#timeline-chart"), {type:"line", data:{labels, datasets:[
    {label:"Open",data:stateData("open"),borderColor:"#71e0b5",backgroundColor:"#71e0b5",pointRadius:0,stepped:true},
    {label:"Closed",data:stateData("closed"),borderColor:"#ff7181",backgroundColor:"#ff7181",pointRadius:0,stepped:true},
    {label:"Unknown",data:stateData("unknown"),borderColor:"#8290a8",backgroundColor:"#8290a8",pointRadius:0,stepped:true}
  ]}, options:{responsive:true, interaction:{mode:"index",intersect:false}, scales:{x:{title:{display:true,text:"Elapsed time (s)"}},y:{min:0,max:1,ticks:{stepSize:1,callback:value=>value===1?"Detected":"Not detected"}}}}});
  ratio = new Chart(document.querySelector("#ratio-chart"), {type:"doughnut", data:{labels:["Open","Closed"],datasets:[{data:[100-session.closedPercent,session.closedPercent],backgroundColor:["#71e0b5","#ff7181"],borderColor:"#111722",borderWidth:4}]}, options:{plugins:{legend:{position:"bottom"}}}});
}

export function renderStats(session) {
  document.querySelector("#stats").innerHTML = [
    ["Duration", `${session.duration.toFixed(1)}s`], ["Frames analysed", session.frames],
    ["Known time closed", `${session.closedPercent.toFixed(1)}%`], ["Alert events", session.alerts],
    ["Longest closure", `${session.longestClosure.toFixed(1)}s`]
  ].map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("");
}
