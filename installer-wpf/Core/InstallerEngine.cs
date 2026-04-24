using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace BreachTowerInstaller.Core;

/// <summary>
/// Delegate for streaming a log line back to the UI.
/// colour: "info" | "success" | "warn" | "error" | "dim"
/// </summary>
public delegate void LogLine(string message, string colour = "info");

/// <summary>
/// Delegate for updating the progress bar (0–100) and status label.
/// </summary>
public delegate void ProgressUpdate(int percent, string label);

/// <summary>
/// All installer logic. Runs on a background thread; communicates with
/// the WPF UI exclusively through the LogLine and ProgressUpdate delegates.
/// </summary>
public class InstallerEngine
{
    public const string InstallDir  = @"C:\breach-tower";
    public const string RepoUrl     = "https://github.com/Rusheelraj/Breach-Tower.git";
    public const string SessionFile = @"C:\breach-tower\breachtower_session.session";

    private readonly LogLine      _log;
    private readonly ProgressUpdate _progress;

    // Resolved winget path or sentinel "cmd"
    private string _wingetExe = string.Empty;

    public InstallerEngine(LogLine log, ProgressUpdate progress)
    {
        _log      = log;
        _progress = progress;
    }

    // ── Public entry points ──────────────────────────────────────────────────

    public async Task InstallAsync(EnvConfig config, CancellationToken ct)
    {
        var steps = new (string Label, int Pct, Func<CancellationToken, Task> Action)[]
        {
            ("Checking winget",        5,  _ => { EnsureWinget(); return Task.CompletedTask; }),
            ("Installing Git",         15, _ => { InstallGit();   return Task.CompletedTask; }),
            ("Installing Docker",      30, InstallDockerAsync),
            ("Starting Docker",        45, _ => { AssertDockerRunning(); return Task.CompletedTask; }),
            ("Cloning repository",     55, _ => { CloneOrUpdate(); return Task.CompletedTask; }),
            ("Writing configuration",  65, _ => { WriteEnv(config); return Task.CompletedTask; }),
            ("Building images",        75, _ => { BuildAndStart(config.FreshEnv); return Task.CompletedTask; }),
            ("Waiting for health",     90, WaitForHealthAsync),
        };

        foreach (var (label, pct, action) in steps)
        {
            ct.ThrowIfCancellationRequested();
            _progress(pct, label);
            await Task.Run(() => action(ct), ct);
        }
        _progress(100, "Done");
    }

    public async Task UpdateAsync(CancellationToken ct)
    {
        _progress(10,  "Pulling latest code");
        await Task.Run(() => GitPull(), ct);

        _progress(30, "Ensuring session file");
        EnsureSessionFile();

        _progress(40, "Checking Docker");
        await Task.Run(() => AssertDockerRunning(), ct);

        _progress(55, "Rebuilding images");
        await Task.Run(() => RunCompose("up", "-d", "--build"), ct);

        _progress(85, "Waiting for health");
        await WaitForHealthAsync(ct);
        _progress(100, "Done");
    }

    public void Uninstall()
    {
        _progress(20, "Stopping containers");
        var composePath = Path.Combine(InstallDir, "docker-compose.yml");
        if (File.Exists(composePath))
            RunCompose("down", "-v");

        _progress(70, "Removing files");
        if (Directory.Exists(InstallDir))
            Directory.Delete(InstallDir, recursive: true);

        _progress(100, "Uninstalled");
        _log("Breach Tower has been uninstalled.", "success");
    }

    // ── winget ───────────────────────────────────────────────────────────────

    private void EnsureWinget()
    {
        _log("Locating winget...", "info");

        // 1. Check PATH
        var fromPath = FindOnPath("winget.exe");
        if (fromPath != null && TestWingetExecutable(fromPath))
        {
            _wingetExe = fromPath;
            _log("winget ready: " + fromPath, "success");
            return;
        }

        // 2. Scan per-user alias stubs (not the ACL-locked WindowsApps real binary)
        var candidates = new List<string>();
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        candidates.Add(Path.Combine(localAppData, @"Microsoft\WindowsApps\winget.exe"));

        try
        {
            foreach (var dir in Directory.GetDirectories(@"C:\Users"))
                candidates.Add(Path.Combine(dir, @"AppData\Local\Microsoft\WindowsApps\winget.exe"));
        }
        catch { /* ignore access errors */ }

        foreach (var c in candidates)
        {
            if (File.Exists(c) && TestWingetExecutable(c))
            {
                _wingetExe = c;
                _log("winget ready: " + c, "success");
                return;
            }
        }

        // 3. Fall back to cmd /c winget (resolves through interactive user's PATH)
        _log("Direct winget ACL-restricted, trying cmd /c fallback...", "warn");
        var ver = RunCapture("cmd", "/c winget --version");
        if (ver != null)
        {
            _wingetExe = "cmd";
            _log("winget accessible via cmd /c: " + ver.Trim(), "success");
            return;
        }

        throw new InstallerException(
            "winget (App Installer) not found.\n\n" +
            "Please install 'App Installer' from the Microsoft Store:\n" +
            "https://apps.microsoft.com/store/detail/app-installer/9NBLGGH4NNS1");
    }

