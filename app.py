import cv2
import numpy as np
import tensorflow as tf
import threading
import time
from flask import Flask, Response, render_template, request, jsonify
import matplotlib.pyplot as plt
from pygame import mixer
import os
from datetime import datetime
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)

# Load the trained model
try:
    model = tf.keras.models.load_model("drowsiness_model.h5")
    logging.info("Model loaded successfully")
except Exception as e:
    logging.error(f"Failed to load model: {e}")
    raise

IMG_SIZE = 64

# Load Haar cascades
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")

# Global variables
cap = None
detection_running = False
session_data = {"timestamps": [], "states": []}
camera_index = 0
session_duration = 0
drowsy_detected = False
session_ended = False  # New flag to track if session has ended

# Initialize pygame mixer for alarm
try:
    mixer.init()
    alarm_sound = mixer.Sound("static/alarm.wav")
    logging.info("Pygame mixer initialized")
except Exception as e:
    logging.error(f"Failed to initialize pygame mixer: {e}")
    raise

def play_alarm():
    """Play alarm sound in a separate thread."""
    try:
        if not mixer.get_busy():
            alarm_sound.play()
            logging.debug("Alarm played")
    except Exception as e:
        logging.error(f"Error playing alarm: {e}")

def generate_frames():
    """Generate frames for the live video feed."""
    global cap, detection_running, drowsy_detected
    while True:
        try:
            if cap is None or not cap.isOpened():
                cap = cv2.VideoCapture(camera_index)
                if not cap.isOpened():
                    logging.error(f"Failed to open camera with index {camera_index}")
                    break
            ret, frame = cap.read()
            if not ret:
                logging.warning("Failed to read frame from camera")
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50))

            eye_closed_count = 0
            for (x, y, w, h) in faces:
                face_roi = gray[y:y+h, x:x+w]
                eyes = eye_cascade.detectMultiScale(face_roi, scaleFactor=1.1, minNeighbors=5, minSize=(20, 20))

                for (ex, ey, ew, eh) in eyes:
                    eye_roi = face_roi[ey:ey+eh, ex:ex+ew]
                    eye_roi = cv2.resize(eye_roi, (IMG_SIZE, IMG_SIZE))
                    eye_roi = eye_roi / 255.0
                    eye_roi = eye_roi.reshape(1, IMG_SIZE, IMG_SIZE, 1)

                    prediction = model.predict(eye_roi, verbose=0)
                    confidence = np.max(prediction) * 100
                    label = "Open" if np.argmax(prediction) == 0 else "Closed"

                    color = (0, 255, 0) if label == "Open" else (0, 0, 255)
                    cv2.rectangle(frame, (x+ex, y+ey), (x+ex+ew, y+ey+eh), color, 2)
                    cv2.putText(frame, f"{label} ({confidence:.2f}%)", (x+ex, y+ey-10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

                    if label == "Closed":
                        eye_closed_count += 1

                if detection_running and eye_closed_count >= 1:
                    cv2.putText(frame, "DROWSINESS ALERT!", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)
                    if not drowsy_detected:
                        drowsy_detected = True
                        threading.Thread(target=play_alarm, daemon=True).start()
                    session_data["timestamps"].append(time.time())
                    session_data["states"].append(1)  # 1 for closed
                elif detection_running:
                    drowsy_detected = False
                    session_data["timestamps"].append(time.time())
                    session_data["states"].append(0)  # 0 for open

            ret, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

        except Exception as e:
            logging.error(f"Error in generate_frames: {e}")
            break

def run_detection():
    """Run detection for the specified duration."""
    global detection_running, session_data, session_ended
    start_time = time.time()
    session_data = {"timestamps": [], "states": []}
    session_ended = False
    
    try:
        while detection_running and (time.time() - start_time) < session_duration:
            time.sleep(0.1)  # Log every 0.1s
        detection_running = False
        session_ended = True  # Set flag to indicate session has ended
        logging.info("Detection session ended automatically")
        generate_charts()
    except Exception as e:
        logging.error(f"Error in run_detection: {e}")
    finally:
        detection_running = False

def generate_charts():
    """Generate line and bar charts after session ends."""
    try:
        if not session_data["timestamps"]:
            logging.warning("No session data to generate charts")
            return

        timestamps = np.array(session_data["timestamps"]) - session_data["timestamps"][0]
        states = session_data["states"]
        total_frames = len(states)
        open_count = states.count(0)
        closed_count = states.count(1)

        # Line chart
        plt.figure(figsize=(10, 4))
        plt.plot(timestamps, states, label="Eye State (0=Open, 1=Closed)")
        plt.xlabel("Time (s)")
        plt.ylabel("State")
        plt.title("Eye State Over Time")
        plt.legend()
        plt.savefig("static/line_chart.png")
        plt.close()
        logging.info("Line chart generated")

        # Bar chart
        plt.figure(figsize=(6, 4))
        percentages = [open_count / total_frames * 100, closed_count / total_frames * 100]
        plt.bar(["Open", "Closed"], percentages, color=["green", "red"])
        plt.ylabel("Percentage (%)")
        plt.title("Open vs Closed Eyes")
        plt.savefig("static/bar_chart.png")
        plt.close()
        logging.info("Bar chart generated")

        # Save session stats
        with open("static/session_stats.txt", "w") as f:
            f.write(f"Duration: {session_duration}s\n")
            f.write(f"Total Frames: {total_frames}\n")
            f.write(f"Open Count: {open_count}\n")
            f.write(f"Closed Count: {closed_count}\n")
        logging.info("Session stats saved")

    except Exception as e:
        logging.error(f"Error in generate_charts: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/start_detection', methods=['POST'])
def start_detection():
    global detection_running, session_duration, camera_index, cap, session_ended
    try:
        duration = int(request.form['duration'])
        camera_index = int(request.form['camera'])
        session_duration = duration
        detection_running = True
        session_ended = False
        if cap is not None:
            cap.release()
        cap = None  # Reset cap to force re-initialization
        threading.Thread(target=run_detection, daemon=True).start()
        logging.info(f"Detection started: duration={duration}s, camera={camera_index}")
        return jsonify({"status": "Detection started"})
    except Exception as e:
        logging.error(f"Error in start_detection: {e}")
        return jsonify({"status": "Failed to start detection", "error": str(e)}), 500

@app.route('/stop_detection', methods=['POST'])
def stop_detection():
    global detection_running, cap, session_ended
    try:
        detection_running = False
        session_ended = True
        if cap is not None:
            cap.release()
            cap = None
        logging.info("Detection stopped manually")
        generate_charts()
        return jsonify({"status": "Detection stopped"})
    except Exception as e:
        logging.error(f"Error in stop_detection: {e}")
        return jsonify({"status": "Failed to stop detection", "error": str(e)}), 500

@app.route('/check_session_status', methods=['GET'])
def check_session_status():
    """Endpoint to check if the session has ended."""
    global detection_running, session_ended
    return jsonify({"running": detection_running, "ended": session_ended})

@app.route('/capture_screenshot', methods=['POST'])
def capture_screenshot():
    global cap
    try:
        if cap is not None and cap.isOpened():
            ret, frame = cap.read()
            if ret:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                cv2.imwrite(f"static/screenshot_{timestamp}.jpg", frame)
                logging.info(f"Screenshot captured: screenshot_{timestamp}.jpg")
                return jsonify({"status": "Screenshot captured"})
        return jsonify({"status": "Failed to capture screenshot"})
    except Exception as e:
        logging.error(f"Error in capture_screenshot: {e}")
        return jsonify({"status": "Failed to capture screenshot", "error": str(e)}), 500

if __name__ == "__main__":
    if not os.path.exists("static"):
        os.makedirs("static")
    try:
        app.run(debug=True, threaded=True)
    except Exception as e:
        logging.error(f"Error running Flask app: {e}")
    finally:
        if cap is not None:
            cap.release()
            logging.info("Camera released")