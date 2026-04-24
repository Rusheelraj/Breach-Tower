package installer

import (
	"os"
	"os/exec"
)

const (
	installDir  = `C:\breach-tower`
	repoURL     = "https://github.com/Rusheelraj/Breach-Tower.git"
	sessionFile = installDir + `\breachtower_session.session`
)

// cloneOrUpdateRepo clones the repo if absent, otherwise pulls latest.
func cloneOrUpdateRepo() {
	gitDir := installDir + `\.git`
	if _, err := os.Stat(gitDir); err == nil {
		logInfo("Breach Tower already cloned. Pulling latest changes...")
		runGit("-C", installDir, "reset", "--hard", "HEAD")
		runGit("-C", installDir, "clean", "-fd")
		runGit("-C", installDir, "pull", "--ff-only")
		logSuccess("Repository updated.")
	} else {
		logInfo("Cloning Breach Tower into " + installDir + " ...")
		if err := os.MkdirAll(installDir, 0755); err != nil {
			die("Cannot create install directory: " + err.Error())
		}
		runGit("clone", repoURL, installDir)
		logSuccess("Repository cloned.")
	}
}

// runGit runs a git command streaming output to stdout/stderr.
func runGit(args ...string) {
	cmd := exec.Command("git", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		die("git " + args[0] + " failed: " + err.Error())
	}
}

// ensureSessionFile creates the Telegram session file as an empty regular
// file if it does not exist. Docker would otherwise create it as a directory,
// breaking Telethon.
func ensureSessionFile() {
	info, err := os.Stat(sessionFile)
	if err == nil {
		if info.IsDir() {
			// Docker created it as a directory — remove and replace
			_ = os.RemoveAll(sessionFile)
			logWarn("Replaced Telegram session directory with an empty file.")
		} else {
			return // already a file — nothing to do
		}
	}
	f, err := os.Create(sessionFile)
	if err != nil {
		die("Cannot create Telegram session file: " + err.Error())
	}
	f.Close()
	logInfo("Created empty Telegram session placeholder (authenticate via Settings).")
}
