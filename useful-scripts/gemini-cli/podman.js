#!/usr/bin/env node

import inquirer from 'inquirer';
import { execSync } from 'child_process';

async function showImages() {
  try {
    const output = execSync('podman images', { stdio: 'pipe' }).toString();
    console.log('\nAvailable Podman Images:\n');
    console.log(output);
  } catch (error) {
    console.error('Error fetching images:', error.message);
  }
}

async function getImages() {
  try {
    const output = execSync('podman images --format "{{.Repository}}:{{.Tag}}"', { stdio: 'pipe' }).toString();
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function showRunningContainers() {
  try {
    const output = execSync('podman ps --format json', { stdio: 'pipe' }).toString();
    console.log(JSON.parse(output));
    return null;
  } catch (error) {
    return [];
  }
}

async function showAllContainers() {
  try {
    const output = execSync('podman ps -a --format json', { stdio: 'pipe' }).toString();
    return JSON.parse(output);
  } catch (error) {
    return [];
  }
}

async function deleteContainers() {
  while (1) {
    const listOfContainers = await showAllContainers();
    const containerToDeleteObj = await inquirer.prompt([
      {
        type: 'list',
        name: 'image',
        message: 'Select the image to run:',
        choices: listOfContainers.map(x => `${x.Names[0]} - ${x.Image} - ${x.Id}`),
      }
    ]);
    console.log(`Container to be deleted: ${containerToDeleteObj.image.split('-')[0]}`);
    const containerId = containerToDeleteObj.image.split(' - ')[2];
    const containerName = containerToDeleteObj.image.split(' - ')[0];
    execSync(`podman stop ${containerId}`, { stdio: 'pipe' }).toString();
    execSync(`podman rm ${containerId}`, { stdio: 'pipe' }).toString();
    console.log(`Container ${containerName} deleted successfully`);
    const deleteFurther = await inquirer.prompt([
      {
        type: 'list',
        name: 'delFur',
        message: 'Delete More ? :',
        choices: ['Yes', 'No'],
      }
    ]);
    if (deleteFurther.delFur === 'No') {
      break;
    }
  }
}

async function runContainer() {
  const images = await getImages();

  if (images.length === 0) {
    console.log('No images available to run.');
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'image',
      message: 'Select the image to run:',
      choices: images,
    },
    {
      type: 'input',
      name: 'containerName',
      message: 'Enter a container name (optional):',
    },
    {
      type: 'input',
      name: 'ports',
      message: 'Enter ports to expose (e.g. 8080:80, comma-separated):',
    },
    {
      type: 'input',
      name: 'volumes',
      message: 'Enter volume mounts (e.g. /host:/container, comma-separated):',
    },
  ]);

  let cmd = `podman run -d`;

  if (answers.containerName.trim()) {
    cmd += ` --name ${answers.containerName.trim()}`;
  }

  if (answers.ports.trim()) {
    answers.ports.split(',').map(p => p.trim()).forEach(port => {
      cmd += ` -p ${port}`;
    });
  }

  if (answers.volumes.trim()) {
    answers.volumes.split(',').map(v => v.trim()).forEach(volume => {
      cmd += ` -v ${volume}`;
    });
  }

  cmd += ` ${answers.image}`;

  console.log(`\nRunning: ${cmd}\n`);

  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to run container:', error.message);
  }
}

async function main() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What do you want to do?',
      choices: [
        { name: 'Show list of images', value: 'images' },
        { name: 'Show running containers', value: 'containers' },
        { name: 'Run a container', value: 'run' },
        { name: 'Stop and delete containers', value: 'delete' },
      ],
    },
  ]);

  if (action === 'images') {
    await showImages();
  } else if (action === 'run') {
    await runContainer();
  } else if (action === 'containers') {
    await showRunningContainers();
  } else if (action === 'delete') {
    await deleteContainers();
  }
}

main();
