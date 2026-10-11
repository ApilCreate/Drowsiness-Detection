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
  const leftEar = ear(landmarks, LEFT);
  const rightEar = ear(landmarks, RIGHT);
  return {leftEar, rightEar, ear: (leftEar + rightEar) / 2};
}

function cropEye(video, landmarks, ids, canvas) {
  const xs = ids.map(id => landmarks[id].x * video.videoWidth);
  const ys = ids.map(id => landmarks[id].y * video.videoHeight);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const eyeWidth = Math.max(maxX - minX, 1);
  const eyeHeight = Math.max(maxY - minY, eyeWidth * .45);
  const size = Math.max(eyeWidth * 1.8, eyeHeight * 2.2);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const x = Math.max(0, Math.min(video.videoWidth - size, centerX - size / 2));
  const y = Math.max(0, Math.min(video.videoHeight - size, centerY - size / 2));
  const w = Math.min(size, video.videoWidth - x);
  const h = Math.min(size, video.videoHeight - y);
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext("2d", {willReadFrequently: true});
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 64, 64);
  ctx.drawImage(video, x, y, w, h, 0, 0, 64, 64);
  return ctx.getImageData(0, 0, 64, 64);
}

export function predictEyes(model, video, landmarks) {
  const scratch = document.createElement("canvas");
  const images = [cropEye(video, landmarks, LEFT, scratch), cropEye(video, landmarks, RIGHT, scratch)];
  const input = tf.tidy(() => tf.stack(images.flatMap(image => {
    const pixels = tf.browser.fromPixels(image, 1).toFloat().div(255).reshape([64, 64, 1]);
    const flipped = pixels.reverse(1);
    return [pixels, flipped];
  })));
  const output = model.predict(input);
  const values = output.dataSync();
  input.dispose(); output.dispose();
  const predictions = [
    [(values[0] + values[2]) / 2, (values[1] + values[3]) / 2],
    [(values[4] + values[6]) / 2, (values[5] + values[7]) / 2]
  ];
  return predictions.map(scores => ({closed: scores[1] > scores[0], confidence: Math.max(...scores)}));
}
