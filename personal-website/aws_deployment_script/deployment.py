import os

local_file_path = '../index.html'
remote_file_path = 's3://739418138388-ap-south-1-personal-website-website-bucket/'
print ('Copying file index.html from local to s3 bucket')
command = f"aws s3 cp {local_file_path} {remote_file_path}"
print(f"Command: {command}")
print ('--' * 20)
os.system(command)
print ('--' * 20)