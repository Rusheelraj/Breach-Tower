package installer

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

// sleep pauses execution for n seconds.
func sleep(n int) {
	time.Sleep(time.Duration(n) * time.Second)
}

// buildAndStart builds the Docker images and starts all services.
// If freshEnv is true the pgdata volume is wiped first to avoid a
// password-mismatch between the old volume and the new .env.
func buildAndStart(freshEnv bool) {
	logStep("Building and Starting Breach Tower")

	if err := os.Chdir(installDir); err != nil {
		die("Cannot change to install directory: " + err.Error())
	}

	// Check if any containers are already running
	hasRunning := dockerHasRunning()

	if hasRunning {
		if freshEnv {
			logWarn("New .env detected — wiping old database volume to avoid password mismatch...")
			runCompose("down", "-v")
		} else {
			logInfo("Stopping existing containers...")
			runCompose("down")
		}
	} else if freshEnv {
		logInfo("Removing any stale database volume...")
		// Ignore errors — volume may not exist yet
		cmd := exec.Command("docker", "compose", "down", "-v")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		_ = cmd.Run()
	}

	ensureSessionFile()

	logInfo("Building Docker images (this may take a few minutes on first run)...")
	runCompose("build", "--no-cache")

	logInfo("Starting all services...")
	runCompose("up", "-d")

	logSuccess("All services started.")
}

// dockerHasRunning returns true if any compose service containers are running.
func dockerHasRunning() bool {
	out, err := exec.Command("docker", "compose", "ps",
		"--services", "--filter", "status=running").Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) != ""
}

// runCompose runs a `docker compose <args>` command streaming output live.
func runCompose(args ...string) {
	fullArgs := append([]string{"compose"}, args...)
	cmd := exec.Command("docker", fullArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = installDir
	if err := cmd.Run(); err != nil {
		die(fmt.Sprintf("docker compose %s failed: %s", args[0], err.Error()))
	}
}

// waitForHealthy polls the backend /api/health endpoint until it responds
// 200 OK or the timeout is reached.
func waitForHealthy() {
	logInfo("Waiting for services to become healthy...")
	const retries = 40
	client := &http.Client{Timeout: 3 * time.Second}
	for i := 0; i < retries; i++ {
		resp, err := client.Get("http://localhost:8000/api/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				logSuccess("Backend is up and healthy.")
				return
			}
		}
		sleep(3)
		if i > 0 && i%5 == 0 {
			logInfo(fmt.Sprintf("Still waiting... (%d/%d)", i, retries))
		}
	}
	logWarn("Backend did not respond within 120 seconds.")
	logWarn("Check logs with:  cd " + installDir + "  then  docker compose logs -f backend")
}
