//! Core library for {{projectName}}

/// Generate a greeting message
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to {{projectName}}.", name)
}

/// Get application information
pub fn get_info() -> Vec<(&'static str, &'static str)> {
    vec![
        ("Name", "{{projectName}}"),
        ("Version", "0.1.0"),
        ("Author", "{{author}}"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet() {
        let result = greet("Test");
        assert!(result.contains("Test"));
        assert!(result.contains("Hello"));
    }

    #[test]
    fn test_info() {
        let info = get_info();
        assert!(!info.is_empty());
    }
}
