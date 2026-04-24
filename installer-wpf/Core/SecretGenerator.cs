using System;
using System.Security.Cryptography;
using System.Text;

namespace BreachTowerInstaller.Core;

public static class SecretGenerator
{
    private const string AlphaNum =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    /// <summary>Cryptographically random hex string (n bytes → 2n hex chars).</summary>
    public static string RandomHex(int bytes = 64)
    {
        var buf = RandomNumberGenerator.GetBytes(bytes);
        return Convert.ToHexString(buf).ToLowerInvariant();
    }

    /// <summary>Cryptographically random alphanumeric string of given length.</summary>
    public static string RandomAlphaNum(int length = 24)
    {
        var buf = RandomNumberGenerator.GetBytes(length);
        var sb  = new StringBuilder(length);
        foreach (var b in buf)
            sb.Append(AlphaNum[b % AlphaNum.Length]);
        return sb.ToString();
    }

    /// <summary>Fill all secret fields on the config object.</summary>
    public static void Populate(EnvConfig cfg)
    {
        cfg.DbPassword    = RandomAlphaNum(24);
        cfg.JwtSecret     = RandomHex(64);
        cfg.VaultPassword = RandomAlphaNum(24);
    }
}
