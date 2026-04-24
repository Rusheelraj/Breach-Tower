package installer

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
)

// refreshPath reloads PATH from the registry so tools installed in this
// session are immediately available without a restart.
func refreshPath() {
	machine := regGetString(`SYSTEM\CurrentControlSet\Control\Session Manager\Environment`, "Path")
	user := regGetString(`Environment`, "Path")
	combined := machine
	if user != "" {
		combined += ";" + user
	}
	if combined != "" {
		os.Setenv("PATH", combined)
	}
}

// regGetString reads a REG_SZ / REG_EXPAND_SZ value from HKLM or HKCU.
func regGetString(subKey, valueName string) string {
	// Try HKLM first, then HKCU
	for _, root := range []string{`HKLM\` + subKey, `HKCU\` + subKey} {
		out, err := exec.Command("reg", "query", root, "/v", valueName).Output()
		if err != nil {
			continue
		}
		lines := strings.Split(string(out), "\n")
		for _, l := range lines {
			l = strings.TrimSpace(l)
			if strings.HasPrefix(l, valueName) {
				parts := strings.SplitN(l, "    ", 3)
				if len(parts) == 3 {
					return strings.TrimSpace(parts[2])
				}
			}
		}
	}
	return ""
}

// installGit installs Git for Windows via winget if not already present.
func installGit() {
	if _, err := exec.LookPath("git"); err == nil {
		out, _ := exec.Command("git", "--version").Output()
		logSuccess("Git already installed: " + strings.TrimSpace(string(out)))
		return
	}

	logInfo("Installing Git for Windows...")
	err := runWinget("install", "--id", "Git.Git",
		"-e", "--silent", "--source", "winget",
		"--accept-package-agreements", "--accept-source-agreements")
	if err != nil {
		die("Git installation failed: " + err.Error())
	}

	refreshPath()

	if _, err := exec.LookPath("git"); err != nil {
		die("Git installed but not found on PATH. Please reboot and re-run.")
	}
	out, _ := exec.Command("git", "--version").Output()
	logSuccess("Git installed: " + strings.TrimSpace(string(out)))
}

// installDocker installs Docker Desktop via winget if not already present.
func installDocker() {
	if _, err := exec.LookPath("docker"); err == nil {
		out, _ := exec.Command("docker", "--version").Output()
		ver := strings.TrimPrefix(strings.TrimSpace(string(out)), "Docker version ")
		ver = strings.SplitN(ver, ",", 2)[0]
		logSuccess("Docker already installed: v" + ver)
		return
	}

	logInfo("Docker not found. Checking prerequisites...")

	// Check Windows build (requires 19041 / 20H1 minimum)
	build := getWindowsBuild()
	if build > 0 && build < 19041 {
		die(fmt.Sprintf("Windows build %d is too old. Docker Desktop requires build 19041+. "+
			"Please upgrade Windows.", build))
	}

	// Ensure WSL2
	ensureWSL2()

	logInfo("Installing Docker Desktop via winget (this may take several minutes)...")
	err := runWinget("install", "--id", "Docker.DockerDesktop",
		"-e", "--silent", "--source", "winget",
		"--accept-package-agreements", "--accept-source-agreements")
	if err != nil {
		die("Docker Desktop installation failed: " + err.Error())
	}

	refreshPath()
	logSuccess("Docker Desktop installed. Starting it now...")
	startDockerDesktop()
}

// getWindowsBuild returns the Windows NT build number (e.g. 19041 for 20H1).
func getWindowsBuild() int {
	out, err := exec.Command("cmd", "/c", "ver").Output()
	if err != nil {
		return 0
	}
	// "Microsoft Windows [Version 10.0.19041.xxx]"
	s := string(out)
	start := strings.Index(s, "10.0.")
	if start < 0 {
		return 0
	}
	s = s[start+5:]
	end := strings.IndexAny(s, ".]")
	if end < 0 {
		return 0
	}
	var build int
	fmt.Sscanf(s[:end], "%d", &build)
	return build
}

// ensureWSL2 installs WSL2 if not present, then exits asking for a reboot.
func ensureWSL2() {
	cmd := exec.Command("wsl", "--status")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.CombinedOutput()
	if err == nil && !strings.Contains(strings.ToLower(string(out)), "not installed") {
		logSuccess("WSL2 is available.")
		return
	}

	logInfo("Enabling WSL2 (required by Docker Desktop)...")
	wslCmd := exec.Command("wsl", "--install", "--no-distribution")
	wslCmd.Stdout = os.Stdout
	wslCmd.Stderr = os.Stderr
	_ = wslCmd.Run()

	fmt.Println()
	logWarn("WSL2 has been installed. A system RESTART is required.")
	logWarn("After restarting, run this installer again to continue.")
	pauseAndExit(0)
}

// startDockerDesktop launches Docker Desktop and waits up to 120s for the
// daemon to become ready, printing progress every 20s.
func startDockerDesktop() {
	exePaths := []string{
		os.Getenv("ProgramFiles") + `\Docker\Docker\Docker Desktop.exe`,
		os.Getenv("ProgramFiles(x86)") + `\Docker\Docker\Docker Desktop.exe`,
	}

	var dockerExe string
	for _, p := range exePaths {
		if _, err := os.Stat(p); err == nil {
			dockerExe = p
			break
		}
	}
	if dockerExe == "" {
		die("Docker Desktop executable not found. Please launch it manually and re-run.")
	}

	// Only launch if not already running
	if !dockerProcessRunning() {
		logInfo("Starting Docker Desktop...")
		cmd := exec.Command(dockerExe)
		// CREATE_NEW_PROCESS_GROUP so the child isn't killed when our console closes
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000200}
		if err := cmd.Start(); err != nil {
			die("Failed to start Docker Desktop: " + err.Error())
		}
	} else {
		logInfo("Docker Desktop process already running. Waiting for daemon...")
	}

	waitForDockerDaemon(120)
}

// dockerProcessRunning checks if the Docker Desktop GUI process is alive.
func dockerProcessRunning() bool {
	out, err := exec.Command("tasklist", "/FI", "IMAGENAME eq Docker Desktop.exe", "/NH").Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), "Docker Desktop.exe")
}

// assertDockerRunning checks the daemon and starts Docker Desktop if needed.
func assertDockerRunning() {
	logInfo("Checking Docker daemon...")
	cmd := exec.Command("docker", "info")
	cmd.Stdout = nil
	cmd.Stderr = nil
	if cmd.Run() == nil {
		logSuccess("Docker daemon is running.")
		return
	}
	logWarn("Docker daemon not running. Attempting to start Docker Desktop...")
	startDockerDesktop()
}

// waitForDockerDaemon polls docker info until success or timeout (seconds).
func waitForDockerDaemon(timeoutSec int) {
	logInfo(fmt.Sprintf("Waiting for Docker daemon (up to %ds)...", timeoutSec))
	for elapsed := 0; elapsed < timeoutSec; elapsed += 5 {
		sleep(5)
		cmd := exec.Command("docker", "info")
		cmd.Stdout = nil
		cmd.Stderr = nil
		if cmd.Run() == nil {
			logSuccess("Docker daemon is ready.")
			return
		}
		if elapsed > 0 && elapsed%20 == 0 {
			logInfo(fmt.Sprintf("Still waiting for Docker... (%d/%ds)", elapsed, timeoutSec))
		}
	}
	die(fmt.Sprintf("Docker daemon did not start within %ds. "+
		"Try launching Docker Desktop manually and re-run.", timeoutSec))
}

// assertDockerCompose verifies Docker Compose v2 is available.
func assertDockerCompose() {
	out, err := exec.Command("docker", "compose", "version").Output()
	if err != nil {
		die("Docker Compose not found. Docker Desktop should bundle it. Try reinstalling.")
	}
	// Extract version number
	s := strings.TrimSpace(string(out))
	logSuccess("Docker Compose available: " + s)
}
