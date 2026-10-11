"""Evaluate drowsiness_model.h5 on a fixed, stratified held-out split."""
from pathlib import Path
import argparse
import json
import numpy as np
import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="Drowsiness_Dataset")
    parser.add_argument("--model", default="drowsiness_model.h5")
    parser.add_argument("--output", default="docs/metrics.json")
    args = parser.parse_args()
    import tensorflow as tf
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, ConfusionMatrixDisplay
    from sklearn.model_selection import train_test_split

    root = Path(args.data)
    paths = [(path, 0 if path.parent.name == "Open_Eyes" else 1)
             for path in sorted(root.glob("*/*.png")) if path.parent.name in {"Open_Eyes", "Close_Eyes"}]
    train_paths, test_paths = train_test_split(paths, test_size=0.2, random_state=42,
                                               stratify=[label for _, label in paths])
    del train_paths
    x, y = [], []
    for path, label in test_paths:
        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise ValueError(f"Could not read {path}")
        x.append(cv2.resize(image, (64, 64)).astype("float32") / 255.0)
        y.append(label)
    model = tf.keras.models.load_model(args.model, compile=False)
    predictions = np.argmax(model.predict(np.asarray(x)[..., None], verbose=0), axis=1)
    metrics = {
        "split": "fixed stratified 80/20 split, random_state=42",
        "samples": len(y),
        "accuracy": accuracy_score(y, predictions),
        "precision": precision_score(y, predictions, zero_division=0),
        "recall": recall_score(y, predictions, zero_division=0),
        "f1": f1_score(y, predictions, zero_division=0),
        "confusion_matrix": confusion_matrix(y, predictions).tolist(),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    figure, axis = plt.subplots(figsize=(5, 5))
    ConfusionMatrixDisplay(np.asarray(metrics["confusion_matrix"]), display_labels=["Open", "Closed"]).plot(
        ax=axis, cmap="Blues", colorbar=False
    )
    axis.set_title("Held-out eye-state confusion matrix")
    figure.tight_layout()
    figure.savefig(output.parent / "confusion_matrix.png", dpi=160)
    plt.close(figure)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
