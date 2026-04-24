package installer

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"golang.org/x/sys/windows"
)

// enableVirtualTerminal enables ANSI escape sequences on the Windows console.
// This is required on Windows 10+ for color output in conhost/WT.
func enableVirtualTerminal() {
	stdout := windows.Handle(os.Stdout.Fd())
	var mode uint32
	if err := windows.GetConsoleMode(stdout, &mode); err != nil {
		return
	}
	_ = windows.SetConsoleMode(stdout, mode|windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING)
}

// ANSI colour codes
const (
	colReset  = "\033[0m"
	colRed    = "\033[31m"
	colGreen  = "\033[32m"
	colYellow = "\033[33m"
	colCyan   = "\033[36m"
	colWhite  = "\033[1;37m"
	colGray   = "\033[2m"
	colBold   = "\033[1m"
)

func logInfo(msg string)    { fmt.Printf("%s[*]%s %s\n", colCyan, colReset, msg) }
func logSuccess(msg string) { fmt.Printf("%s[+]%s %s\n", colGreen, colReset, msg) }
func logWarn(msg string)    { fmt.Printf("%s[!]%s %s\n", colYellow, colReset, msg) }
func logErr(msg string)     { fmt.Printf("%s[-]%s %s\n", colRed, colReset, msg) }
func logStep(msg string)    { fmt.Printf("\n%s>>> %s <<<%s\n\n", colWhite, msg, colReset) }
func logDim(msg string)     { fmt.Printf("%s%s%s\n", colGray, msg, colReset) }

func printBanner() {
	fmt.Println()
	lines := []string{
		`  ██████╗ ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗`,
		`  ██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║`,
		`  ██████╔╝██████╔╝█████╗  ███████║██║     ███████║`,
		`  ██╔══██╗██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║`,
		`  ██████╔╝██║  ██║███████╗██║  ██║╚██████╗██║  ██║`,
		`  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝`,
		``,
		`  ████████╗ ██████╗ ██╗    ██╗███████╗██████╗ `,
		`  ╚══██╔══╝██╔═══██╗██║    ██║██╔════╝██╔══██╗`,
		`     ██║   ██║   ██║██║ █╗ ██║█████╗  ██████╔╝`,
		`     ██║   ██║   ██║██║███╗██║██╔══╝  ██╔══██╗`,
		`     ██║   ╚██████╔╝╚███╔███╔╝███████╗██║  ██║`,
		`     ╚═╝    ╚═════╝  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝`,
	}
	for _, l := range lines {
		fmt.Printf("%s%s%s\n", colRed, l, colReset)
	}
	fmt.Println()
	logDim("  Self-hosted dark web threat intelligence platform")
	logDim("  https://github.com/Rusheelraj/Breach-Tower")
	fmt.Println()
}

func printSummary(installDir string) {
	dashURL := "http://localhost:3000"
	if u := readEnvValue(installDir+"/.env", "DASHBOARD_URL"); u != "" {
		dashURL = u
	}
	_ = dashURL

	fmt.Println()
	fmt.Printf("%s  =============================================%s\n", colRed, colReset)
	fmt.Printf("%s       Breach Tower is running!               %s\n", colGreen, colReset)
	fmt.Printf("%s  =============================================%s\n", colRed, colReset)
	fmt.Println()
	fmt.Printf("%s  Dashboard :%s  %shttp://localhost:3000%s\n", colBold, colReset, colCyan, colReset)
	fmt.Printf("%s  API Docs  :%s  %shttp://localhost:8000/docs%s\n", colBold, colReset, colCyan, colReset)
	fmt.Printf("%s  Install   :%s  %s%s%s\n", colBold, colReset, colGray, installDir, colReset)
	fmt.Println()
	fmt.Printf("%s  Useful commands:%s\n", colBold, colReset)
	logDim("    docker compose logs -f              # live logs")
	logDim("    docker compose logs -f backend      # backend only")
	logDim("    docker compose down                 # stop")
	logDim("    docker compose up -d                # start")
	logDim("    breach-tower-installer.exe --update    # update to latest")
	logDim("    breach-tower-installer.exe --uninstall # remove everything")
	fmt.Println()
	fmt.Printf("%s  Next steps:%s\n", colYellow, colReset)
	logDim("    1. Open the dashboard and register your admin account")
	logDim("    2. Add your API keys in Settings > Intelligence Sources")
	logDim("    3. Add your domains/emails in Targets")
	logDim("    4. Run your first scan")
	fmt.Println()
	logDim("  GitHub: https://github.com/Rusheelraj/Breach-Tower")
	fmt.Println()
}

// pauseAndExit prints "Press Enter to exit" and waits, keeping the window open.
func pauseAndExit(code int) {
	fmt.Println()
	fmt.Printf("%s  Press Enter to close this window...%s", colGray, colReset)
	reader := bufio.NewReader(os.Stdin)
	_, _ = reader.ReadString('\n')
	os.Exit(code)
}

// die logs an error and exits, keeping the window open.
func die(msg string) {
	logErr(msg)
	pauseAndExit(1)
}

// prompt prints a question and returns the trimmed answer.
func prompt(question, defaultVal string) string {
	if defaultVal != "" {
		fmt.Printf("%s[?]%s %s [%s]: ", colCyan, colReset, question, defaultVal)
	} else {
		fmt.Printf("%s[?]%s %s: ", colCyan, colReset, question)
	}
	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	line = strings.TrimSpace(line)
	if line == "" {
		return defaultVal
	}
	return line
}

// promptYN asks a yes/no question, returns true for y/Y.
func promptYN(question string) bool {
	fmt.Printf("%s[?]%s %s (y/N): ", colCyan, colReset, question)
	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	line = strings.TrimSpace(strings.ToLower(line))
	return line == "y" || line == "yes"
}

// readEnvValue reads a single KEY=value from an env file.
func readEnvValue(envFile, key string) string {
	f, err := os.Open(envFile)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	prefix := key + "="
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, prefix) {
			return strings.TrimPrefix(line, prefix)
		}
	}
	return ""
}