    private bool TestWingetExecutable(string path)
    {
        try
        {
            var p = new Process
            {
                StartInfo = new ProcessStartInfo(path, "--version")
                {
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true,
                }
            };
            p.Start();
            p.WaitForExit(5000);
            return p.ExitCode == 0;
        }
        catch { return false; }
    }

    private void RunWinget(params string[] args)
    {
        if (string.IsNullOrEmpty(_wingetExe))
            throw new InstallerException("winget not resolved.");

        // Always add --source winget to avoid msstore failures in elevated sessions
        var allArgs = new List<string>(args) { "--source", "winget" };

        int exitCode;
        if (_wingetExe == "cmd")
        {
            var argStr = "winget " + string.Join(" ", allArgs);
            exitCode = RunStream("cmd", "/c " + argStr);
        }
        else
        {
            exitCode = RunStream(_wingetExe, string.Join(" ", allArgs));
        }

        // Non-fatal winget exit codes — these do not prevent installation
        var nonFatal = new HashSet<int>
        {
            unchecked((int)0x8a150015), // APPINSTALLER_CLI_ERROR_UPDATE_NOT_APPLICABLE (already up to date)
            unchecked((int)0x8a150109), // APPINSTALLER_CLI_ERROR_PACKAGE_ALREADY_INSTALLED
            unchecked((int)0x8a15000f), // APPINSTALLER_CLI_ERROR_SOURCE_DATA_MISSING
                                        //   msstore source fails in elevated/SYSTEM sessions even when
                                        //   --source winget is set; the winget source succeeds regardless
        };

        if (nonFatal.Contains(exitCode))
        {
            _log($"winget: non-fatal exit 0x{exitCode:X8} — continuing", "info");
            return;
        }

        if (exitCode != 0)
            throw new InstallerException($"winget exited with code 0x{exitCode:X8}");
    }

    // ── Git ───────────────────────────────────────────────────────────────────

