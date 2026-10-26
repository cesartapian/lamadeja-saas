import unittest
from oci_capacity_retry import decision


def job(state, operation='APPLY', time='2026-10-26T12:00:00Z'):
    return {'lifecycle-state': state, 'operation': operation, 'time-created': time}


class DecisionTests(unittest.TestCase):
    def test_capacity_failure_retries(self):
        for message in ['Error: Out of host capacity.', '500: Out of capacity']:
            self.assertEqual(decision([job('FAILED')], message), 'retry')

    def test_other_errors_and_missing_logs_stop(self):
        for message in ['', 'NotAuthorizedOrNotFound', 'LimitExceeded', 'capacity available']:
            self.assertEqual(decision([job('FAILED')], message), 'stop')

    def test_active_jobs_prevent_apply_and_disable(self):
        for state in ['ACCEPTED', 'IN_PROGRESS', 'CANCELING']:
            self.assertEqual(decision([job('SUCCEEDED'), job(state, 'PLAN')]), 'wait')

    def test_success_disables(self):
        self.assertEqual(decision([job('SUCCEEDED')]), 'disable')

    def test_cancel_destroy_and_empty_stop(self):
        for jobs in [[], [job('CANCELED')], [job('SUCCEEDED', 'DESTROY')]]:
            self.assertEqual(decision(jobs, 'Out of host capacity'), 'stop')

    def test_latest_job_wins(self):
        jobs = [job('FAILED'), job('SUCCEEDED', time='2026-10-26T13:00:00Z')]
        self.assertEqual(decision(jobs, 'Out of host capacity'), 'disable')


if __name__ == '__main__':
    unittest.main()
