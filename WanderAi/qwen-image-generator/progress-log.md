## Create virtual env
`python3 -m venv qwen`
`source qwen/bin/activate.fish`

## Install items
`python3 -m pip install torch`
`python3 -m pip install torchvision torchaudio`

## Running on AWS
Copy stable_diffusion_template.yml from previous folder to current folder. This file contains the CF template to run the GPU instance on local. Edit user data. Removed the venv based things. 

Copy `deploy_cf_template.py` from previous folder to current folder. 

## Copy python file to server
scp -i UbuntuGPUKeyPair.pem ./main.py ubuntu@ec2-3-109-54-62.ap-south-1.compute.amazonaws.com:/home/ubuntu/anubhav

scp -i UbuntuGPUKeyPair.pem ./anubhav.jpeg ubuntu@ec2-3-109-54-62.ap-south-1.compute.amazonaws.com:/home/ubuntu/anubhav