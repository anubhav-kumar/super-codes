import os
import subprocess

# Variable declaration
stack_name = 'personal-website'

# Stack deployment
stack_deployment_command = f"""aws cloudformation update-stack \
                                --stack-name {stack_name} \
                                --template-body file://template.yml \
                                --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND """
print('Stack deployment command:')
print(stack_deployment_command)
print('--' * 20)
os.system(stack_deployment_command)
print('--' * 20)
