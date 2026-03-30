use clap::{Parser, Subcommand};
use colored::*;

use {{packageName}}::{greet, get_info};

#[derive(Parser)]
#[command(name = "{{packageName}}")]
#[command(author = "{{author}}")]
#[command(version = "0.1.0")]
#[command(about = "{{description}}", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Greet someone
    Greet {
        /// Name to greet
        #[arg(short, long, default_value = "World")]
        name: String,
    },
    /// Show application info
    Info,
    /// Process some data
    Process {
        /// Items to process
        #[arg(required = true)]
        items: Vec<String>,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Greet { name } => {
            let message = greet(&name);
            println!("{}", message.green());
        }
        Commands::Info => {
            let info = get_info();
            println!("{}", "╔══════════════════════════════════════╗".cyan());
            println!("{}", format!("║  {}  ║", "{{projectName}}".bold()).cyan());
            println!("{}", "╠══════════════════════════════════════╣".cyan());
            for (key, value) in info {
                println!("{}  {}: {}", "║".cyan(), key.yellow(), value);
            }
            println!("{}", "╚══════════════════════════════════════╝".cyan());
        }
        Commands::Process { items } => {
            println!("{}", format!("Processing {} items:", items.len()).blue());
            for (i, item) in items.iter().enumerate() {
                println!("  {} {}", format!("[{}]", i + 1).yellow(), item);
            }
            println!("{}", "✓ Done!".green());
        }
    }

    Ok(())
}
