#!/opt/homebrew/bin/fish

# This script automates the launch and setup of an AWS EC2 g4dn.xlarge instance
# with the Stable Diffusion WebUI (Automatic1111) pre-installed on a
# Deep Learning AMI.

# --- Configuration Variables ---
# Customize these variables to your needs.
set -l region "ap-south-1"
set -l key_pair_name "StableDiffusionKey"
set -l security_group_name "StableDiffusionSG"
set -l instance_type "g4dn.xlarge"
set -l instance_name "StableDiffusionServer"
set -l stable_diffusion_repo "https://github.com/AUTOMATIC1111/stable-diffusion-webui.git"
set -l ssh_user "ubuntu" # Default user for Deep Learning AMIs (Ubuntu)
set -l webui_port "7860" # Default port for the web UI

# --- EBS Volume Configuration ---
# Set to 'true' to specify a custom volume size.
# Set to 'false' to use the default root volume size of the AMI (e.g., 30 GB).
set -l use_custom_ebs_volume true
set -l ebs_volume_size "100" # Size in GB for the root volume (only used if use_custom_ebs_volume is true)

# --- Main Script Logic ---
echo "--- Starting AWS EC2 Instance Provisioning for Stable Diffusion ---"
echo "Region: $region"
echo "Instance Type: $instance_type"


# 2. Check for SSH key pair. Create if it doesn't exist.
echo "Checking for key pair '$key_pair_name'..."
if not aws ec2 describe-key-pairs --key-names $key_pair_name --region $region > /dev/null 2>&1
    echo "Key pair not found. Creating a new one..."
    set -l key_material (aws ec2 create-key-pair --key-name $key_pair_name --query "KeyMaterial" --output text --region $region)
    echo $key_material > $key_pair_name.pem
    chmod 400 $key_pair_name.pem
    echo "Key pair '$key_pair_name' created successfully."
else
    echo "Key pair '$key_pair_name' already exists."
    if not test -e $key_pair_name.pem
        echo "Warning: .pem file not found locally. Please ensure it exists for SSH access."
        exit 1
    end
end

# 3. Check for Security Group. Create if it doesn't exist.
echo "Checking for security group '$security_group_name'..."
set -l security_group_id (aws ec2 describe-security-groups --filters Name=group-name,Values=$security_group_name --query 'SecurityGroups[*].GroupId' --output text --region $region)

if test -z "$security_group_id"
    echo "Security group not found. Creating a new one..."
    set -l create_output (aws ec2 create-security-group --group-name $security_group_name --description "Stable Diffusion access" --output json --region $region)
    set security_group_id (echo $create_output | jq -r .GroupId)
    echo "Security group '$security_group_name' created with ID: $security_group_id"

    # Authorize inbound traffic
    echo "Authorizing SSH and WebUI ports..."
    aws ec2 authorize-security-group-ingress --group-id $security_group_id --protocol tcp --port 22 --cidr 0.0.0.0/0 --region $region
    aws ec2 authorize-security-group-ingress --group-id $security_group_id --protocol tcp --port $webui_port --cidr 0.0.0.0/0 --region $region
    echo "Inbound rules for SSH (22) and WebUI ($webui_port) added."
else
    echo "Security group '$security_group_name' already exists with ID: $security_group_id"
end

# 4. Find the latest Deep Learning AMI ID
echo "Finding the latest Deep Learning AMI for PyTorch/Ubuntu..."
set -l ami_id (aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=Deep Learning OSS Nvidia Driver AMI GPU PyTorch*Ubuntu*" "Name=state,Values=available" \
    --query "reverse(sort_by(Images, &CreationDate))[:1].ImageId" \
    --output text \
    --region $region)

if test -z "$ami_id"
    echo "Error: Could not find a suitable Deep Learning AMI."
    echo "Please check the AMI name filter and your AWS region."
    exit 1
end

echo "Found AMI ID: $ami_id"

# 5. Build the run-instances command arguments conditionally
set -l run_args "--image-id $ami_id --instance-type $instance_type --count 1 --key-name $key_pair_name --security-group-ids $security_group_id --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value='$instance_name'}]' --associate-public-ip-address --region $region"

if test "$use_custom_ebs_volume" = "true"
    set run_args $run_args "--block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=$ebs_volume_size,VolumeType=gp3,DeleteOnTermination=true}'"
    echo "Using a custom EBS volume size of $ebs_volume_size GB."
else
    echo "Warning: No custom EBS volume specified. Using the AMI's default size (typically 30 GB)."
    echo "This may not be sufficient for Stable Diffusion models and outputs."
end

# 6. Launch the EC2 instance
echo "Launching EC2 instance '$instance_name'..."
set -l launch_output (eval "aws ec2 run-instances $run_args" \
    --query "Instances[0].InstanceId" \
    --output text)

set -l instance_id $launch_output
echo "Instance ID: $instance_id"

# 7. Wait for the instance to be in the 'running' state
echo "Waiting for instance to start. This may take a few minutes..."
aws ec2 wait instance-running --instance-ids $instance_id --region $region

# 8. Get the public IP address
echo "Instance is running. Getting public IP address..."
set -l public_ip (aws ec2 describe-instances \
    --instance-ids $instance_id \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --region $region)

if test -z "$public_ip"
    echo "Error: Failed to get public IP address."
    exit 1
end

echo "Public IP Address: $public_ip"
echo "You can access the instance via SSH at: ssh -i $key_pair_name.pem $ssh_user@$public_ip"

# 9. SSH into the instance and run the setup script
echo "Connecting to instance and setting up Stable Diffusion WebUI..."
ssh -i $key_pair_name.pem $ssh_user@$public_ip <<EOF
    # --- Start of remote commands ---
    
    # Update the package lists
    echo "Updating system packages..."
    sudo apt-get update -y
    
    # Clone the Stable Diffusion WebUI repository
    echo "Cloning Stable Diffusion WebUI repository..."
    git clone $stable_diffusion_repo

    # Navigate to the repository directory
    cd stable-diffusion-webui

    # Run the webui.sh script to install dependencies and start the server
    # --listen: makes the server accessible from the public internet
    # --xformers: enables memory-efficient attention for better performance
    echo "Installing dependencies and starting WebUI. This will take a while..."
    # Using 'nohup' and '&' to run the process in the background and not terminate it with the SSH session
    nohup bash webui.sh --listen --xformers &
    
    echo "WebUI setup script has been started in the background. It will continue to run even if you disconnect."
    
    # --- End of remote commands ---
EOF

echo "Instance setup script completed."
echo "--------------------------------------------------------"
echo "Your Stable Diffusion WebUI should be starting up."
echo "It may take 5-10 minutes for all models to download and the service to become available."
echo "Access the WebUI in your browser at: http://$public_ip:$webui_port"
echo "--------------------------------------------------------"
echo "To terminate the instance and stop billing, run the following command:"
echo "aws ec2 terminate-instances --instance-ids $instance_id --region $region"
