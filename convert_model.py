"""Convert the Keras model to TensorFlow.js Layers format.

Run this from the repository root after installing tensorflowjs. The script
does not create placeholder files: a failed conversion exits with instructions.
"""
from pathlib import Path
import json
import sys
import types


def main() -> int:
    try:
        import tensorflow as tf
        try:
            import tf_keras as keras
        except ImportError:
            keras = tf.keras
        # tensorflowjs imports its SavedModel converter eagerly. That optional
        # path imports TF-DF, whose Windows wheel is unavailable for TF 2.19;
        # this conversion uses only the Keras H5 converter.
        sys.modules.setdefault("tensorflow_decision_forests", types.ModuleType(
            "tensorflow_decision_forests"
        ))
        import tensorflowjs as tfjs
    except ImportError as error:
        print(f"Missing conversion dependency: {error}")
        print("Create a clean environment and run: pip install tensorflow==2.15.0 tensorflowjs==4.17.0")
        print("If that combination conflicts, follow convert_model_colab.ipynb.")
        return 1

    root = Path(__file__).resolve().parent
    model_path = root / "drowsiness_model.h5"
    output_path = root / "web" / "model"
    source_model = tf.keras.models.load_model(model_path, compile=False)
    model = keras.Sequential([
        keras.layers.Input(shape=(64, 64, 1)),
        keras.layers.Conv2D(32, (3, 3), activation="relu"),
        keras.layers.MaxPooling2D(2, 2),
        keras.layers.Conv2D(64, (3, 3), activation="relu"),
        keras.layers.MaxPooling2D(2, 2),
        keras.layers.Flatten(),
        keras.layers.Dense(128, activation="relu"),
        keras.layers.Dropout(0.5),
        keras.layers.Dense(2, activation="softmax"),
    ])
    model.set_weights(source_model.get_weights())
    if model.input_shape[1:] != (64, 64, 1) or model.output_shape[-1] != 2:
        raise ValueError(f"Unexpected model shape: input={model.input_shape}, output={model.output_shape}")
    output_path.mkdir(parents=True, exist_ok=True)
    tfjs.converters.save_keras_model(model, str(output_path))
    model_json = output_path / "model.json"
    document = json.loads(model_json.read_text(encoding="utf-8"))

    def normalize_input_config(value):
        if isinstance(value, dict):
            return {
                "batch_input_shape" if key == "batch_shape" else key:
                normalize_input_config(item)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [normalize_input_config(item) for item in value]
        return value

    model_json.write_text(
        json.dumps(normalize_input_config(document), separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Converted {model_path.name}: input {model.input_shape}, output {model.output_shape}")
    print("Class order is verified from the training notebook: 0=Open, 1=Closed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
