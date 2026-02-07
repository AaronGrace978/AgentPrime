"""CLI interface for {{projectName}}."""

import click
from rich.console import Console

from .main import greet, show_info, process_data

console = Console()


@click.group()
@click.version_option(version="0.1.0")
def main():
    """my-awesome-cli - A simple CLI tool to demonstrate AgentPrime"""
    pass


@main.command()
@click.argument("name", default="World")
def hello(name: str):
    """Say hello to NAME."""
    message = greet(name)
    console.print(f"[green]{message}[/green]")


@main.command()
def info():
    """Show application information."""
    show_info()


@main.command()
@click.argument("items", nargs=-1)
def process(items: tuple[str, ...]):
    """Process a list of items."""
    if not items:
        console.print("[yellow]No items provided.[/yellow]")
        return
    
    result = process_data(list(items))
    console.print(f"[blue]Processed {result['count']} items:[/blue]")
    for item in result["items"]:
        console.print(f"  • {item}")


if __name__ == "__main__":
    main()
