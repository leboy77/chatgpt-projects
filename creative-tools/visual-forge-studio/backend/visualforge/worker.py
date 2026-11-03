from __future__ import annotations

import logging
import threading
from typing import Callable

from .config import Settings
from .exporting import export_job_to_desktop
from .pipelines import NonRetryableJobError, run_job
from .providers import ImageProvider
from .store import JobStore


logger = logging.getLogger(__name__)


class WorkerPool:
    def __init__(
        self,
        settings: Settings,
        store: JobStore,
        provider: ImageProvider,
        on_complete: Callable[[str], None] | None = None,
    ):
        self.settings = settings
        self.store = store
        self.provider = provider
        self.on_complete = on_complete
        self._stop = threading.Event()
        self._pause = threading.Event()
        self._threads: list[threading.Thread] = []

    def start(self) -> None:
        if self._threads:
            return
        recovered = self.store.recover_orphaned()
        if recovered:
            logger.info("Recovered %s interrupted job(s)", recovered)
        self._stop.clear()
        for index in range(self.settings.worker_count):
            thread = threading.Thread(
                target=self._worker_loop,
                name=f"visualforge-worker-{index + 1}",
                daemon=True,
            )
            thread.start()
            self._threads.append(thread)

    def stop(self, timeout: float = 10) -> None:
        self._stop.set()
        for thread in self._threads:
            thread.join(timeout=timeout)
        self._threads.clear()

    def pause(self) -> None:
        self._pause.set()

    def resume(self) -> None:
        self._pause.clear()

    @property
    def paused(self) -> bool:
        return self._pause.is_set()

    def _worker_loop(self) -> None:
        while not self._stop.is_set():
            try:
                if self._pause.is_set():
                    self._stop.wait(0.4)
                    continue
                job = self.store.claim_next()
                if job is None:
                    self._stop.wait(0.6)
                    continue
                self._execute(job.id)
            except Exception:
                logger.exception("Worker loop encountered an unexpected error")
                self._stop.wait(1)

    def _execute(self, job_id: str) -> None:
        job = self.store.get(job_id)
        try:
            result = run_job(
                job,
                self.settings,
                self.provider,
                lambda value, text: self.store.update_progress(job_id, value, text),
            )
            export_path = None
            try:
                export_path = str(
                    export_job_to_desktop(
                        self.settings,
                        self.store.get(job_id),
                        result.manifest["path"],
                    )
                )
            except Exception:
                logger.exception("Could not export completed job %s", job_id)
            self.store.mark_succeeded(
                job_id,
                result.assets,
                result.manifest["path"],
                result.message,
                export_path,
            )
        except NonRetryableJobError as exc:
            logger.warning("Job %s failed without retry: %s", job_id, exc)
            self.store.mark_failed(job_id, str(exc), final=True)
        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            status = self.store.mark_failed(job_id, str(exc))
            logger.info("Job %s now has status %s", job_id, status)
        finally:
            if self.on_complete:
                self.on_complete(job_id)

