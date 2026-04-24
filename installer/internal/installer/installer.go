// Package installer contains the core Breach Tower Windows installer logic.
package installer

import (
	"fmt"
	"os"
	"os/exec"
)

// Installer is the top-level controller.
type Installer struct{}

// New creates a new Installer.
func New() *Installer { return &Installer{} }

// Run executes the requested mode: "install", "update", or "uninstall".
func (inst *Installer) Run(mode string) {
	// Enable ANSI colours on Windows console
	enableVirtualTerminal()

	// Recover from any panic so the window stays open with a useful message
	defer func() {
		if r := recover(); r != nil {
			fmt.Println()
			logErr(fmt.Sprintf("Unexpected error: %v", r))
			pauseAndExit(1)
		}
	}()

	switch mode {
	case "uninstall":
		inst.runUninstall()
	case "update":
		inst.runUpdate()
	default:
		inst.runInstall()
	}
}

// ── Install ───────────────────────────────────────────────────────────────────

func (inst *Installer) runInstall() {
	printBanner()
	requireAdmin()

	logStep("System Check")
	ensureWinget()

	logStep("Installing Dependencies")
	installGit()
	installDocker()
	assertDockerRunning()
	assertDockerCompose()

	logStep("Cloning Repository")
	cloneOrUpdateRepo()

	logStep("Configuration")
	freshEnv := configureEnv()

	buildAndStart(freshEnv)
	waitForHealthy()
	printSummary(installDir)
	pauseAndExit(0)
}

// ── Update ────────────────────────────────────────────────────────────────────

func (inst *Installer) runUpdate() {
	printBanner()
	requireAdmin()
	logStep("Updating Breach Tower")

	if _, err := os.Stat(installDir + `\.git`); err != nil {
		die("Breach Tower installation not found at " + installDir +
			". Run the installer without --update first.")
	}

	runGit("-C", installDir, "reset", "--hard", "HEAD")
	runGit("-C", installDir, "clean", "-fd")
	runGit("-C", installDir, "pull", "--ff-only")

	ensureSessionFile()
	assertDockerRunning()
	assertDockerCompose()

	if err := os.Chdir(installDir); err != nil {
		die("Cannot change to install directory: " + err.Error())
	}
	cmd := exec.Command("docker", "compose", "up", "-d", "--build")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = installDir
	if err := cmd.Run(); err != nil {
		die("docker compose up --build failed: " + err.Error())
	}

	waitForHealthy()
	logSuccess("Breach Tower updated.")
	printSummary(installDir)
	pauseAndExit(0)
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

func (inst *Installer) runUninstall() {
	requireAdmin()
	logWarn("This will stop all containers and delete " + installDir + " (including your database).")

	answer := prompt("Type 'yes' to confirm", "")
	if answer != "yes" {
		logInfo("Uninstall cancelled.")
		pauseAndExit(0)
	}

	if _, err := os.Stat(installDir + `\docker-compose.yml`); err == nil {
		if err := os.Chdir(installDir); err == nil {
			cmd := exec.Command("docker", "compose", "down", "-v")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			_ = cmd.Run()
		}
	}

	if err := os.RemoveAll(installDir); err != nil {
		die("Failed to remove " + installDir + ": " + err.Error())
	}
	logSuccess("Breach Tower uninstalled.")
	pauseAndExit(0)
}
