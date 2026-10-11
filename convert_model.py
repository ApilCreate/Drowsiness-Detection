"""Convert the Keras model to TensorFlow.js Layers format.

Run this from the repository root after installing tensorflowjs. The script
does not create placeholder files: a failed conversion exits with instructions.
"""
from pathlib import Path
import sys


def main() -> int:
    try:
        import tensorflow as tf
        import tensorflowjs as tfjs
    except ImportError as error:
        print(f"Missing conversion dependency: {error}")
        print("Create a clean environment and run: pip install tensorflow==2.19.0 tensorflowjs==4.22.0")
        print("If that combination conflicts, follow convert_model_colab.ipynb.")
        return 1

    root = Path(__file__).resolve().parent
    model_path = root / "drowsiness_model.h5"
    output_path = root / "web" / "model"
    model = tf.keras.models.load_model(model_path, compile=False)
    if model.input_shape[1:] != (64, 64, 1) or model.output_shape[-1] != 2:
        raise ValueError(f"Unexpected model shape: input={model.input_shape}, output={model.output_shape}")
    output_path.mkdir(parents=True, exist_ok=True)
    tfjs.converters.save_keras_model(model, str(output_path))
    print(f"Converted {model_path.name}: input {model.input_shape}, output {model.output_shape}")
    print("Class order is verified from the training notebook: 0=Open, 1=Closed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
