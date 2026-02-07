"""Core functionality for {{projectName}}."""

from rich.console import Console
from rich.table import Table

console = Console()


def greet(name: str) -> str:
    """Generate a greeting message."""
    return f"Hello, {name}! Welcome to my-awesome-cli."


def show_info() -> None:
    """Display information about the application."""
    table = Table(title="my-awesome-cli")
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Name", "my-awesome-cli")
    table.add_row("Description", "A simple CLI tool to demonstrate AgentPrime")
    table.add_row("Author", "AgentPrime User")
    table.add_row("Version", "0.1.0")

    console.print(table)


def process_data(data: list[str]) -> dict:
    """Process a list of data items."""
    return {
        "count": len(data),
        "items": data,
        "processed": True,
    }
