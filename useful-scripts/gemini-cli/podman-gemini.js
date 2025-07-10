#!/usr/bin/env node

import inquirer from "inquirer";
import { execSync, spawnSync } from "child_process";

/**
 * Displays a list of all available Podman images.
 */
async function showImages() {
  try {
    const output = execSync("podman images", { stdio: "pipe" }).toString();
    console.log("\nAvailable Podman Images:\n");
    console.log(output);
  } catch (error) {
    console.error("Error fetching images:", error.message);
  }
}

/**
 * Retrieves a formatted list of Podman image names and tags.
 * @returns {Array<string>} An array of image strings (e.g., "nginx:latest").
 */
async function getImages() {
  try {
    const output = execSync(
      'podman images --format "{{.Repository}}:{{.Tag}}"',
      { stdio: "pipe" }
    ).toString();
    return output.trim().split("\n").filter(Boolean);
  } catch (error) {
    console.error("Error getting images:", error.message);
    return [];
  }
}

/**
 * Displays detailed information about currently running Podman containers.
 */
async function showRunningContainers() {
  try {
    const output = execSync("podman ps --format json", {
      stdio: "pipe",
    }).toString();
    const containers = JSON.parse(output);
    console.log("\nRunning Podman Containers:\n");
    if (containers.length === 0) {
      console.log("No running containers found.");
    } else {
      // Basic formatting for better readability
      containers.forEach((container) => {
        console.log(`  Name: ${container.Names[0] || "N/A"}`);
        console.log(`  Image: ${container.Image}`);
        console.log(`  ID: ${container.Id}`);
        console.log(`  Status: ${container.Status}`);
        console.log(`  Ports: ${container.Ports || "N/A"}`);
        console.log("  --------------------");
      });
    }
  } catch (error) {
    console.error("Error fetching running containers:", error.message);
  }
}

/**
 * Retrieves detailed information about all Podman containers (running and stopped).
 * @returns {Array<Object>} An array of container objects.
 */
async function showAllContainers() {
  try {
    const output = execSync("podman ps -a --format json", {
      stdio: "pipe",
    }).toString();
    return JSON.parse(output);
  } catch (error) {
    console.error("Error fetching all containers:", error.message);
    return [];
  }
}

/**
 * Interactively allows the user to select and delete Podman containers.
 */
async function deleteContainers() {
  while (true) {
    const listOfContainers = await showAllContainers();

    if (listOfContainers.length === 0) {
      console.log("No containers available to delete.");
      break;
    }

    const containerChoices = listOfContainers.map((x) => ({
      name: `${x.Names[0] || "N/A"} - ${x.Image} - ${x.Id}`,
      value: x.Id, // Store the ID as the value for easy access
    }));

    const { containerId } = await inquirer.prompt([
      {
        type: "list",
        name: "containerId",
        message: "Select the container to delete:",
        choices: containerChoices,
      },
    ]);

    const selectedContainer = listOfContainers.find(
      (c) => c.Id === containerId
    );
    const containerName = selectedContainer
      ? selectedContainer.Names[0]
      : containerId;

    const { confirmDelete } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmDelete",
        message: `Are you sure you want to stop and delete container '${containerName}' (${containerId})?`,
        default: false,
      },
    ]);

    if (!confirmDelete) {
      console.log("Deletion cancelled.");
      break; // Exit the loop if user cancels
    }

    console.log(`Attempting to stop and delete container: ${containerName}`);
    try {
      // Stop the container first
      console.log(`Stopping container ${containerName}...`);
      execSync(`podman stop ${containerId}`, { stdio: "inherit" });
      console.log(`Container ${containerName} stopped.`);

      // Remove the container
      console.log(`Removing container ${containerName}...`);
      execSync(`podman rm ${containerId}`, { stdio: "inherit" });
      console.log(`Container ${containerName} deleted successfully.`);
    } catch (error) {
      console.error(
        `Failed to delete container ${containerName}:`,
        error.message
      );
    }

    const { deleteFurther } = await inquirer.prompt([
      {
        type: "list",
        name: "deleteFurther",
        message: "Delete More containers?",
        choices: ["Yes", "No"],
      },
    ]);

    if (deleteFurther === "No") {
      break;
    }
  }
}

/**
 * Interactively guides the user through running a new Podman container.
 */
