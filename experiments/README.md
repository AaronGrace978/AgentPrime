# AI Model Training Experiments

This directory contains configuration files and scripts for training custom AI models for AgentPrime.

## Structure

- `config.yaml` - Training hyperparameters and model configuration
- `datasets/` - Training datasets (GitHub code, etc.)
- `scripts/` - Training scripts (PyTorch, TensorFlow, etc.)

## Example Training Config

See `config.yaml.example` for a sample configuration file.

## Usage

1. Prepare your dataset in `datasets/`
2. Configure training in `config.yaml`
3. Run training script: `python scripts/train_autocomplete.py`
4. Checkpoints will be saved to `../checkpoints/`
5. Training logs and metrics in `../results/`

