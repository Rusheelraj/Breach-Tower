namespace BreachTowerInstaller.Core;

/// <summary>User-supplied configuration values for .env generation.</summary>
public class EnvConfig
{
    public string AlertEmail   { get; set; } = "";
    public string SmtpHost     { get; set; } = "";
    public string SmtpPort     { get; set; } = "587";
    public string SmtpUser     { get; set; } = "";
    public string SmtpPass     { get; set; } = "";
    public string SlackWebhook { get; set; } = "";
    public string DashboardUrl { get; set; } = "http://localhost:3000";

    /// <summary>True when .env was freshly written — triggers pgdata volume wipe.</summary>
    public bool FreshEnv { get; set; }

    // Auto-generated secrets (filled by SecretGenerator before writing)
    public string DbPassword   { get; set; } = "";
    public string JwtSecret    { get; set; } = "";
    public string VaultPassword { get; set; } = "";
}
