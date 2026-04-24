package installer

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// wingetExe holds the resolved path to winget, or the sentinel "cmd"
// meaning we call it via cmd /c to work around ACL restrictions.
var wingetExe string

// findWinget searches for winget.exe in locations that are actually
// executable from an elevated session (the per-user alias stubs in
// AppData\Local\Microsoft\WindowsApps, NOT the ACL-locked
// C:\Program Files\WindowsApps real binary).
func findWinget() string {
	// 1. Already on PATH
	if p, err := exec.LookPath("winget"); err == nil {
		return p
	}

	// 2. Per-user alias stubs for every profile on the machine
	usersDir := `C:\Users`
	entries, _ := os.ReadDir(usersDir)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		candidate := filepath.Join(usersDir, e.Name(),
			`AppData\Local\Microsoft\WindowsApps\winget.exe`)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	// 3. Current user's LOCALAPPDATA (may differ from C:\Users scan above
	//    when running as a service account)
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		candidate := filepath.Join(local, `Microsoft\WindowsApps\winget.exe`)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	return ""
}

// testWingetExecutable checks whether the given path is actually callable.
// The real binary in WindowsApps is ACL-locked even for Admins.
func testWingetExecutable(path string) bool {
	cmd := exec.Command(path, "--version")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	return cmd.Run() == nil
}

// ensureWinget resolves wingetExe, falling back through several strategies.
func ensureWinget() {
	candidate := findWinget()
	if candidate != "" {
		if testWingetExecutable(candidate) {
			wingetExe = candidate
			logSuccess("winget ready: " + candidate)
			return
		}
		// Found but ACL-locked — try via cmd /c
		logWarn("winget found but ACL-restricted, trying cmd /c fallback...")
		out, err := exec.Command("cmd", "/c", "winget --version").Output()
		if err == nil && len(out) > 0 {
			wingetExe = "cmd"
			logSuccess("winget accessible via cmd /c: " + strings.TrimSpace(string(out)))
			return
		}
	}

	// winget not found at all — try to install App Installer via MSIX
	logWarn("winget not found. Attempting to install App Installer automatically...")
	if installWinget() {
		candidate = findWinget()
		if candidate != "" && testWingetExecutable(candidate) {
			wingetExe = candidate
			logSuccess("winget installed and ready.")
			return
		}
	}

	fmt.Println()
	logWarn("Could not locate or install winget.")
	fmt.Printf("  %sPlease install 'App Installer' from the Microsoft Store:%s\n", colYellow, colReset)
	fmt.Printf("  %shttps://apps.microsoft.com/store/detail/app-installer/9NBLGGH4NNS1%s\n", colCyan, colReset)
	die("winget is required. Install App Installer and re-run.")
}

// installWinget downloads and installs the App Installer MSIX bundle.
func installWinget() bool {
	url := "https://aka.ms/getwinget"
	tmp := filepath.Join(os.TempDir(), "AppInstaller.msixbundle")

	logInfo("Downloading App Installer from " + url + " ...")
	resp, err := http.Get(url)
	if err != nil {
		logWarn("Download failed: " + err.Error())
		return false
	}
	defer resp.Body.Close()

	f, err := os.Create(tmp)
	if err != nil {
		logWarn("Cannot create temp file: " + err.Error())
		return false
	}
	if _, err = io.Copy(f, resp.Body); err != nil {
		f.Close()
		logWarn("Download write failed: " + err.Error())
		return false
	}
	f.Close()
	defer os.Remove(tmp)

	logInfo("Installing App Installer...")
	cmd := exec.Command("powershell", "-NoProfile", "-Command",
		fmt.Sprintf(`Add-AppxPackage -Path "%s"`, tmp))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		logWarn("App Installer install failed: " + err.Error())
		return false
	}
	return true
}

// runWinget calls winget with the given arguments, streaming output live.
func runWinget(args ...string) error {
	if wingetExe == "" {
		return fmt.Errorf("winget not resolved — call ensureWinget first")
	}
	var cmd *exec.Cmd
	if wingetExe == "cmd" {
		combined := "winget " + strings.Join(args, " ")
		cmd = exec.Command("cmd", "/c", combined)
	} else {
		cmd = exec.Command(wingetExe, args...)
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
