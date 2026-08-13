/// Formats the Spotify Connect device name as `{name}'s {machine}`.
/// Names that already end in `s`/`S` use a trailing apostrophe only (`James' LAPTOP`).
pub fn format_device_name(display_name: &str, machine_name: &str) -> String {
    let name = display_name.trim();
    let machine = machine_name.trim();

    if name.is_empty() {
        return machine.to_string();
    }
    if machine.is_empty() {
        return name.to_string();
    }

    let possessive = if name.ends_with('s') || name.ends_with('S') {
        format!("{name}'")
    } else {
        format!("{name}'s")
    };

    format!("{possessive} {machine}")
}

pub fn os_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "User".into())
}

pub fn machine_name() -> String {
    hostname::get()
        .ok()
        .map(|h| h.to_string_lossy().into_owned())
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .or_else(|| std::env::var("HOSTNAME").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Machine".into())
}

/// Default Connect name: `{username/displayname}'s {machine name}`.
pub fn default_device_name(display_name: Option<&str>) -> String {
    let name = display_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(os_username);
    format_device_name(&name, &machine_name())
}

#[cfg(test)]
mod tests {
    use super::format_device_name;

    #[test]
    fn kzu_desktop() {
        assert_eq!(
            format_device_name("Kzu", "DESKTOP-ABC"),
            "Kzu's DESKTOP-ABC"
        );
    }

    #[test]
    fn display_name_with_spaces() {
        assert_eq!(
            format_device_name("Ada Lovelace", "STUDIO"),
            "Ada Lovelace's STUDIO"
        );
    }

    #[test]
    fn name_already_ending_in_s() {
        assert_eq!(format_device_name("James", "LAPTOP"), "James' LAPTOP");
        assert_eq!(format_device_name("Chris", "WORK-PC"), "Chris' WORK-PC");
        assert_eq!(format_device_name("JAMES", "BOX"), "JAMES' BOX");
    }

    #[test]
    fn trims_inputs() {
        assert_eq!(
            format_device_name("  Ada  ", "  WORK  "),
            "Ada's WORK"
        );
    }

    #[test]
    fn empty_name_falls_back_to_machine() {
        assert_eq!(format_device_name("   ", "MACHINE"), "MACHINE");
    }

    #[test]
    fn empty_machine_falls_back_to_name() {
        assert_eq!(format_device_name("Ada", "  "), "Ada");
    }
}
