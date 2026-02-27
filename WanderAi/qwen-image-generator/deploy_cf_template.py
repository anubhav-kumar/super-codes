import subprocess
import sys
import os

# --- IMPORTANT: SCRIPT CONFIGURATION ---
# The name of your CloudFormation template file.
# Make sure this script is in the same directory as the template file,
# or provide the full path to it.
TEMPLATE_FILE = 'stable_diffusion_template.yml'
AWS_REGION = 'ap-south-1'

# --- DYNAMIC USER INPUTS ---
KEY_NAME = 'UbuntuGPUKeyPair'
STACK_NAME = 'StabilityDiffusionInstanceDeployment'

def run_aws_cli_command(command):
    """
    Runs an AWS CLI command using subprocess.
    Exits the script if the command fails.
    """
    try:
        # subprocess.run is safer and more flexible than os.system
        # We pass the command as a list of arguments to avoid shell injection
        # and to handle arguments with spaces properly.
        print(f"Executing command: {' '.join(command)}")
        result = subprocess.run(
            command,
            check=True,  # Raises an exception if the command returns a non-zero exit code
            text=True,   # Captures output as text instead of bytes
            capture_output=True # Captures stdout and stderr
        )
        print("Command executed successfully.")
        print(result.stdout)
    except FileNotFoundError:
        print("Error: The 'aws' command was not found. "
              "Please ensure the AWS CLI is installed and in your system's PATH.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error executing AWS CLI command. Return code: {e.returncode}")
        print(f"STDOUT:\n{e.stdout}")
        print(f"STDERR:\n{e.stderr}")
        sys.exit(1)


def deploy_cloudformation_stack():
    """
    Constructs and runs the 'aws cloudformation deploy' command.
    """
    # Build the base command and arguments as a list
    aws_command = [
        'aws', 'cloudformation', 'deploy',
        '--template-file', TEMPLATE_FILE,
        '--stack-name', STACK_NAME,
        '--region', AWS_REGION,
        '--parameter-overrides',
        f'KeyName={KEY_NAME}',
        # This capability is required because the template creates a Security Group,
        # which is a resource that can affect permissions.
        '--capabilities', 'CAPABILITY_IAM',
    ]

    print("Starting CloudFormation deployment...")
    print("-" * 50)
    
    # Run the command
    run_aws_cli_command(aws_command)

    print("-" * 50)
    print("Deployment command sent to AWS. You can monitor the stack status in the CloudFormation console.")
    print(f"Stack Name: {STACK_NAME}")
    print(f"Region: {AWS_REGION}")


if __name__ == "__main__":
    # Perform a basic check for the template file
    if not os.path.exists(TEMPLATE_FILE):
        print(f"Error: Template file '{TEMPLATE_FILE}' not found.")
        print("Please ensure the template file is in the same directory or update the TEMPLATE_FILE variable.")
        sys.exit(1)

    # Start the deployment process
    deploy_cloudformation_stack()
