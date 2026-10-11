let timeline, earChart, ratio, confidenceChart;
export function renderCharts(session) {
  timeline?.destroy(); earChart?.destroy(); ratio?.destroy(); confidenceChart?.destroy();
  const labels = session.samples.map(sample => sample.time.toFixed(1));
  const stateData = value => session.samples.map(sample => sample.state === value ? 1 : null);
  const grid = "rgba(151, 166, 188, .12)";
  const axis = {color:"#93a0b5", grid:{color:grid}};
  const lineOptions = {responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false}, plugins:{legend:{labels:{color:"#dce5f0",usePointStyle:true,padding:18}}}, scales:{x:{...axis,title:{display:true,text:"Elapsed time (s)",color:"#93a0b5"}},y:{...axis}}};
  timeline = new Chart(document.querySelector("#timeline-chart"), {type:"line", data:{labels, datasets:[
    {label:"Open",data:stateData("open"),borderColor:"#62e6b0",backgroundColor:"#62e6b0",pointRadius:0,borderWidth:2,stepped:true},
    {label:"Closed",data:stateData("closed"),borderColor:"#ff7181",backgroundColor:"#ff7181",pointRadius:0,borderWidth:2,stepped:true},
    {label:"Unknown",data:stateData("unknown"),borderColor:"#8493aa",backgroundColor:"#8493aa",pointRadius:0,borderWidth:2,stepped:true}
  ]}, options:{...lineOptions, maintainAspectRatio:false, scales:{...lineOptions.scales,y:{...axis,min:0,max:1,ticks:{stepSize:1,color:"#93a0b5",callback:value=>value===1?"Detected":"No signal"}}}}});
  const values = key => session.samples.map(sample => sample[key] ?? null);
  earChart = new Chart(document.querySelector("#ear-chart"), {type:"line", data:{labels,datasets:[
    {label:"Left EAR",data:values("leftEar"),borderColor:"#62e6b0",backgroundColor:"rgba(98,230,176,.12)",fill:true,tension:.35,pointRadius:0,borderWidth:2},
    {label:"Right EAR",data:values("rightEar"),borderColor:"#8aa8ff",backgroundColor:"rgba(138,168,255,.08)",fill:true,tension:.35,pointRadius:0,borderWidth:2}
  ]}, options:{...lineOptions, scales:{...lineOptions.scales,y:{...axis,min:0,suggestedMax:.5}}}});
  ratio = new Chart(document.querySelector("#ratio-chart"), {type:"doughnut", data:{labels:["Open","Closed"],datasets:[{data:[100-session.closedPercent,session.closedPercent],backgroundColor:["#62e6b0","#ff7181"],borderColor:"#151c28",borderWidth:5}]}, options:{responsive:true,maintainAspectRatio:false,cutout:"72%",plugins:{legend:{position:"bottom",labels:{color:"#dce5f0",usePointStyle:true,padding:16}},tooltip:{callbacks:{label:context=>`${context.label}: ${context.raw.toFixed(1)}%`}}}}});
  confidenceChart = new Chart(document.querySelector("#confidence-chart"), {type:"line", data:{labels,datasets:[
    {label:"Left eye",data:values("leftConfidence"),borderColor:"#62e6b0",backgroundColor:"rgba(98,230,176,.1)",fill:true,tension:.35,pointRadius:0,borderWidth:2},
    {label:"Right eye",data:values("rightConfidence"),borderColor:"#ffb86b",backgroundColor:"rgba(255,184,107,.08)",fill:true,tension:.35,pointRadius:0,borderWidth:2}
  ]}, options:{...lineOptions,scales:{...lineOptions.scales,y:{...axis,min:0,max:1,ticks:{color:"#93a0b5",callback:value=>`${Math.round(value*100)}%`}}}}});
}

export function renderStats(session) {
  document.querySelector("#stats").innerHTML = [
    ["Duration", `${session.duration.toFixed(1)}s`], ["Frames analysed", session.frames],
    ["Known time closed", `${session.closedPercent.toFixed(1)}%`], ["Alert events", session.alerts],
    ["Longest closure", `${session.longestClosure.toFixed(1)}s`]
  ].map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("");
}
