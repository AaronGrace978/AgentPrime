# my-awesome-cli

A simple CLI tool to demonstrate AgentPrime

A modern Python CLI tool built with Click and Rich.

## Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install in development mode
pip install -e ".[dev]"
```

## Usage

```bash
# Run the CLI
python -m src.cli --help

# Or after installing
my-awesome-cli --help
```

## Development

```bash
# Run tests
pytest

# Format code
black src tests

# Lint
ruff check src tests
```

## Author

AgentPrime User
