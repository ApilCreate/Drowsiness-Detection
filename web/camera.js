export async function listCameras(select) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(({kind}) => kind === "videoinput");
  select.replaceChildren(...cameras.map((device, index) => {
    const option = new Option(device.label || `Camera ${index + 1}`, device.deviceId);
    return option;
  }));
  return cameras;
}

export async function openCamera(deviceId) {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId ? {deviceId: {exact: deviceId}} : {facingMode: "user"},
    audio: false
  });
}