    private void InstallGit()
    {
        if (FindOnPath("git.exe") != null)
        {
            var v = RunCapture("git", "--version") ?? "";
            _log("Git already installed: " + v.Trim(), "success");
            return;
        }

        _log("Installing Git for Windows...", "info");
        RunWinget("install", "--id", "Git.Git", "-e", "--silent",
                  "--accept-package-agreements", "--accept-source-agreements");

        RefreshPath();

        if (FindOnPath("git.exe") == null)
        {
            // Git may be installed but PATH not yet refreshed in this process
            // Try the default install location directly
            var gitDefault = @"C:\Program Files\Git\bin\git.exe";
            if (File.Exists(gitDefault))
            {
                var pathMachine = Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.Machine) ?? "";
                var pathUser    = Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.User) ?? "";
                Environment.SetEnvironmentVariable("PATH",
                    pathMachine + ";" + pathUser + @";C:\Program Files\Git\bin;C:\Program Files\Git\cmd",
                    EnvironmentVariableTarget.Process);
                _log("Git found at default location, PATH updated.", "info");
            }
            else
            {
                throw new InstallerException(
                    "Git was installed but could not be found on PATH.\n" +
                    "Please reboot and re-run the installer.");
            }
        }

        var ver = RunCapture("git", "--version") ?? "";
        _log("Git installed: " + ver.Trim(), "success");
    }

    private void RunGit(params string[] args)
    {
        int code = RunStream("git", string.Join(" ", args), InstallDir);
        if (code != 0)
            throw new InstallerException($"git {args[0]} failed (exit {code})");
    }

    private void GitPull()
    {
        if (!Directory.Exists(Path.Combine(InstallDir, ".git")))
            throw new InstallerException("Breach Tower not installed. Run a fresh install first.");

        _log("Pulling latest changes...", "info");
        RunGit("-C", InstallDir, "reset", "--hard", "HEAD");
        RunGit("-C", InstallDir, "clean", "-fd");
        RunGit("-C", InstallDir, "pull", "--ff-only");
        _log("Repository updated.", "success");
    }

    private void CloneOrUpdate()
    {
        if (Directory.Exists(Path.Combine(InstallDir, ".git")))
        {
            _log("Repository already cloned. Pulling latest...", "info");
            GitPull();
        }
        else
        {
            _log($"Cloning repository into {InstallDir} ...", "info");
            Directory.CreateDirectory(InstallDir);
            int code = RunStream("git", $"clone {RepoUrl} \"{InstallDir}\"");
            if (code != 0)
                throw new InstallerException("git clone failed.");
            _log("Repository cloned.", "success");
        }
    }

    // ── Docker ────────────────────────────────────────────────────────────────

    private async Task InstallDockerAsync(CancellationToken ct)
    {
        if (FindOnPath("docker.exe") != null)
        {
            var v = RunCapture("docker", "--version") ?? "";
            _log("Docker already installed: " + v.Trim(), "success");
            return;
        }

        _log("Docker not found. Checking prerequisites...", "info");

        // Windows build check
        var build = GetWindowsBuild();
        if (build > 0 && build < 19041)
            throw new InstallerException(
                $"Windows build {build} is too old. Docker Desktop requires build 19041+.");

        // WSL2 check
        EnsureWSL2();

        _log("Installing Docker Desktop (this may take several minutes)...", "info");
        await Task.Run(() => RunWinget("install", "--id", "Docker.DockerDesktop", "-e", "--silent",
                             "--accept-package-agreements", "--accept-source-agreements"), ct);

        RefreshPath();

        // Also add Docker's default install path in case PATH refresh didn't catch it
        var dockerDefault = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            @"Docker\Docker\resources\bin");
        if (Directory.Exists(dockerDefault))
        {
            var cur = Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.Process) ?? "";
            if (!cur.Contains(dockerDefault))
                Environment.SetEnvironmentVariable("PATH", cur + ";" + dockerDefault,
                    EnvironmentVariableTarget.Process);
        }

        _log("Docker Desktop installed. Starting daemon...", "success");
        await StartDockerDesktopAsync(ct);
    }

    private void EnsureWSL2()
    {
        try
        {
            var result = RunCapture("wsl", "--status");
            if (result != null && !result.Contains("not installed", StringComparison.OrdinalIgnoreCase))
            {
                _log("WSL2 is available.", "success");
                return;
            }
        }
        catch { }

        _log("Enabling WSL2 (required by Docker Desktop)...", "info");
        RunStream("wsl", "--install --no-distribution");
        throw new RestartRequiredException(
            "WSL2 has been installed. A system restart is required.\n\n" +
            "Please restart your computer and run the installer again.");
    }

    private void AssertDockerRunning()
    {
        _log("Checking Docker daemon...", "info");
        if (DockerIsRunning())
        {
            _log("Docker daemon is running.", "success");
            return;
        }
        _log("Docker not running — starting Docker Desktop...", "warn");
        StartDockerDesktopAsync(CancellationToken.None).GetAwaiter().GetResult();
    }

    private async Task StartDockerDesktopAsync(CancellationToken ct)
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                         @"Docker\Docker\Docker Desktop.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                         @"Docker\Docker\Docker Desktop.exe"),
        };

        string? exe = null;
        foreach (var c in candidates)
            if (File.Exists(c)) { exe = c; break; }

        if (exe == null)
            throw new InstallerException("Docker Desktop executable not found. Please launch it manually.");

        if (!IsProcessRunning("Docker Desktop"))
        {
            _log("Starting Docker Desktop...", "info");
            Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true });
        }
        else
        {
            _log("Docker Desktop already running. Waiting for daemon...", "info");
        }

        _log("Waiting for Docker daemon (up to 120s)...", "info");
        int elapsed = 0;
        while (elapsed < 120)
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(5000, ct);
            elapsed += 5;
            if (DockerIsRunning())
            {
                _log("Docker daemon is ready.", "success");
                return;
            }
            if (elapsed % 20 == 0)
                _log($"Still waiting for Docker... ({elapsed}/120s)", "info");
        }
        throw new InstallerException("Docker daemon did not start within 120 seconds.");
    }

    private bool DockerIsRunning()
    {
        try
        {
            var p = new Process
            {
                StartInfo = new ProcessStartInfo("docker", "info")
                {
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true,
                }
            };
            p.Start();
            p.WaitForExit(8000);
            return p.ExitCode == 0;
        }
        catch { return false; }
    }

    // ── Docker Compose ────────────────────────────────────────────────────────

    private void BuildAndStart(bool freshEnv)
    {
        bool hasRunning = ComposeHasRunning();

        if (hasRunning)
        {
            if (freshEnv)
            {
                _log("New config detected — wiping old database volume...", "warn");
                RunCompose("down", "-v");
            }
            else
            {
                _log("Stopping existing containers...", "info");
                RunCompose("down");
            }
        }
        else if (freshEnv)
        {
            _log("Removing any stale database volume...", "info");
            try { RunCompose("down", "-v"); } catch { /* ignore */ }
        }

        EnsureSessionFile();

        _log("Building Docker images (first run may take several minutes)...", "info");
        RunCompose("build", "--no-cache");

        _log("Starting all services...", "info");
        RunCompose("up", "-d");
        _log("All services started.", "success");
    }

    private bool ComposeHasRunning()
    {
        try
        {
            var p = new Process
            {
                StartInfo = new ProcessStartInfo("docker",
                    "compose ps --services --filter status=running")
                {
                    RedirectStandardOutput = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true,
                    WorkingDirectory       = InstallDir,
                }
            };
            p.Start();
            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit();
            return !string.IsNullOrWhiteSpace(output);
        }
        catch { return false; }
    }

    private void RunCompose(params string[] args)
    {
        var fullArgs = "compose " + string.Join(" ", args);
        int code = RunStream("docker", fullArgs, InstallDir);
        if (code != 0)
            throw new InstallerException($"docker compose {args[0]} failed (exit {code})");
    }

    private async Task WaitForHealthAsync(CancellationToken ct)
    {
        _log("Waiting for backend health check...", "info");
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        for (int i = 0; i < 40; i++)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var resp = await http.GetAsync("http://localhost:8000/api/health", ct);
                if (resp.IsSuccessStatusCode)
                {
                    _log("Backend is up and healthy.", "success");
                    return;
                }
            }
            catch { }
            await Task.Delay(3000, ct);
            if (i > 0 && i % 5 == 0)
                _log($"Still waiting... ({i}/40)", "info");
        }
        _log("Backend did not respond within 120s. Check logs: docker compose logs -f backend", "warn");
    }

    // ── Session file ──────────────────────────────────────────────────────────

    public static void EnsureSessionFile()
    {
        if (Directory.Exists(SessionFile))
        {
            Directory.Delete(SessionFile, true);
        }
        if (!File.Exists(SessionFile))
        {
            Directory.CreateDirectory(InstallDir);
            File.WriteAllBytes(SessionFile, Array.Empty<byte>());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Run a process and stream stdout/stderr to _log. Returns exit code.
    private int RunStream(string exe, string args, string? workDir = null)
    {
        var psi = new ProcessStartInfo(exe, args)
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
        };
        if (workDir != null) psi.WorkingDirectory = workDir;

        using var p = new Process { StartInfo = psi };
        p.OutputDataReceived += (_, e) => { if (e.Data != null) _log(e.Data, "dim"); };
        p.ErrorDataReceived  += (_, e) => { if (e.Data != null) _log(e.Data, "dim"); };
        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        p.WaitForExit();
        return p.ExitCode;
    }

    /// Run a process silently and return captured stdout, or null on failure.
    private string? RunCapture(string exe, string args)
    {
        try
        {
            var p = new Process
            {
                StartInfo = new ProcessStartInfo(exe, args)
                {
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true,
                }
            };
            p.Start();
            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(10000);
            return p.ExitCode == 0 ? output : null;
        }
        catch { return null; }
    }

    private static string? FindOnPath(string exe)
    {
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try
            {
                var full = Path.Combine(dir.Trim(), exe);
                if (File.Exists(full)) return full;
            }
            catch { }
        }
        return null;
    }

    private static void RefreshPath()
    {
        var machine = Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.Machine) ?? "";
        var user    = Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.User) ?? "";
        Environment.SetEnvironmentVariable("PATH", machine + ";" + user, EnvironmentVariableTarget.Process);
    }

    private static int GetWindowsBuild()
    {
        try { return Environment.OSVersion.Version.Build; }
        catch { return 0; }
    }

    private static bool IsProcessRunning(string name)
    {
        return Process.GetProcessesByName(name).Length > 0;
    }

    // ── .env writing ──────────────────────────────────────────────────────────

    private void WriteEnv(EnvConfig cfg)
    {
        var envPath = Path.Combine(InstallDir, ".env");
        var content = EnvWriter.Build(cfg);
        // UTF-8 without BOM — Python's dotenv requires this
        File.WriteAllText(envPath, content, new System.Text.UTF8Encoding(false));
        _log(".env written to " + envPath, "success");
    }
}

/// <summary>Thrown when a fatal installer error occurs.</summary>
public class InstallerException : Exception
{
    public InstallerException(string message) : base(message) { }
}

/// <summary>Thrown when a reboot is required (e.g. after WSL2 install).</summary>
public class RestartRequiredException : Exception
{
    public RestartRequiredException(string message) : base(message) { }
}
