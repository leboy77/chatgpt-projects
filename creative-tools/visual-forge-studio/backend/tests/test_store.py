from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from visualforge.store import JobStore


class JobStoreTests(unittest.TestCase):
    def test_draft_job_is_not_claimable_until_enqueued(self):
        with tempfile.TemporaryDirectory() as temp:
            store = JobStore(Path(temp) / "jobs.sqlite3")
            job = store.create_job(
                "product_color_finalize",
                {"colors": ["#8C1A2D"]},
                [],
                status="draft",
            )
            self.assertIsNone(store.claim_next())
            store.set_input_assets(job.id, ["master.png", "variant.png"])
            store.enqueue_job(job.id)
            claimed = store.claim_next()
            self.assertIsNotNone(claimed)
            self.assertEqual(claimed.status, "running")
            self.assertEqual(
                claimed.input_assets, ["master.png", "variant.png"]
            )


if __name__ == "__main__":
    unittest.main()