async function runContainer() {
  const images = await getImages();

  if (images.length === 0) {
    console.log("No images available to run. Please pull an image first.");
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "image",
      message: "Select the image to run:",
      choices: images,
    },
    {
      type: "input",
      name: "containerName",
      message: "Enter a container name (optional):",
      validate: async (input) => {
        if (!input) return true; // Empty name is allowed
        const allContainers = await showAllContainers();
        const exists = allContainers.some(
          (c) => c.Names && c.Names[0] === input
        );
        return exists
          ? "A container with this name already exists. Please choose another."
          : true;
      },
    },
    {
      type: "input",
      name: "ports",
      message: "Enter ports to expose (e.g. 8080:80, comma-separated):",
      validate: (input) => {
        if (!input) return true;
        const portRegex = /^(\d+:\d+)(,\s*\d+:\d+)*$/;
        return portRegex.test(input)
          ? true
          : "Invalid port format. Use comma-separated hostPort:containerPort (e.g., 8080:80, 3000:3000)";
      },
    },
    {
      type: "input",
      name: "volumes",
      message:
        "Enter volume mounts (e.g. /host/path:/container/path, comma-separated):",
      validate: (input) => {
        if (!input) return true;
        const volumeRegex = /^(\/[^\s:]+:\/[^\s:]+)(,\s*\/[^\s:]+:\/[^\s:]+)*$/;
        return volumeRegex.test(input)
          ? true
          : "Invalid volume format. Use comma-separated /host/path:/container/path";
      },
    },
  ]);

  let cmd = `podman run -d`;

  if (answers.containerName.trim()) {
    cmd += ` --name ${answers.containerName.trim()}`;
  }

  if (answers.ports.trim()) {
    answers.ports
      .split(",")
      .map((p) => p.trim())
      .forEach((port) => {
        cmd += ` -p ${port}`;
      });
  }

  if (answers.volumes.trim()) {
    answers.volumes
      .split(",")
      .map((v) => v.trim())
      .forEach((volume) => {
        cmd += ` -v ${volume}`;
      });
  }

  cmd += ` ${answers.image}`;

  // Unconditionally add sleep infinity to keep the container running
  cmd += ` sleep infinity`;

  console.log(`\nRunning: ${cmd}\n`);

  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(
      `Container '${
        answers.containerName || answers.image
      }' started successfully.`
    );
  } catch (error) {
    console.error("Failed to run container:", error.message);
  }
}

/**
 * Allows the user to select a container and log into it.
 */
async function loginIntoContainer() {
  const allContainers = await showAllContainers(); // It's better to show all containers for login

  if (allContainers.length === 0) {
    console.log("No containers available to log into.");
    return;
  }

  const containerChoices = allContainers.map((x) => ({
    name: `${x.Names[0] || "N/A"} - ${x.Image} - ${x.Id} (${x.State})`, // Show state
    value: x.Id,
  }));

  const { selectedContainerId } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedContainerId",
      message: "Select the container to log into (State: Running/Exited):",
      choices: containerChoices,
    },
  ]);

  const selectedContainer = allContainers.find(
    (c) => c.Id === selectedContainerId
  );
  const containerName = selectedContainer
    ? selectedContainer.Names[0]
    : selectedContainerId;

  if (selectedContainer && selectedContainer.State !== "running") {
    console.warn(
      `Container '${containerName}' is currently '${selectedContainer.State}'. You might need to start it first if you want an interactive session.`
    );
    // Optionally ask if they want to try starting it
    const { tryStart } = await inquirer.prompt([
      {
        type: "confirm",
        name: "tryStart",
        message:
          "Do you want to try starting this container before logging in?",
        default: true,
      },
    ]);
    if (tryStart) {
      try {
        console.log(`Attempting to start container ${containerName}...`);
        execSync(`podman start ${selectedContainerId}`, { stdio: "inherit" });
        console.log(`Container ${containerName} started.`);
      } catch (startError) {
        console.error(
          `Failed to start container ${containerName}:`,
          startError.message
        );
        return; // Exit if starting failed
      }
    } else {
      console.log(
        "Login cancelled. Please start the container manually if needed."
      );
      return;
    }
  }

  console.log(
    `\nAttempting to log into container: ${containerName} (${selectedContainerId})\n`
  );

  try {
    // Use spawnSync for interactive processes like `exec -it`
    // stdio: 'inherit' ensures that stdin, stdout, and stderr are passed to the child process,
    // allowing the user to interact with the container's shell.
    // Try /bin/bash first, then /bin/sh if bash is not found
    const { shell } = await inquirer.prompt([
      {
        type: "list",
        name: "shell",
        message: "What shell you want to use ?",
        choices: [
          { name: "Bin bash", value: "/bin/bash" },
          { name: "Bin Sh", value: "/bin/sh" },
          { name: "Sh", value: "/sh" },
        ],
      },
    ]);
    spawnSync("podman", ["exec", "-it", selectedContainerId, shell], {
      stdio: "inherit",
    });
    console.log(`\nExited container ${containerName}.`);
  } catch (error) {
    console.error(
      `Failed to log into container ${containerName} with both /bin/bash and /bin/sh:`,
      shError.message
    );
  }
}


/**
 * Main function to present the CLI menu and handle user choices.
 */
async function main() {
  while (1) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What do you want to do?",
        choices: [
          { name: "Show list of images", value: "images" },
          { name: "Show running containers", value: "containers" },
          { name: "Run a new container", value: "run" },
          { name: "Stop and delete containers", value: "delete" },
          {
            name: "Login into a container (interactive shell)",
            value: "login",
          },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    if (action === "images") {
      await showImages();
    } else if (action === "run") {
      await runContainer();
    } else if (action === "containers") {
      await showRunningContainers();
    } else if (action === "delete") {
      await deleteContainers();
    } else if (action === "login") {
      await loginIntoContainer();
    } else if (action === "exit") {
        const message = 'Thank You for using Podman CLI';
        console.log(message);
        break;
    }
  }
}

main();
