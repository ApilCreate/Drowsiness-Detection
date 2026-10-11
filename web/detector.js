const LEFT = [33, 160, 158, 133, 153, 144];
const RIGHT = [362, 385, 387, 263, 373, 380];

export async function createDetector() {
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm");
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
  );
  return vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"},
    runningMode: "VIDEO", numFaces: 1,
    outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false
  });
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function ear(points, ids) {
  const p = ids.map(id => points[id]);
  return (distance(p[1], p[5]) + distance(p[2], p[4])) / (2 * distance(p[0], p[3]));
}

export function eyeMetrics(landmarks) {
  return {leftEar: ear(landmarks, LEFT), rightEar: ear(landmarks, RIGHT), ear: (ear(landmarks, LEFT) + ear(landmarks, RIGHT)) / 2};
}

function cropEye(video, landmarks, ids, canvas) {
  const xs = ids.map(id => landmarks[id].x * video.videoWidth);
  const ys = ids.map(id => landmarks[id].y * video.videoHeight);
  const padX = (Math.max(...xs) - Math.min(...xs)) * .7;
  const padY = (Math.max(...ys) - Math.min(...ys)) * 1.2;
  const x = Math.max(0, Math.min(...xs) - padX), y = Math.max(0, Math.min(...ys) - padY);
  const w = Math.min(video.videoWidth - x, Math.max(...xs) - Math.min(...xs) + 2 * padX);
  const h = Math.min(video.videoHeight - y, Math.max(...ys) - Math.min(...ys) + 2 * padY);
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext("2d", {willReadFrequently: true});
  ctx.drawImage(video, x, y, w, h, 0, 0, 64, 64);
  return ctx.getImageData(0, 0, 64, 64);
}

export function predictEyes(model, video, landmarks) {
  const scratch = document.createElement("canvas");
  const images = [cropEye(video, landmarks, LEFT, scratch), cropEye(video, landmarks, RIGHT, scratch)];
  const input = tf.tidy(() => tf.stack(images.map(image => {
    const pixels = tf.browser.fromPixels(image, 1);
    return pixels.toFloat().div(255).reshape([64, 64, 1]);
  })));
  const output = model.predict(input);
  const values = output.dataSync();
  input.dispose(); output.dispose();
  const predictions = [values.slice(0, 2), values.slice(2, 4)];
  return predictions.map(scores => ({closed: scores[1] > scores[0], confidence: Math.max(...scores)}));
}
