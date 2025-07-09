
# Variable declaration
local_file_path = '../index.html'
remote_file_path = 's3://739418138388-ap-south-1-personal-website-website-bucket/'
stack_name = 'personal-website'

# S3 File deployment
print('Copying file index.html from local to s3 bucket')
command = f"aws s3 cp {local_file_path} {remote_file_path}"
print(f"Command: {command}")
print('--' * 20)
os.system(command)
print('--' * 20)

# Get CloudFront Distribution ID from stack outputs
print('Fetching CloudFront Distribution ID from CloudFormation stack outputs...')
get_distribution_id_command = [
    "aws",
    "cloudformation",
    "describe-stacks",
    "--stack-name", stack_name,
    "--query", "Stacks[0].Outputs[?OutputKey=='DistributionID'].OutputValue",
    "--output", "text"
]

result = subprocess.run(get_distribution_id_command, capture_output=True, text=True)

distribution_id = result.stdout.strip()

if not distribution_id:
    print("❌ Could not retrieve Distribution ID. Check if 'DistributionID' is present in Outputs.")
else:
    print(f"✅ CloudFront Distribution ID: {distribution_id}")

    # Invalidate cache
    print('Invalidating CloudFront cache...')
    invalidate_command = [
        "aws",
        "cloudfront",
        "create-invalidation",
        "--distribution-id", distribution_id,
        "--paths", "/index.html"
    ]

    print(f"Running: {' '.join(invalidate_command)}")
    subprocess.run(invalidate_command)
    print('✅ Cache invalidation requested.')