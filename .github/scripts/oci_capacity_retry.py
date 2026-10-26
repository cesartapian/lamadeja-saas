"""Retry only a verified capacity failure; never print Terraform logs or secrets."""
import json
import os
import re
import subprocess

ACTIVE = {"ACCEPTED", "IN_PROGRESS", "CANCELING"}
CAPACITY = re.compile(r"\bout of (?:host )?capacity\b", re.IGNORECASE)


def command(*args):
    return subprocess.check_output(args, text=True)


def oci(*args):
    return json.loads(command("oci", "resource-manager", *args))['data']


def decision(jobs, messages=""):
    if any(job['lifecycle-state'] in ACTIVE for job in jobs):
        return 'wait'
    if not jobs:
        return 'stop'
    latest = max(jobs, key=lambda job: job['time-created'])
    # Do not recreate resources following a destroy or another operation.
    if latest['operation'] != 'APPLY':
        return 'stop'
    if latest['lifecycle-state'] == 'SUCCEEDED':
        return 'disable'
    if latest['lifecycle-state'] == 'FAILED' and CAPACITY.search(messages):
        return 'retry'
    return 'stop'


def main():
    stack_id = os.environ['STACK_ID']
    if not stack_id:
        raise RuntimeError('Missing OCI_STACK_OCID')
    stack = oci('stack', 'get', '--stack-id', stack_id)
    jobs = oci('job', 'list', '--compartment-id', stack['compartment-id'],
               '--stack-id', stack_id, '--all')
    action = decision(jobs)
    if action == 'stop' and jobs:
        latest = max(jobs, key=lambda job: job['time-created'])
        if latest['operation'] == 'APPLY' and latest['lifecycle-state'] == 'FAILED':
            # Any API/auth/pagination error aborts before create_job.
            logs = oci('job', 'get-job-logs', '--job-id', latest['id'], '--all')
            messages = '\n'.join(entry.get('message') or '' for entry in logs)
            action = decision(jobs, messages)
    if action == 'wait':
        print('OCI job active; waiting for next scheduled check.')
    elif action == 'disable':
        repo = os.environ['GH_REPO']
        workflow_id = command('gh', 'api',
                              f"repos/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
                              '--jq', '.workflow_id').strip()
        command('gh', 'api', '--method', 'PUT',
                f'repos/{repo}/actions/workflows/{workflow_id}/disable')
        print('Apply succeeded; workflow disabled.')
    elif action == 'retry':
        job = oci('job', 'create', '--stack-id', stack_id, '--operation', 'APPLY',
                  '--apply-job-plan-resolution', '{"isAutoApproved":true}',
                  '--display-name', f"github-{os.environ['GITHUB_RUN_ID']}")
        print(f"Capacity retry submitted: {job['id']}")
    else:
        raise RuntimeError('No verified capacity failure in latest job; no Apply submitted. '
                           'Inspect the stack in OCI before continuing.')


if __name__ == '__main__':
    main()
